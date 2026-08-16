export interface ReportRequest {
  id: string;
  workspaceId: string;
  userId: string;
  userEmail: string;
  dateRange: string;
  customStartDate?: string;
  customEndDate?: string;
  format: 'csv' | 'xlsx';
  deliveryMethod: 'email' | 'download';
  status: 'pending' | 'processing' | 'completed' | 'failed';
  filename?: string;
  fileSize?: number;
  errorMessage?: string;
  generatedAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

export interface CreateReportRequest {
  workspaceId: string;
  userId: string;
  userEmail: string;
  dateRange: string;
  customStartDate?: string;
  customEndDate?: string;
  format: 'csv' | 'xlsx';
  deliveryMethod: 'email' | 'download';
  status?: 'pending' | 'processing' | 'completed' | 'failed';
  filename?: string;
  fileSize?: number;
  errorMessage?: string;
  generatedAt?: Date;
}

export interface ReportRequestListParams {
  workspaceId: string;
  page?: number;
  limit?: number;
  status?: string;
  sortBy?: 'created_at' | 'generated_at';
  sortOrder?: 'asc' | 'desc';
}
