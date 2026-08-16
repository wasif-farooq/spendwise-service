import { ActivityLogRepository } from '../repositories/ActivityLogRepository';
import { ActivityQueryFilters, PartitionInfo } from '../repositories/IActivityLogRepository';
import { AppError } from '@shared/errors/AppError';

export interface ActivityQueryOptions {
  startDate: string;
  endDate: string;
  entityType?: string;
  entityId?: string;
  userId?: string;
  action?: string;
  limit?: number;
  cursor?: string;
}

export interface EntityHistoryOptions {
  entityType: string;
  entityId: string;
  startDate: string;
  endDate: string;
  limit?: number;
}

export class ActivityLogService {
  constructor(private repository: ActivityLogRepository) {}

  async getActivities(workspaceId: string, options: ActivityQueryOptions) {
    if (!options.startDate || !options.endDate) {
      throw new AppError('startDate and endDate are required for activity queries', 400);
    }

    const startDate = new Date(options.startDate);
    const endDate = new Date(options.endDate);

    if (isNaN(startDate.getTime()) || isNaN(endDate.getTime())) {
      throw new AppError('Invalid date format. Use ISO 8601 format', 400);
    }

    if (endDate <= startDate) {
      throw new AppError('endDate must be after startDate', 400);
    }

    const maxRange = 365 * 24 * 60 * 60 * 1000;
    if (endDate.getTime() - startDate.getTime() > maxRange) {
      throw new AppError('Date range cannot exceed 1 year', 400);
    }

    const filters: ActivityQueryFilters = {};
    if (options.entityType) filters.entityType = options.entityType;
    if (options.entityId) filters.entityId = options.entityId;
    if (options.userId) filters.userId = options.userId;
    if (options.action) filters.action = options.action;

    return this.repository.findByDateRange(
      workspaceId,
      startDate,
      endDate,
      filters,
      options.limit || 50,
      options.cursor,
    );
  }

  async getEntityHistory(workspaceId: string, options: EntityHistoryOptions) {
    if (!options.startDate || !options.endDate) {
      throw new AppError('startDate and endDate are required', 400);
    }

    const startDate = new Date(options.startDate);
    const endDate = new Date(options.endDate);

    if (isNaN(startDate.getTime()) || isNaN(endDate.getTime())) {
      throw new AppError('Invalid date format. Use ISO 8601 format', 400);
    }

    return this.repository.findByEntity(
      workspaceId,
      options.entityType,
      options.entityId,
      startDate,
      endDate,
      options.limit || 100,
    );
  }

  async listPartitions(fromDate?: Date, toDate?: Date): Promise<PartitionInfo[]> {
    return this.repository.listPartitions(fromDate, toDate);
  }

  async ensurePartitions(monthsAhead = 6): Promise<void> {
    const now = new Date();
    const futureDate = new Date(now);
    futureDate.setMonth(futureDate.getMonth() + monthsAhead);

    await this.repository.ensurePartitionsExist(now, futureDate);
  }
}
