export type ReportFrequency = 'weekly' | 'monthly';
export type ReportFormat = 'csv' | 'xlsx';

export interface ScheduledReport {
  id: string;
  workspaceId: string;
  userId: string;
  userEmail: string;
  name: string;
  frequency: ReportFrequency;
  dayOfWeek?: number; // 0-6 (Sunday-Saturday) for weekly
  dayOfMonth?: number; // 1-31 for monthly
  timeOfDay: string; // "HH:MM" format
  format: ReportFormat;
  isActive: boolean;
  lastRunAt?: Date;
  nextRunAt: Date;
  createdAt: Date;
  updatedAt: Date;
}

export interface CreateScheduledReport {
  workspaceId: string;
  userId: string;
  userEmail: string;
  name: string;
  frequency: ReportFrequency;
  dayOfWeek?: number;
  dayOfMonth?: number;
  timeOfDay?: string;
  format?: ReportFormat;
}

export interface UpdateScheduledReport {
  name?: string;
  frequency?: ReportFrequency;
  dayOfWeek?: number;
  dayOfMonth?: number;
  timeOfDay?: string;
  format?: ReportFormat;
  isActive?: boolean;
}

export interface ScheduledReportListParams {
  workspaceId?: string;
  page?: number;
  limit?: number;
  isActive?: boolean;
}
