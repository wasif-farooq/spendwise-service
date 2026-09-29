import speakeasy from 'speakeasy';
import { AppError } from '@shared/errors/AppError';
import { Password } from '@shared/types/Password';
import { BackupCode } from '@shared/types/BackupCode';
import { DatabaseFacade } from '@facades/DatabaseFacade';
import { generateAccountDeletedEmail } from '@domains/email/EmailTemplates';
import type { IEmailService } from '@domains/email/EmailService';
import type { PaddleSubscription } from '@domains/payment/services/PaddleGateway';
import { PADDLE_APP_TAG } from '@domains/payment/services/PaddleGateway';
import { User } from '../models/User';
import { IUserRepository } from '../repositories/IUserRepository';
import { IAuthRepository } from '../repositories/IAuthRepository';
import type {
  AccountDeletionRepository,
  DeletableSubscription,
  StoredObject,
  WorkspaceMembershipRow,
} from '../repositories/AccountDeletionRepository';

/** Machine-readable reasons DELETE /auth/account can fail with (`code` in the body). */
export const ACCOUNT_DELETION_ERRORS = {
  PASSWORD_REQUIRED: 'PASSWORD_REQUIRED',
  INVALID_PASSWORD: 'INVALID_PASSWORD',
  CONFIRMATION_REQUIRED: 'CONFIRMATION_REQUIRED',
  TWO_FACTOR_REQUIRED: 'TWO_FACTOR_REQUIRED',
  INVALID_TWO_FACTOR_CODE: 'INVALID_TWO_FACTOR_CODE',
  TOO_MANY_ATTEMPTS: 'TOO_MANY_ATTEMPTS',
  OWNED_SHARED_WORKSPACES: 'OWNED_SHARED_WORKSPACES',
  SUBSCRIPTION_CANCEL_FAILED: 'SUBSCRIPTION_CANCEL_FAILED',
  USER_NOT_FOUND: 'USER_NOT_FOUND',
} as const;

export type AccountDeletionErrorCode =
  (typeof ACCOUNT_DELETION_ERRORS)[keyof typeof ACCOUNT_DELETION_ERRORS];

/** The text a user without a password types to confirm. */
export const DELETE_CONFIRMATION = 'DELETE';

export interface BlockingWorkspace {
  id: string;
  name: string;
  /** Members other than the user. */
  memberCount: number;
}

export interface WorkspaceRef {
  id: string;
  name: string;
}

export class AccountDeletionError extends AppError {
  constructor(
    message: string,
    statusCode: number,
    public readonly code: AccountDeletionErrorCode,
    public readonly workspaces?: BlockingWorkspace[],
  ) {
    super(message, statusCode);
  }
}

export interface DeleteAccountInput {
  password?: string;
  confirm?: string;
  twoFactorCode?: string;
}

export interface DeletionPreview {
  hasPassword: boolean;
  twoFactorEnabled: boolean;
  /** 'authenticator' accepts a 6-digit app code; every method accepts an 8-digit backup code. */
  twoFactorMethods: Array<'authenticator' | 'sms' | 'email'>;
  workspacesToDelete: WorkspaceRef[];
  workspacesToLeave: WorkspaceRef[];
  blockingWorkspaces: BlockingWorkspace[];
  hasActiveSubscription: boolean;
}

export interface DeletionResult {
  deleted: true;
  deletedWorkspaces: number;
  leftWorkspaces: number;
  subscriptionCancelled: boolean;
}

/** The part of PaddleGateway this flow uses. */
export interface PaddleSubscriptionsApi {
  getSubscription(id: string): Promise<PaddleSubscription>;
  cancelSubscription(id: string, cancelAtPeriodEnd?: boolean): Promise<void>;
}

/** The part of StorageService this flow uses. */
export interface ObjectStorage {
  deleteObjects(objects: StoredObject[]): Promise<number>;
  deletePrefix(bucket: string, prefix: string): Promise<number>;
  getBucket(type: 'receipts' | 'avatars' | 'attachments'): string;
}

export interface KeyValueCache {
  get(key: string): Promise<string | null>;
  set(key: string, value: string, options?: unknown): Promise<unknown>;
  del(key: string | string[]): Promise<unknown>;
}

type Repository = Pick<
  AccountDeletionRepository,
  'findWorkspaces' | 'findSubscriptions' | 'findWorkspaceObjects' | 'deleteUserData'
>;

