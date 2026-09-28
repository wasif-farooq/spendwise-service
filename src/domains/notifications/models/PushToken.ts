export type PushPlatform = 'ios' | 'android';

/** An Expo push token registered by one install of the mobile app. */
export interface PushToken {
  id: string;
  userId: string;
  token: string;
  platform: PushPlatform;
  deviceName: string | null;
  appVersion: string | null;
  createdAt: Date;
  updatedAt: Date;
  lastSeenAt: Date;
}

export interface RegisterPushTokenInput {
  token: string;
  platform: PushPlatform;
  deviceName?: string;
  appVersion?: string;
}
