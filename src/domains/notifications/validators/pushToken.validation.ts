import { z } from 'zod';

/**
 * Expo push tokens look like `ExponentPushToken[xxxxxxxxxxxxxxxxxxxxxx]` (older SDKs) or
 * `ExpoPushToken[...]`. Only these are accepted: they are what the Expo push service sends to.
 */
export const EXPO_PUSH_TOKEN = /^Expo(nent)?PushToken\[[A-Za-z0-9_-]{1,200}\]$/;

const token = z.string().trim().max(255).regex(EXPO_PUSH_TOKEN, 'Invalid Expo push token');

export const RegisterPushTokenSchema = z.object({
  token,
  platform: z.enum(['ios', 'android']),
  deviceName: z.string().trim().max(100).optional(),
  appVersion: z.string().trim().max(30).optional(),
});

export const PushTokenParamsSchema = z.object({ token });