export interface AccountDeletionDeps {
  db: Pick<DatabaseFacade, 'transaction'>;
  repository: Repository;
  userRepo: Pick<IUserRepository, 'findById'>;
  authRepo: Pick<IAuthRepository, 'findByUserIdAndProvider'>;
  /** Null when Paddle isn't configured. Resolved only when a subscription needs it. */
  getPaddle: () => PaddleSubscriptionsApi | null;
  /** Null when object storage can't be set up; cleanup is then skipped (and logged). */
  getStorage: () => ObjectStorage | null;
  mailer: Pick<IEmailService, 'send'>;
  cache?: KeyValueCache | null;
  /**
   * Runs the post-commit cleanup (S3, Redis, email). Defaults to fire-and-forget so a slow
   * or unreachable S3 never holds the response; tests pass a collector to await it.
   */
  runInBackground?: (task: Promise<void>) => void;
  logger?: Pick<Console, 'warn' | 'error' | 'info'>;
}

/** Local statuses that need no cancelling. */
const ENDED_STATUSES = new Set(['cancelled', 'canceled', 'expired']);

/** Shared with the sign-in 2FA challenge: guesses here count against the same budget. */
const MAX_2FA_ATTEMPTS = 5;
const attemptsKey = (userId: string) => `2fa_attempts:${userId}`;

const refOf = (w: WorkspaceMembershipRow): WorkspaceRef => ({ id: w.id, name: w.name });

export function classifyWorkspaces(userId: string, rows: WorkspaceMembershipRow[]) {
  const owned = rows.filter((w) => w.ownerId === userId);
  return {
    // Owned and nobody else in it: deleted with the account.
    toDelete: owned.filter((w) => w.otherMembers === 0),
    // Owned with other members: the user has to deal with these first.
    blocking: owned
      .filter((w) => w.otherMembers > 0)
      .map((w) => ({ id: w.id, name: w.name, memberCount: w.otherMembers })),
    // Someone else's workspace: only the membership goes.
    toLeave: rows.filter((w) => w.ownerId !== userId),
  };
}

const isLiveProviderSubscription = (s: DeletableSubscription) =>
  s.paymentProvider === 'paddle' &&
  !!s.merchantSubscriptionId &&
  !ENDED_STATUSES.has((s.status ?? '').toLowerCase());

const methodName = (type: string): 'authenticator' | 'sms' | 'email' =>
  type === 'app' ? 'authenticator' : (type as 'sms' | 'email');

/**
 * Hard-deletes the signed-in user (DELETE /auth/account), immediately and in one
 * transaction. See `deleteAccount` for the order of operations.
 */
export class AccountDeletionService {
  private readonly log: Pick<Console, 'warn' | 'error' | 'info'>;
  private readonly runInBackground: (task: Promise<void>) => void;

  constructor(private readonly deps: AccountDeletionDeps) {
    this.log = deps.logger ?? console;
    this.runInBackground =
      deps.runInBackground ??
      ((task) => {
        task.catch((error) => this.log.error('[AccountDeletion] cleanup failed', error));
      });
  }

  private async loadUser(userId: string): Promise<User> {
    const user = await this.deps.userRepo.findById(userId);
    if (!user) {
      throw new AccountDeletionError('User not found', 404, ACCOUNT_DELETION_ERRORS.USER_NOT_FOUND);
    }
    return user;
  }

  private async passwordHashOf(userId: string): Promise<string | null> {
    const identity = await this.deps.authRepo.findByUserIdAndProvider(userId, 'local');
    return identity?.passwordHash || null;
  }

  private blockedError(blocking: BlockingWorkspace[]) {
    const names = blocking.map((w) => w.name).join(', ');
    return new AccountDeletionError(
      `You own shared workspaces (${names}). Delete them, or remove their other members, before deleting your account.`,
      409,
      ACCOUNT_DELETION_ERRORS.OWNED_SHARED_WORKSPACES,
      blocking,
    );
  }

  /** What deleting the account would do, and what the client has to ask for. */
  async preview(userId: string): Promise<DeletionPreview> {
    const user = await this.loadUser(userId);
    const [hash, rows, subscriptions] = await Promise.all([
      this.passwordHashOf(userId),
      this.deps.repository.findWorkspaces(userId),
      this.deps.repository.findSubscriptions(userId),
    ]);
    const { toDelete, toLeave, blocking } = classifyWorkspaces(userId, rows);

    return {
      hasPassword: !!hash,
      twoFactorEnabled: user.twoFactorEnabled,
      twoFactorMethods: user.twoFactorEnabled
        ? user.twoFactorMethods.filter((m) => m.verified).map((m) => methodName(m.type))
        : [],
      workspacesToDelete: toDelete.map(refOf),
      workspacesToLeave: toLeave.map(refOf),
      blockingWorkspaces: blocking,
      hasActiveSubscription: subscriptions.some(isLiveProviderSubscription),
    };
  }

