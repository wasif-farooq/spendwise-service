export interface ActivityResponse {
  id: string;
  workspaceId: string;
  userId: string | null;
  entityType: string;
  entityId: string;
  action: string;
  oldValues: Record<string, any> | null;
  newValues: Record<string, any> | null;
  metadata: Record<string, any>;
  activityDate: string;
  createdAt: string;
}

export interface ActivityPaginationResponse {
  nextCursor: string | null;
  hasMore: boolean;
}

export interface ActivityListResponse {
  data: ActivityResponse[];
  pagination: ActivityPaginationResponse;
}

export interface PartitionResponse {
  partitionName: string;
  partitionRange: string;
}
