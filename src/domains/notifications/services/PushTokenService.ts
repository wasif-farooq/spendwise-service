import { AppError } from '@shared/errors/AppError';
import { PushToken, RegisterPushTokenInput } from '../models/PushToken';
import { PushTokenRepository } from '../repositories/PushTokenRepository';

/**
 * Stores the Expo push tokens of the signed-in user's devices. Sending notifications is
 * not implemented yet; a sender can read the tokens with `listForUser`.
 */
export class PushTokenService {
  constructor(
    private repository: Pick<PushTokenRepository, 'upsert' | 'deleteForUser' | 'findByUser'>,
  ) {}

  async register(userId: string, input: RegisterPushTokenInput): Promise<PushToken> {
    if (!userId) throw new AppError('Unauthorized', 401);
    return this.repository.upsert(userId, input);
  }

  /** Idempotent: unknown tokens, or tokens of another user, are left alone without an error. */
  async unregister(userId: string, token: string): Promise<boolean> {
    if (!userId) throw new AppError('Unauthorized', 401);
    return this.repository.deleteForUser(userId, token);
  }

  async listForUser(userId: string): Promise<PushToken[]> {
    return this.repository.findByUser(userId);
  }
}
