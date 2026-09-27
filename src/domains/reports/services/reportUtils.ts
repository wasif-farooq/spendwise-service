/**
 * Format a number as a fixed-point string with 2 decimal places.
 * Used by both CSV and XLSX report generators.
 */
export function formatCurrency(amount: number): string {
  return amount.toFixed(2);
}

/**
 * Calculate the next run date/time for a scheduled report.
 * Used by both ScheduledReportRepository and ScheduledReportService.
 */
export function calculateNextRunAt(
  frequency: string,
  dayOfWeek?: number,
  dayOfMonth?: number,
  timeOfDay: string = '09:00',
): Date {
  const [hours, minutes] = timeOfDay.split(':').map(Number);
  const now = new Date();
  const next = new Date(now);

  next.setHours(hours, minutes, 0, 0);

  if (frequency === 'weekly') {
    const targetDay = dayOfWeek ?? 1;
    const currentDay = next.getDay();
    let daysUntil = targetDay - currentDay;
    if (daysUntil < 0) daysUntil += 7;
    if (daysUntil === 0 && next <= now) daysUntil = 7;
    next.setDate(next.getDate() + daysUntil);
  } else {
    const targetDay = dayOfMonth ?? 1;
    const currentDay = next.getDate();

    if (currentDay < targetDay) {
      next.setDate(targetDay);
    } else if (currentDay === targetDay && next <= now) {
      next.setMonth(next.getMonth() + 1);
      next.setDate(targetDay);
    } else {
      next.setMonth(next.getMonth() + 1);
      next.setDate(targetDay);
    }

    const lastDay = new Date(next.getFullYear(), next.getMonth() + 1, 0).getDate();
    if (targetDay > lastDay) {
      next.setDate(lastDay);
    }
  }

  return next;
}
