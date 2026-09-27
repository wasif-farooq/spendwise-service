import { ActivityLogProps } from '../models/ActivityLog';

export interface ActivityQueryFilters {
  entityType?: string;
  entityId?: string;
  userId?: string;
  action?: string;
}

export interface ActivityQueryResult {
  data: any[];
  pagination: {
    nextCursor: string | null;
    hasMore: boolean;
    totalCount?: number;
  };
}

export interface PartitionInfo {
  partition_name: string;
  partition_range: string;
}

export interface IActivityLogRepository {
  create(props: ActivityLogProps): Promise<string>;
  createBatch(propsList: ActivityLogProps[]): Promise<number>;
  findByDateRange(
    workspaceId: string,
    startDate: Date,
    endDate: Date,
    filters?: ActivityQueryFilters,
    limit?: number,
    cursor?: string,
  ): Promise<ActivityQueryResult>;
  findByEntity(
    workspaceId: string,
    entityType: string,
    entityId: string,
    startDate: Date,
    endDate: Date,
    limit?: number,
  ): Promise<any[]>;
  listPartitions(fromDate?: Date, toDate?: Date): Promise<PartitionInfo[]>;
  ensurePartitionsExist(startDate: Date, endDate: Date): Promise<void>;
}