  /**
   * 1. Re-authenticate: the password (or the typed confirmation when the account has
   *    none, i.e. Google-only), then the second factor when 2FA is on.
   * 2. In one transaction: lock the user's workspaces, refuse (409) if any they own has
   *    other members, cancel a live Paddle subscription immediately (abort if that
   *    fails), delete the solo workspaces with all their data, then the user.
   * 3. After commit, best-effort: delete the stored files (receipts, logos, avatar),
   *    clear Redis keys, send the confirmation email.
   */
  async deleteAccount(userId: string, input: DeleteAccountInput): Promise<DeletionResult> {
    const user = await this.loadUser(userId);
    await this.reauthenticate(user, input);

    // Cheap check before touching Paddle; repeated under lock below.
    const early = classifyWorkspaces(userId, await this.deps.repository.findWorkspaces(userId));
    if (early.blocking.length > 0) throw this.blockedError(early.blocking);

    const outcome = await this.deps.db.transaction(async (trx) => {
      const rows = await this.deps.repository.findWorkspaces(userId, { db: trx, lock: true });
      const { toDelete, toLeave, blocking } = classifyWorkspaces(userId, rows);
      if (blocking.length > 0) throw this.blockedError(blocking);

      const workspaceIds = toDelete.map((w) => w.id);
      const objects = await this.deps.repository.findWorkspaceObjects(workspaceIds, { db: trx });

      const subscriptions = await this.deps.repository.findSubscriptions(userId, { db: trx });
      // Inside the transaction on purpose: if Paddle refuses, nothing is deleted.
      const subscriptionCancelled = await this.cancelSubscriptions(userId, subscriptions);

      const deleted = await this.deps.repository.deleteUserData(trx, {
        userId,
        email: user.email,
        workspaceIds,
      });
      if (deleted.users !== 1) {
        throw new AccountDeletionError(
          'User not found',
          404,
          ACCOUNT_DELETION_ERRORS.USER_NOT_FOUND,
        );
      }

      return {
        objects,
        subscriptionCancelled,
        deletedWorkspaces: toDelete,
        leftWorkspaces: toLeave,
      };
    });

    this.runInBackground(
      this.cleanUp(user, outcome.objects, {
        deletedWorkspaces: outcome.deletedWorkspaces.map((w) => w.name),
        leftWorkspaces: outcome.leftWorkspaces.map((w) => w.name),
        subscriptionCancelled: outcome.subscriptionCancelled,
      }),
    );

    return {
      deleted: true,
      deletedWorkspaces: outcome.deletedWorkspaces.length,
      leftWorkspaces: outcome.leftWorkspaces.length,
      subscriptionCancelled: outcome.subscriptionCancelled,
    };
  }

  private async reauthenticate(user: User, input: DeleteAccountInput): Promise<void> {
    const hash = await this.passwordHashOf(user.id);

    if (hash) {
      if (!input.password) {
        throw new AccountDeletionError(
          'Enter your password to delete your account',
          400,
          ACCOUNT_DELETION_ERRORS.PASSWORD_REQUIRED,
        );
      }
      // 400, not 401: a 401 would read as an expired session to the clients.
      if (!(await Password.fromHash(hash).compare(input.password))) {
        throw new AccountDeletionError(
          'Incorrect password',
          400,
          ACCOUNT_DELETION_ERRORS.INVALID_PASSWORD,
        );
      }
    } else if (input.confirm !== DELETE_CONFIRMATION) {
      throw new AccountDeletionError(
        `Type ${DELETE_CONFIRMATION} to confirm`,
        400,
        ACCOUNT_DELETION_ERRORS.CONFIRMATION_REQUIRED,
      );
    }

    if (user.twoFactorEnabled) {
      await this.verifySecondFactor(user, input.twoFactorCode);
    }
  }

