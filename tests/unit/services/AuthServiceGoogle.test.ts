import { AuthService } from '@domains/auth/services/AuthService';
import { resolveTwoFactorTempToken } from '@domains/auth/services/TwoFactorTempToken';
import { User } from '@domains/auth/models/User';
import { AuthIdentity } from '@domains/auth/models/AuthIdentity';
import { AppError } from '@shared/errors/AppError';
import { googleLoginSchema } from '@domains/auth/validators/auth.validation';
import jwt from 'jsonwebtoken';

const WEB_CLIENT_ID = 'web-client.apps.googleusercontent.com';
const IOS_CLIENT_ID = 'ios-client.apps.googleusercontent.com';
const ANDROID_CLIENT_ID = 'android-client.apps.googleusercontent.com';

// Mutable so individual tests can simulate a missing configuration.
const googleConfig: Record<string, any> = {};
const resetGoogleConfig = () => {
  Object.keys(googleConfig).forEach((key) => delete googleConfig[key]);
  Object.assign(googleConfig, {
    clientId: WEB_CLIENT_ID,
    clientSecret: 'web-secret',
    redirectUri: 'http://localhost:3000/auth/google/callback',
    mobileClientIds: [IOS_CLIENT_ID, ANDROID_CLIENT_ID],
  });
};

jest.mock('@config/ConfigLoader', () => ({
  ConfigLoader: {
    getInstance: () => ({
      get: (key: string) => {
        const values: Record<string, any> = {
          'auth.jwt.secret': 'unit-test-secret',
          'auth.jwt.accessTokenExpiry': '15m',
          'auth.jwt.refreshTokenExpiry': '7d',
          'auth.social.google': googleConfig,
        };
        return values[key];
      },
    }),
  },
}));

const USER_ID = '22222222-2222-4222-8222-222222222222';
const GOOGLE_SUB = '109876543210987654321';

const buildUser = (overrides: Partial<any> = {}): User =>
  User.restore(
    {
      email: 'user@example.com',
      firstName: 'Existing',
      lastName: 'User',
      isActive: true,
      status: 'active',
      role: 'free' as any,
      emailVerified: true,
      createdAt: new Date(),
      updatedAt: new Date(),
      twoFactorEnabled: false,
      ...overrides,
    } as any,
    USER_ID,
  );

const buildService = (existingUser: User | null, existingIdentity: AuthIdentity | null = null) => {
  const userRepo = {
    findById: jest.fn(),
    findByEmail: jest.fn().mockResolvedValue(existingUser),
    save: jest.fn().mockResolvedValue(undefined),
  };
  const savedIdentities: AuthIdentity[] = [];
  const authRepo = {
    findByUserIdAndProvider: jest.fn().mockImplementation(async () => {
      return existingIdentity ?? savedIdentities[savedIdentities.length - 1] ?? null;
    }),
    save: jest.fn().mockImplementation(async (identity: AuthIdentity) => {
      savedIdentities.push(identity);
    }),
  };
  const workspaceMembersRepository = { findByUserId: jest.fn().mockResolvedValue([{}]) };
  const workspaceService = { create: jest.fn().mockResolvedValue({}) };
  const subscriptionService = {
    getCurrentSubscription: jest.fn().mockResolvedValue({ id: 'sub' }),
    createFreeSubscription: jest.fn().mockResolvedValue({}),
  };

  const service = new AuthService(
    {} as any,
    userRepo as any,
    authRepo as any,
    {} as any,
    {} as any,
    workspaceMembersRepository as any,
    workspaceService as any,
    subscriptionService as any,
  );

  return {
    service,
    userRepo,
    authRepo,
    savedIdentities,
    workspaceService,
    subscriptionService,
  };
};

// AuthIdentity exposes no getter for sub; read the persisted props directly.
const subOf = (identity: AuthIdentity) => (identity as any).props.sub;

const validClaims = (overrides: Record<string, unknown> = {}) => ({
  iss: 'https://accounts.google.com',
  aud: IOS_CLIENT_ID,
  azp: IOS_CLIENT_ID,
  sub: GOOGLE_SUB,
  email: 'user@example.com',
  email_verified: 'true',
  name: 'Jane Doe',
  given_name: 'Jane',
  family_name: 'Doe',
  exp: String(Math.floor(Date.now() / 1000) + 3600),
  ...overrides,
});

