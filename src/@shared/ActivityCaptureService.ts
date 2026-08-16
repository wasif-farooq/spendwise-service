import { ActivityQueue, ActivityLogJobData } from '@messaging/queues/ActivityQueue';

export interface ActivityCaptureContext {
  workspaceId: string;
  userId: string | null;
  ip?: string;
  userAgent?: string;
  requestId?: string;
}

export interface ActivityCapturePayload {
  entityType: string;
  entityId: string;
  action: string;
  oldValues?: Record<string, any> | null;
  newValues?: Record<string, any> | null;
}

export class ActivityCaptureService {
  private static instance: ActivityCaptureService;
  private queue: ActivityQueue;
  private enabled: boolean;

  private constructor() {
    this.queue = ActivityQueue.getInstance();
    this.enabled = process.env.ACTIVITY_LOG_ENABLED !== 'false';
  }

  static getInstance(): ActivityCaptureService {
    if (!ActivityCaptureService.instance) {
      ActivityCaptureService.instance = new ActivityCaptureService();
    }
    return ActivityCaptureService.instance;
  }

  async log(payload: ActivityCapturePayload, context: ActivityCaptureContext): Promise<void> {
    if (!this.enabled) return;

    try {
      const metadata: Record<string, any> = {};
      if (context.ip && process.env.ACTIVITY_LOG_CAPTURE_IP !== 'false') {
        metadata.ip = context.ip;
      }
      if (context.userAgent && process.env.ACTIVITY_LOG_CAPTURE_USER_AGENT !== 'false') {
        metadata.userAgent = context.userAgent;
      }
      if (context.requestId) {
        metadata.requestId = context.requestId;
      }

      const jobData: ActivityLogJobData = {
        workspaceId: context.workspaceId,
        userId: context.userId,
        entityType: payload.entityType,
        entityId: payload.entityId,
        action: payload.action,
        oldValues: payload.oldValues || null,
        newValues: payload.newValues || null,
        metadata,
        activityDate: new Date().toISOString(),
      };

      await this.queue.add(jobData);
    } catch (error) {
      console.error('[ActivityCaptureService] Failed to enqueue activity log:', error);
    }
  }

  async logBatch(
    payloads: ActivityCapturePayload[],
    context: ActivityCaptureContext,
  ): Promise<void> {
    if (!this.enabled || payloads.length === 0) return;

    try {
      const metadata: Record<string, any> = {};
      if (context.ip) metadata.ip = context.ip;
      if (context.userAgent) metadata.userAgent = context.userAgent;
      if (context.requestId) metadata.requestId = context.requestId;

      const jobs: ActivityLogJobData[] = payloads.map((payload) => ({
        workspaceId: context.workspaceId,
        userId: context.userId,
        entityType: payload.entityType,
        entityId: payload.entityId,
        action: payload.action,
        oldValues: payload.oldValues || null,
        newValues: payload.newValues || null,
        metadata,
        activityDate: new Date().toISOString(),
      }));

      await this.queue.addBatch(jobs);
    } catch (error) {
      console.error('[ActivityCaptureService] Failed to enqueue batch activity logs:', error);
    }
  }
}
