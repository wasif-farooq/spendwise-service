import type { ConnectionKind, ProviderId, SyncMode } from '../providers/types';
import type { ConnectionErrorCode } from '../providers/errors';

export type ConnectionStatus = 'active' | 'syncing' | 'error' | 'reauth_required' | 'disconnected';

export interface ConnectionRow {
  id: string;
  workspaceId: string;
  createdBy: string | null;
  provider: ProviderId;
  kind: ConnectionKind;
  displayName: string;
  externalRef: string;
  credentialsEnc: Buffer | null;
  metadata: Record<string, any>;
  status: ConnectionStatus;
  lastSyncedAt: Date | null;
  nextSyncAt: Date | null;
  lastError: string | null;
  lastErrorCode: ConnectionErrorCode | null;
  consecutiveFailures: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface LinkRow {
  id: string;
  connectionId: string;
  accountId: string;
  assetKey: string;
  chainId: string | null;
  currencyCode: string;
  syncMode: SyncMode;
  syncFrom: Date | null;
  cursor: any;
  lastProviderBalance: string | null;
  lastSyncedAt: Date | null;
  createdAt: Date;
  /** Joined from accounts when listed. */
  accountName?: string;
  /** Synced and adjustment rows on this link, when listed. */
  importedCount?: number;
}

export interface NewConnection {
  workspaceId: string;
  createdBy: string | null;
  provider: ProviderId;
  kind: ConnectionKind;
  displayName: string;
  externalRef: string;
  credentialsEnc: Buffer | null;
  metadata: Record<string, any>;
}

export interface NewLink {
  connectionId: string;
  accountId: string;
  assetKey: string;
  chainId: string | null;
  currencyCode: string;
  syncMode: SyncMode;
  syncFrom: Date | null;
}

/** The workspace owner's plan limits, snapshot over plan (see migration 035). */
export interface OwnerLimits {
  ownerId: string;
  planName: string | null;
  limits: Record<string, unknown>;
}