  /** A 6-digit authenticator code, or an 8-digit backup code (which works for every method). */
  private async verifySecondFactor(user: User, code: string | undefined): Promise<void> {
    if (!code) {
      throw new AccountDeletionError(
        'Enter a code from your authenticator app, or a backup code',
        400,
        ACCOUNT_DELETION_ERRORS.TWO_FACTOR_REQUIRED,
      );
    }

    const cache = this.deps.cache;
    const attempts = cache ? Number((await cache.get(attemptsKey(user.id))) ?? 0) : 0;
    if (attempts >= MAX_2FA_ATTEMPTS) {
      throw new AccountDeletionError(
        'Too many attempts. Please try again in 15 minutes.',
        429,
        ACCOUNT_DELETION_ERRORS.TOO_MANY_ATTEMPTS,
      );
    }

    let valid = false;
    if (/^\d{8}$/.test(code)) {
      valid = await BackupCode.matches(code, user.backupCodes);
    } else if (/^\d{6}$/.test(code)) {
      const hasApp = user.twoFactorMethods.some((m) => m.type === 'app' && m.verified);
      if (hasApp && user.twoFactorSecret) {
        valid = speakeasy.totp.verify({
          secret: user.twoFactorSecret,
          encoding: 'base32',
          token: code,
        });
      }
    }

    if (!valid) {
      if (cache) await cache.set(attemptsKey(user.id), String(attempts + 1), { EX: 900 });
      throw new AccountDeletionError(
        'Invalid verification code',
        400,
        ACCOUNT_DELETION_ERRORS.INVALID_TWO_FACTOR_CODE,
      );
    }
  }

  /**
   * Cancels, immediately, the Paddle subscriptions this user pays for. Only ones SpendWise
   * created for this user are touched (custom_data app tag and user id): the Paddle account
   * is shared with another product. Any failure aborts the deletion, so nobody is left
   * paying for an account that no longer exists.
   */
  private async cancelSubscriptions(
    userId: string,
    subscriptions: DeletableSubscription[],
  ): Promise<boolean> {
    const live = subscriptions.filter(isLiveProviderSubscription);
    if (live.length === 0) return false;

    const failed = (detail: string) =>
      new AccountDeletionError(
        `We couldn't cancel your subscription, so your account was not deleted. Please try again later. (${detail})`,
        502,
        ACCOUNT_DELETION_ERRORS.SUBSCRIPTION_CANCEL_FAILED,
      );

    let paddle: PaddleSubscriptionsApi | null;
    try {
      paddle = this.deps.getPaddle();
    } catch {
      paddle = null;
    }
    if (!paddle) throw failed('billing is not configured');

    let cancelled = false;
    for (const sub of live) {
      const id = sub.merchantSubscriptionId as string;
      let remote: PaddleSubscription;
      try {
        remote = await paddle.getSubscription(id);
      } catch (error) {
        // Unknown to Paddle (e.g. a sandbox id in another environment): nothing bills.
        if ((error as AppError).statusCode === 404) {
          this.log.warn(`[AccountDeletion] Paddle has no subscription ${id}; skipping`);
          continue;
        }
        throw failed((error as Error).message);
      }

      const custom = remote.custom_data;
      if (!custom || custom.app !== PADDLE_APP_TAG || custom.userId !== userId) {
        this.log.warn(
          `[AccountDeletion] Paddle subscription ${id} is not this user's; not touched`,
        );
        continue;
      }
      if (remote.status === 'canceled') continue;

      try {
        await paddle.cancelSubscription(id, false);
      } catch (error) {
        throw failed((error as Error).message);
      }
      cancelled = true;
    }
    return cancelled;
  }

  private async cleanUp(
    user: User,
    objects: StoredObject[],
    summary: {
      deletedWorkspaces: string[];
      leftWorkspaces: string[];
      subscriptionCancelled: boolean;
    },
  ): Promise<void> {
    const tasks: Array<[string, () => Promise<unknown>]> = [
      [
        'storage',
        async () => {
          const storage = this.deps.getStorage();
          if (!storage) throw new Error('object storage is not configured');
          const files = await storage.deleteObjects(objects);
          const avatars = await storage.deletePrefix(
            storage.getBucket('avatars'),
            `avatars/${user.id}/`,
          );
          return { files, avatars };
        },
      ],
      [
        'cache',
        async () => {
          if (!this.deps.cache) return;
          await this.deps.cache.del([
            attemptsKey(user.id),
            ...['app', 'sms', 'email'].map((m) => `2fa_pending:${user.id}:${m}`),
            ...['sms', 'email'].map((m) => `2fa_login:${user.id}:${m}`),
            `reset_code:${user.email}`,
          ]);
        },
      ],
      [
        'email',
        async () => {
          const email = generateAccountDeletedEmail({ firstName: user.firstName, ...summary });
          const result = await this.deps.mailer.send({ to: user.email, ...email });
          if (!result.success) throw new Error(result.error || 'send failed');
        },
      ],
    ];

    const results = await Promise.allSettled(tasks.map(([, run]) => run()));
    results.forEach((result, i) => {
      if (result.status === 'rejected') {
        // Logged, not thrown: the account is already gone. No email address in the log.
        this.log.warn(
          `[AccountDeletion] ${tasks[i][0]} cleanup failed for deleted user ${user.id}: ${
            (result.reason as Error)?.message ?? result.reason
          }`,
        );
      }
    });
  }
}
