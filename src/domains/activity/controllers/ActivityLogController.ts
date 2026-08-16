import { Request, Response } from 'express';
import { ActivityLogService } from '../services/ActivityLogService';
import { AppError } from '@shared/errors/AppError';
import { ActivityResponse, ActivityListResponse, PartitionResponse } from '../dto/activity.dto';

export class ActivityLogController {
  constructor(private service: ActivityLogService) {}

  private getWorkspaceId(req: Request): string {
    return req.params.workspaceId || (req.query.workspaceId as string);
  }

  private getUserId(req: Request): string | null {
    return (req as any).user?.userId || (req as any).user?.id || (req as any).user?.sub || null;
  }

  async getActivities(req: Request, res: Response) {
    const workspaceId = this.getWorkspaceId(req);
    if (!workspaceId) {
      throw new AppError('Workspace ID is required', 400);
    }

    const { startDate, endDate, entityType, entityId, userId, action, limit, cursor } = req.query;

    const result = await this.service.getActivities(workspaceId, {
      startDate: startDate as string,
      endDate: endDate as string,
      entityType: entityType as string | undefined,
      entityId: entityId as string | undefined,
      userId: userId as string | undefined,
      action: action as string | undefined,
      limit: limit ? parseInt(limit as string) : 50,
      cursor: cursor as string | undefined,
    });

    const response: ActivityListResponse = {
      data: result.data.map((row: any) => this.mapToResponse(row)),
      pagination: result.pagination,
    };

    res.status(200).json(response);
  }

  async getEntityHistory(req: Request, res: Response) {
    const workspaceId = this.getWorkspaceId(req);
    if (!workspaceId) {
      throw new AppError('Workspace ID is required', 400);
    }

    const { entityType, entityId } = req.params;
    const { startDate, endDate, limit } = req.query;

    const result = await this.service.getEntityHistory(workspaceId, {
      entityType: entityType as string,
      entityId: entityId as string,
      startDate: startDate as string,
      endDate: endDate as string,
      limit: limit ? parseInt(limit as string) : 100,
    });

    res.status(200).json({
      data: result.map((row: any) => this.mapToResponse(row)),
    });
  }

  async listPartitions(req: Request, res: Response) {
    const { from, to } = req.query;
    const fromDate = from ? new Date(from as string) : undefined;
    const toDate = to ? new Date(to as string) : undefined;

    const partitions = await this.service.listPartitions(fromDate, toDate);

    const response: PartitionResponse[] = partitions.map((p) => ({
      partitionName: p.partition_name,
      partitionRange: p.partition_range,
    }));

    res.status(200).json(response);
  }

  async ensurePartitions(req: Request, res: Response) {
    const monthsAhead = parseInt(req.query.months as string) || 6;
    await this.service.ensurePartitions(monthsAhead);
    res.status(200).json({ message: `Partitions ensured for next ${monthsAhead} months` });
  }

  private mapToResponse(row: any): ActivityResponse {
    return {
      id: row.id,
      workspaceId: row.workspaceId,
      userId: row.userId,
      entityType: row.entityType,
      entityId: row.entityId,
      action: row.action,
      oldValues: row.oldValues,
      newValues: row.newValues,
      metadata: row.metadata || {},
      activityDate: row.activityDate.toISOString(),
      createdAt: row.createdAt ? row.createdAt.toISOString() : new Date().toISOString(),
    };
  }
}
