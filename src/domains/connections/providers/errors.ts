/**
 * Typed provider failures. The sync engine stores the code on the connection
 * (last_error_code) and the apps map it to a message and a next action.
 */
export type ConnectionErrorCode =
  | 'RATE_LIMITED'
  | 'PROVIDER_DOWN'
  | 'INVALID_ADDRESS'
  | 'REAUTH_REQUIRED'
  | 'UNKNOWN';

export class ProviderError extends Error {
  constructor(
    readonly code: ConnectionErrorCode,
    message: string,
    readonly status?: number,
  ) {
    super(message);
    this.name = 'ProviderError';
  }
}

export class RateLimitedError extends ProviderError {
  constructor(message = 'The data service is rate limiting requests.', status?: number) {
    super('RATE_LIMITED', message, status);
    this.name = 'RateLimitedError';
  }
}

export class ProviderDownError extends ProviderError {
  constructor(message = 'The data service is unavailable.', status?: number) {
    super('PROVIDER_DOWN', message, status);
    this.name = 'ProviderDownError';
  }
}

export class InvalidAddressError extends ProviderError {
  constructor(message = 'That address is not valid for this network.') {
    super('INVALID_ADDRESS', message, 400);
    this.name = 'InvalidAddressError';
  }
}

export class AuthRevokedError extends ProviderError {
  constructor(message = 'Access to this account was revoked. Reconnect it.') {
    super('REAUTH_REQUIRED', message, 401);
    this.name = 'AuthRevokedError';
  }
}

export const errorCodeOf = (error: unknown): ConnectionErrorCode =>
  error instanceof ProviderError ? error.code : 'UNKNOWN';
