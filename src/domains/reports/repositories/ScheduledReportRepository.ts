import { Container } from '@di/Container';
import { TOKENS } from '@di/tokens';
import { DatabaseFacade } from '@facades/DatabaseFacade';
import {
  ScheduledReport,
  CreateScheduledReport,
  UpdateScheduledReport,
  ScheduledReportListParams,
} from '@domains/reports/models/ScheduledReport';
import { calculateNextRunAt } from '../services/reportUtils';

export class ScheduledReportRepository {
  private getDb(): DatabaseFacade {
    return Container.getInstance().resolve<DatabaseFacade>(TOKENS.Database);
  }

  private mapRow(row: any): ScheduledReport {
    return {
      id: row.id,
      workspaceId: row.workspace_id,
      userId: row.user_id,
      userEmail: row.user_email,
      name: row.name,
      frequency: row.frequency,
      dayOfWeek: row.day_of_week,
      dayOfMonth: row.day_of_month,
      timeOfDay: row.time_of_day,
      format: row.format,
      isActive: row.is_active,
      lastRunAt: row.last_run_at ? new Date(row.last_run_at) : undefined,
      nextRunAt: new Date(row.next_run_at),
      createdAt: new Date(row.created_at),
      updatedAt: new Date(row.updated_at),
    };
  }

  async create(data: CreateScheduledReport): Promise<string> {
    const db = this.getDb();
    const timeOfDay = data.timeOfDay || '09:00';
    const format = data.format || 'csv';

    // Calculate initial next_run_at based on frequency
    const nextRunAt = calculateNextRunAt(data.frequency, data.dayOfWeek, data.dayOfMonth, timeOfDay);

    const result = await db.query(
      `INSERT INTO scheduled_reports (
        workspace_id, user_id, user_email, name, frequency,
        day_of_week, day_of_month, time_of_day, format, is_active, next_run_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, true, $10)
      RETURNING id`,
      [
        data.workspaceId,
        data.userId,
        data.userEmail,
        data.name,
        data.frequency,
        data.dayOfWeek ?? null,
        data.dayOfMonth ?? null,
        timeOfDay,
        format,
        nextRunAt,
      ],
    );
    return result.rows[0].id;
  }

  async findById(id: string): Promise<ScheduledReport | null> {
    const db = this.getDb();
    const result = await db.query(
      `SELECT * FROM scheduled_reports WHERE id = $1`,
      [id],
    );
    return result.rows.length > 0 ? this.mapRow(result.rows[0]) : null;
  }

  async list(params: ScheduledReportListParams) {
    const db = this.getDb();
    const page = params.page || 1;
    const limit = Math.min(params.limit || 20, 100);
    const offset = (page - 1) * limit;

    let whereClause = 'WHERE workspace_id = $1';
    const queryValues: any[] = [params.workspaceId];
    let paramIndex = 2;

    if (params.isActive !== undefined) {
      whereClause += ` AND is_active = $${paramIndex}`;
      queryValues.push(params.isActive);
      paramIndex++;
    }

    const countResult = await db.query(
      `SELECT COUNT(*) as total FROM scheduled_reports ${whereClause}`,
      queryValues,
    );
    const total = parseInt(countResult.rows[0].total, 10);

    const dataResult = await db.query(
      `SELECT * FROM scheduled_reports
       ${whereClause}
       ORDER BY created_at DESC
       LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`,
      [...queryValues, limit, offset],
    );

    const reports = dataResult.rows.map(this.mapRow);

    return {
      reports,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  async update(id: string, data: UpdateScheduledReport): Promise<void> {
    const db = this.getDb();
    const fields: string[] = [];
    const values: any[] = [];
    let paramIndex = 1;

    const fieldMap: Record<string, string> = {
      name: 'name',
      frequency: 'frequency',
      dayOfWeek: 'day_of_week',
      dayOfMonth: 'day_of_month',
      timeOfDay: 'time_of_day',
      format: 'format',
      isActive: 'is_active',
    };

    for (const [key, column] of Object.entries(fieldMap)) {
      if (data[key as keyof UpdateScheduledReport] !== undefined) {
        fields.push(`${column} = $${paramIndex}`);
        values.push(data[key as keyof UpdateScheduledReport]);
        paramIndex++;
      }
    }

    if (fields.length === 0) return;

    // Recalculate next_run_at if schedule changed
    if (data.frequency || data.dayOfWeek !== undefined || data.dayOfMonth !== undefined || data.timeOfDay) {
      const existing = await this.findById(id);
      if (existing) {
        const freq = data.frequency || existing.frequency;
        const dow = data.dayOfWeek !== undefined ? data.dayOfWeek : existing.dayOfWeek;
        const dom = data.dayOfMonth !== undefined ? data.dayOfMonth : existing.dayOfMonth;
        const tod = data.timeOfDay || existing.timeOfDay;
        const nextRunAt = calculateNextRunAt(freq, dow, dom, tod);
        fields.push(`next_run_at = $${paramIndex}`);
        values.push(nextRunAt);
        paramIndex++;
      }
    }

    fields.push(`updated_at = CURRENT_TIMESTAMP`);
    values.push(id);

    await db.query(
      `UPDATE scheduled_reports SET ${fields.join(', ')} WHERE id = $${paramIndex}`,
      values,
    );
  }

  async delete(id: string): Promise<void> {
    const db = this.getDb();
    await db.query(`DELETE FROM scheduled_reports WHERE id = $1`, [id]);
  }

  async findAll(limit: number = 1000): Promise<ScheduledReport[]> {
    const db = this.getDb();
    const result = await db.query(
      `SELECT * FROM scheduled_reports ORDER BY created_at DESC LIMIT $1`,
      [limit],
    );
    return result.rows.map(this.mapRow);
  }

  async findDueReports(): Promise<ScheduledReport[]> {
    const db = this.getDb();
    const now = new Date();
    const result = await db.query(
      `SELECT * FROM scheduled_reports
       WHERE is_active = true AND next_run_at <= $1
       ORDER BY next_run_at ASC`,
      [now],
    );
    return result.rows.map(this.mapRow);
  }

  async updateNextRunAt(id: string, nextRunAt: Date): Promise<void> {
    const db = this.getDb();
    await db.query(
      `UPDATE scheduled_reports
       SET next_run_at = $1, last_run_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
       WHERE id = $2`,
      [nextRunAt, id],
    );
  }


}
