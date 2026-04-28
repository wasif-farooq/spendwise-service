export type DateRangePreset = 
  | 'last7days' 
  | 'last30days' 
  | 'thisMonth' 
  | 'lastMonth' 
  | 'thisYear' 
  | 'lastYear' 
  | 'custom';

export interface CustomDateRange {
  startDate: string;
  endDate: string;
}

export interface ExportReportRequest {
  workspaceId: string;
  userId: string;
  userEmail: string;
  dateRange: DateRangePreset;
  customDates?: CustomDateRange;
  format: 'csv' | 'xlsx';
}

export interface ResolvedDateRange {
  startDate: Date;
  endDate: Date;
}

export function resolveDateRange(
  preset: DateRangePreset, 
  customDates?: CustomDateRange
): ResolvedDateRange {
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  
  switch (preset) {
    case 'last7days': {
      const startDate = new Date(today.getTime() - 7 * 24 * 60 * 60 * 1000);
      return { startDate, endDate: today };
    }
    case 'last30days': {
      const startDate = new Date(today.getTime() - 30 * 24 * 60 * 60 * 1000);
      return { startDate, endDate: today };
    }
    case 'thisMonth': {
      const startDate = new Date(today.getFullYear(), today.getMonth(), 1);
      return { startDate, endDate: today };
    }
    case 'lastMonth': {
      const startDate = new Date(today.getFullYear(), today.getMonth() - 1, 1);
      const endDate = new Date(today.getFullYear(), today.getMonth(), 0);
      return { startDate, endDate };
    }
    case 'thisYear': {
      const startDate = new Date(today.getFullYear(), 0, 1);
      return { startDate, endDate: today };
    }
    case 'lastYear': {
      const startDate = new Date(today.getFullYear() - 1, 0, 1);
      const endDate = new Date(today.getFullYear() - 1, 11, 31);
      return { startDate, endDate };
    }
    case 'custom': {
      if (!customDates) {
        throw new Error('Custom date range requires startDate and endDate');
      }
      return { 
        startDate: new Date(customDates.startDate), 
        endDate: new Date(customDates.endDate) 
      };
    }
  }
}

export function formatDateForFile(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function formatDateRange(startDate: Date, endDate: Date): string {
  const options: Intl.DateTimeFormatOptions = { 
    year: 'numeric', 
    month: 'short', 
    day: 'numeric' 
  };
  return `${startDate.toLocaleDateString('en-US', options)} - ${endDate.toLocaleDateString('en-US', options)}`;
}