const jsonResponse = (body: unknown, ok = true, status = ok ? 200 : 400) =>
  ({
    ok,
    status,
    json: async () => body,
    text: async () => JSON.stringify(body),
  }) as any;

let fetchMock: jest.Mock;
const originalFetch = global.fetch;

beforeEach(() => {
  resetGoogleConfig();
  fetchMock = jest.fn();
  global.fetch = fetchMock as any;
  jest.spyOn(console, 'error').mockImplementation(() => undefined);
});

afterEach(() => {
  global.fetch = originalFetch;
  jest.restoreAllMocks();
});

const expectInvalidToken = async (promise: Promise<unknown>) => {
  await expect(promise).rejects.toBeInstanceOf(AppError);
  await expect(promise).rejects.toMatchObject({
    message: 'Invalid Google ID token',
    statusCode: 401,
  });
};

describe('AuthService.loginWithGoogleIdToken', () => {
  it('verifies the token with tokeninfo', async () => {
    const { service } = buildService(buildUser());
    fetchMock.mockResolvedValueOnce(jsonResponse(validClaims()));

    await service.loginWithGoogleIdToken('the.id.token');

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0][0]).toBe(
      'https://oauth2.googleapis.com/tokeninfo?id_token=the.id.token',
    );
  });

  it('logs in an existing user and links the Google identity', async () => {
    const existing = buildUser();
    const { service, savedIdentities, userRepo } = buildService(existing);
    fetchMock.mockResolvedValueOnce(jsonResponse(validClaims()));

    const result = await service.loginWithGoogleIdToken('the.id.token');

    expect(userRepo.findByEmail).toHaveBeenCalledWith('user@example.com');
    expect(result.user).toBe(existing);
    expect(result.requiresTwoFactor).toBeUndefined();
    expect(typeof result.token).toBe('string');
    expect(typeof result.refreshToken).toBe('string');
    const decoded = jwt.verify(result.token!, 'unit-test-secret') as any;
    expect(decoded.userId ?? decoded.sub ?? decoded.id).toBe(USER_ID);

    expect(savedIdentities[0].provider).toBe('google');
    expect(subOf(savedIdentities[0])).toBe(GOOGLE_SUB);
    expect(savedIdentities[0].userId).toBe(USER_ID);
  });

  it('creates a new user with a free subscription and workspace', async () => {
    const { service, userRepo, savedIdentities, subscriptionService, workspaceService } =
      buildService(null);
    fetchMock.mockResolvedValueOnce(
      jsonResponse(validClaims({ email: 'new@example.com', aud: ANDROID_CLIENT_ID })),
    );

    const result = await service.loginWithGoogleIdToken('the.id.token');

    expect(result.user?.email).toBe('new@example.com');
    expect(result.user?.firstName).toBe('Jane');
    expect(result.user?.lastName).toBe('Doe');
    expect(result.user?.emailVerified).toBe(true);
    expect(userRepo.save).toHaveBeenCalled();
    expect(subOf(savedIdentities[0])).toBe(GOOGLE_SUB);
    expect(subscriptionService.createFreeSubscription).toHaveBeenCalledWith(result.user?.id);
    expect(workspaceService.create).toHaveBeenCalledWith(
      result.user?.id,
      expect.objectContaining({ name: 'My Account' }),
    );
    expect(typeof result.token).toBe('string');
  });

  it('accepts the web client id as an audience and a boolean email_verified', async () => {
    const { service } = buildService(buildUser());
    fetchMock.mockResolvedValueOnce(
      jsonResponse(
        validClaims({ aud: WEB_CLIENT_ID, iss: 'accounts.google.com', email_verified: true }),
      ),
    );

    const result = await service.loginWithGoogleIdToken('the.id.token');
    expect(typeof result.token).toBe('string');
  });

  it('starts the 2FA challenge for a user with 2FA enabled', async () => {
    const user = buildUser({
      twoFactorEnabled: true,
      twoFactorMethod: 'email',
      twoFactorMethods: [
        { type: 'email', verified: true },
        { type: 'app', verified: true },
      ],
    });
    const { service } = buildService(user);
    fetchMock.mockResolvedValueOnce(jsonResponse(validClaims()));

    const result = await service.loginWithGoogleIdToken('the.id.token');

    expect(result.requiresTwoFactor).toBe(true);
    expect(result.token).toBeUndefined();
    expect(result.refreshToken).toBeUndefined();
    expect(result.availableMethods).toEqual([
      { type: 'email', enabled: true, verified: true },
      { type: 'authenticator', enabled: true, verified: true },
    ]);
    expect(resolveTwoFactorTempToken(result.tempToken!)).toBe(USER_ID);
  });

  it('rejects a token issued to another client id', async () => {
    const { service, userRepo } = buildService(buildUser());
    fetchMock.mockResolvedValueOnce(
      jsonResponse(validClaims({ aud: 'someone-else.apps.googleusercontent.com' })),
    );

    await expectInvalidToken(service.loginWithGoogleIdToken('the.id.token'));
    expect(userRepo.findByEmail).not.toHaveBeenCalled();
  });

  it('rejects an unverified email', async () => {
    const { service, userRepo } = buildService(buildUser());
    fetchMock.mockResolvedValue(jsonResponse(validClaims({ email_verified: 'false' })));

    await expectInvalidToken(service.loginWithGoogleIdToken('the.id.token'));

    fetchMock.mockResolvedValue(jsonResponse(validClaims({ email_verified: undefined })));
    await expectInvalidToken(service.loginWithGoogleIdToken('the.id.token'));
    expect(userRepo.findByEmail).not.toHaveBeenCalled();
  });

  it('rejects an expired token', async () => {
    const { service } = buildService(buildUser());
    fetchMock.mockResolvedValue(
      jsonResponse(validClaims({ exp: String(Math.floor(Date.now() / 1000) - 10) })),
    );

    await expectInvalidToken(service.loginWithGoogleIdToken('the.id.token'));
  });

  it('rejects a token from an unexpected issuer', async () => {
    const { service } = buildService(buildUser());
    fetchMock.mockResolvedValue(jsonResponse(validClaims({ iss: 'https://evil.example.com' })));

    await expectInvalidToken(service.loginWithGoogleIdToken('the.id.token'));
  });

  it('rejects a token missing sub or email', async () => {
    const { service } = buildService(buildUser());
    fetchMock.mockResolvedValue(jsonResponse(validClaims({ sub: undefined })));
    await expectInvalidToken(service.loginWithGoogleIdToken('the.id.token'));

    fetchMock.mockResolvedValue(jsonResponse(validClaims({ email: '' })));
    await expectInvalidToken(service.loginWithGoogleIdToken('the.id.token'));
  });

  it('rejects when tokeninfo does not return OK', async () => {
    const { service, userRepo } = buildService(buildUser());
    fetchMock.mockResolvedValue(jsonResponse({ error: 'invalid_token' }, false, 400));

    await expectInvalidToken(service.loginWithGoogleIdToken('garbage'));
    expect(userRepo.findByEmail).not.toHaveBeenCalled();
  });

  it('rejects when tokeninfo cannot be reached', async () => {
    const { service } = buildService(buildUser());
    fetchMock.mockRejectedValue(new Error('network down'));

    await expectInvalidToken(service.loginWithGoogleIdToken('the.id.token'));
  });

  it('reports Google OAuth as not configured when no client ids are set', async () => {
    delete googleConfig.clientId;
    googleConfig.mobileClientIds = [];
    const { service } = buildService(buildUser());

    const promise = service.loginWithGoogleIdToken('the.id.token');
    await expect(promise).rejects.toMatchObject({
      message: 'Google OAuth not configured',
      statusCode: 500,
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('works with only mobile client ids configured', async () => {
    delete googleConfig.clientId;
    delete googleConfig.clientSecret;
    const { service } = buildService(buildUser());
    fetchMock.mockResolvedValueOnce(jsonResponse(validClaims()));

    const result = await service.loginWithGoogleIdToken('the.id.token');
    expect(typeof result.token).toBe('string');
  });
});

describe('AuthService.loginWithGoogle (authorization code)', () => {
  it('exchanges the code, reads userinfo and logs the user in', async () => {
    const existing = buildUser();
    const { service, savedIdentities } = buildService(existing);
    fetchMock
      .mockResolvedValueOnce(jsonResponse({ access_token: 'access-123', id_token: 'x' }))
      .mockResolvedValueOnce(
        jsonResponse({
          id: GOOGLE_SUB,
          email: 'user@example.com',
          verified_email: true,
          given_name: 'Jane',
        }),
      );

    const result = await service.loginWithGoogle('auth-code');

    expect(fetchMock).toHaveBeenCalledTimes(2);
    const [tokenUrl, tokenInit] = fetchMock.mock.calls[0];
    expect(tokenUrl).toBe('https://oauth2.googleapis.com/token');
    const params = new URLSearchParams(tokenInit.body);
    expect(params.get('code')).toBe('auth-code');
    expect(params.get('client_id')).toBe(WEB_CLIENT_ID);
    expect(params.get('client_secret')).toBe('web-secret');
    expect(params.get('redirect_uri')).toBe('http://localhost:3000/auth/google/callback');
    expect(params.get('grant_type')).toBe('authorization_code');

    const [userInfoUrl, userInfoInit] = fetchMock.mock.calls[1];
    expect(userInfoUrl).toBe('https://www.googleapis.com/oauth2/v2/userinfo');
    expect(userInfoInit.headers.Authorization).toBe('Bearer access-123');

    expect(result.user).toBe(existing);
    expect(typeof result.token).toBe('string');
    expect(subOf(savedIdentities[0])).toBe(GOOGLE_SUB);
  });

  it.each([
    ['false', { verified_email: false }],
    ['missing', {}],
    ['a truthy non-boolean', { verified_email: 'true' }],
  ])('refuses an unverified Google email (%s) without touching any account', async (_label, extra) => {
    const { service, userRepo, savedIdentities } = buildService(buildUser());
    fetchMock
      .mockResolvedValueOnce(jsonResponse({ access_token: 'access-123', id_token: 'x' }))
      .mockResolvedValueOnce(jsonResponse({ id: GOOGLE_SUB, email: 'user@example.com', ...extra }));

    await expect(service.loginWithGoogle('auth-code')).rejects.toMatchObject({
      message: 'Google account email is not verified',
      statusCode: 401,
    });
    expect(userRepo.findByEmail).not.toHaveBeenCalled();
    expect(savedIdentities).toHaveLength(0);
  });

  it('rejects userinfo without an id or email', async () => {
    const { service } = buildService(buildUser());
    fetchMock
      .mockResolvedValueOnce(jsonResponse({ access_token: 'access-123', id_token: 'x' }))
      .mockResolvedValueOnce(jsonResponse({ verified_email: true, email: 'user@example.com' }));

    await expect(service.loginWithGoogle('auth-code')).rejects.toMatchObject({ statusCode: 500 });
  });

  it('rejects a bad authorization code with 400', async () => {
    const { service } = buildService(buildUser());
    fetchMock.mockResolvedValueOnce(jsonResponse({ error: 'invalid_grant' }, false, 400));

    await expect(service.loginWithGoogle('bad')).rejects.toMatchObject({
      message: 'Invalid Google authorization code',
      statusCode: 400,
    });
  });

  it('still requires the web client secret', async () => {
    delete googleConfig.clientSecret;
    const { service } = buildService(buildUser());

    await expect(service.loginWithGoogle('auth-code')).rejects.toMatchObject({
      message: 'Google OAuth not configured',
      statusCode: 500,
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe('googleLoginSchema', () => {
  const parse = (body: any) => googleLoginSchema.parse({ body });

  it('accepts a code', () => {
    expect(parse({ code: 'abc' }).body).toEqual({ code: 'abc' });
  });

  it('accepts an idToken', () => {
    expect(parse({ idToken: 'a.b.c' }).body).toEqual({ idToken: 'a.b.c' });
  });

  it('strips undeclared keys', () => {
    expect(parse({ code: 'abc', redirectUri: 'x', role: 'admin' }).body).toEqual({ code: 'abc' });
  });

  it('requires one of code or idToken', () => {
    expect(() => parse({})).toThrow(/Authorization code or ID token required/);
    expect(() => parse({ code: '', idToken: '' })).toThrow();
  });

  it('rejects non-string values', () => {
    expect(() => parse({ idToken: 123 })).toThrow();
  });
});
