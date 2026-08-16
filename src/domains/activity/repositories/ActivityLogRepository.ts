import { DatabaseFacade } from '@facades/DatabaseFacade';
import {
  IActivityLogRepository,
  ActivityQueryFilters,
  ActivityQueryResult,
  PartitionInfo,
} from './IActivityLogRepository';
import { ActivityLogProps } from '../models/ActivityLog';

export class ActivityLogRepository implements IActivityLogRepository {
  constructor(private db: DatabaseFacade) {}

  async create(props: ActivityLogProps): Promise<string> {
    const result = await this.db.query(
      `INSERT INTO activity_logs (
                workspace_id, user_id, entity_type, entity_id, action,
                old_values, new_values, metadata, activity_date
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
            RETURNING id`,
      [
        props.workspaceId,
        props.userId,
        props.entityType,
        props.entityId,
        props.action,
        props.oldValues ? JSON.stringify(props.oldValues) : null,
        props.newValues ? JSON.stringify(props.newValues) : null,
        JSON.stringify(props.metadata || {}),
        props.activityDate || new Date(),
      ],
    );
    return result.rows[0].id;
  }

  async createBatch(propsList: ActivityLogProps[]): Promise<number> {
    if (propsList.length === 0) return 0;

    const values: any[] = [];
    const placeholders: string[] = [];

    propsList.forEach((props, idx) => {
      const base = idx * 9;
      placeholders.push(
        `($${base + 1}, $${base + 2}, $${base + 3}, $${base + 4}, $${base + 5}, $${base + 6}, $${base + 7}, $${base + 8}, $${base + 9})`,
      );
      values.push(
        props.workspaceId,
        props.userId,
        props.entityType,
        props.entityId,
        props.action,
        props.oldValues ? JSON.stringify(props.oldValues) : null,
        props.newValues ? JSON.stringify(props.newValues) : null,
        JSON.stringify(props.metadata || {}),
        props.activityDate || new Date(),
      );
    });

    await this.db.query(
      `INSERT INTO activity_logs (
                workspace_id, user_id, entity_type, entity_id, action,
                old_values, new_values, metadata, activity_date
            ) VALUES ${placeholders.join(', ')}`,
      values,
    );

    return propsList.length;
  }

  async findByDateRange(
    workspaceId: string,
    startDate: Date,
    endDate: Date,
    filters?: ActivityQueryFilters,
    limit = 50,
    cursor?: string,
  ): Promise<ActivityQueryResult> {
    let whereClause = 'WHERE workspace_id = $1 AND activity_date >= $2 AND activity_date < $3';
    const params: any[] = [workspaceId, startDate, endDate];
    let paramIndex = 4;

    if (filters?.entityType) {
      whereClause += ` AND entity_type = $${paramIndex}`;
      params.push(filters.entityType);
      paramIndex++;
    }

    if (filters?.entityId) {
      whereClause += ` AND entity_id = $${paramIndex}`;
      params.push(filters.entityId);
      paramIndex++;
    }

    if (filters?.userId) {
      whereClause += ` AND user_id = $${paramIndex}`;
      params.push(filters.userId);
      paramIndex++;
    }

    if (filters?.action) {
      whereClause += ` AND action = $${paramIndex}`;
      params.push(filters.action);
      paramIndex++;
    }

    if (cursor) {
      try {
        const decoded = Buffer.from(cursor, 'base64').toString('utf-8');
        const [id, date] = decoded.split('|');
        if (id && date) {
          whereClause += ` AND (activity_date < $${paramIndex} OR (activity_date = $${paramIndex} AND id < $${paramIndex + 1}))`;
          params.push(date, id);
          paramIndex += 2;
        }
      } catch {
        // Invalid cursor, ignore
      }
    }

    const query = `
            SELECT id, workspace_id, user_id, entity_type, entity_id, action,
                   old_values, new_values, metadata, activity_date, created_at
            FROM activity_logs
            ${whereClause}
            ORDER BY activity_date DESC, id DESC
            LIMIT $${paramIndex}
        `;
    params.push(limit + 1);

    const result = await this.db.query(query, params);
    const hasMore = result.rows.length > limit;
    const data = hasMore ? result.rows.slice(0, -1).map(this.mapRow) : result.rows.map(this.mapRow);

    const nextCursor =
      hasMore && data.length > 0
        ? Buffer.from(
            `${data[data.length - 1].id}|${data[data.length - 1].activityDate.toISOString()}`,
          ).toString('base64')
        : null;

    return {
      data,
      pagination: {
        nextCursor,
        hasMore,
      },
    };
  }

  async findByEntity(
    workspaceId: string,
    entityType: string,
    entityId: string,
    startDate: Date,
    endDate: Date,
    limit = 100,
  ): Promise<any[]> {
    const result = await this.db.query(
      `SELECT id, workspace_id, user_id, entity_type, entity_id, action,
                    old_values, new_values, metadata, activity_date, created_at
             FROM activity_logs
             WHERE workspace_id = $1 AND entity_type = $2 AND entity_id = $3
               AND activity_date >= $4 AND activity_date < $5
             ORDER BY activity_date DESC, id DESC
             LIMIT $6`,
      [workspaceId, entityType, entityId, startDate, endDate, limit],
    );
    return result.rows.map(this.mapRow);
  }

  async listPartitions(fromDate?: Date, toDate?: Date): Promise<PartitionInfo[]> {
    const result = await this.db.query(
      'SELECT partition_name, partition_range FROM list_activity_partitions()',
    );
    return result.rows;
  }

  async ensurePartitionsExist(startDate: Date, endDate: Date): Promise<void> {
    await this.db.query('SELECT ensure_activity_partitions($1, $2)', [startDate, endDate]);
  }

  private mapRow(row: any): any {
    return {
      id: row.id,
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
    };
  }
}
