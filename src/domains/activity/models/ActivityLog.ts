import { Entity } from '@shared/Entity';

export interface ActivityLogProps {
  workspaceId: string;
  userId: string | null;
  entityType: string;
  entityId: string;
  action: string;
  oldValues: Record<string, any> | null;
  newValues: Record<string, any> | null;
  metadata: Record<string, any>;
  activityDate: Date;
  createdAt?: Date;
}

export class ActivityLog extends Entity<ActivityLogProps> {
  get workspaceId(): string {
    return this.props.workspaceId;
  }

  get userId(): string | null {
    return this.props.userId;
  }

  get entityType(): string {
    return this.props.entityType;
  }

  get entityId(): string {
    return this.props.entityId;
  }

  get action(): string {
    return this.props.action;
  }

  get oldValues(): Record<string, any> | null {
    return this.props.oldValues;
  }

  get newValues(): Record<string, any> | null {
    return this.props.newValues;
  }

  get metadata(): Record<string, any> {
    return this.props.metadata;
  }

  get activityDate(): Date {
    return this.props.activityDate;
  }

  get createdAt(): Date | undefined {
    return this.props.createdAt;
  }

  static create(props: ActivityLogProps, id?: string): ActivityLog {
    return new ActivityLog(
      {
        ...props,
        activityDate: props.activityDate || new Date(),
        metadata: props.metadata || {},
      },
      id,
    );
  }

  static fromDatabase(row: any): ActivityLog {
    return ActivityLog.create(
      {
        workspaceId: row.workspace_id,
        userId: row.user_id,
        entityType: row.entity_type,
        entityId: row.entity_id,
        action: row.action,
        oldValues: row.old_values,
        newValues: row.new_values,
        metadata: row.metadata || {},
        activityDate: new Date(row.activity_date),
        createdAt: row.created_at ? new Date(row.created_at) : undefined,
      },
      row.id,
    );
  }
}
