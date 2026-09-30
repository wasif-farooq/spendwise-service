import { ExpenseReportData } from './ExpenseReportGenerator';
import { formatCurrency } from './reportUtils';

/**
 * Escape a value per RFC 4180:
 * - If the value contains a comma, double-quote, or newline, wrap it in double quotes
 * - Any double quotes inside the value are escaped by doubling them
 * - All values are treated as strings for consistency
 */
function escapeCsvField(value: string | number): string {
  const str = String(value);
  if (str.includes(',') || str.includes('"') || str.includes('\n') || str.includes('\r')) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

function buildCsvRow(fields: (string | number)[]): string {
  return fields.map(escapeCsvField).join(',');
}

/**
 * Generate a flat-tabular, RFC 4180-compliant CSV expense report.
 *
 * Structure:
 *   Section 1: Summary (2 columns)
 *   Section 2: Expenses by Category (3 columns)
 *   Section 3: Expenses by Account (2 columns)
 *   Section 4: Top Merchants (3 columns)
 *   Section 5: Largest Transactions (4 columns)
 *
 * Each section is separated by a blank row for readability in spreadsheet apps,
 * but the file remains a single valid CSV that tools like pandas, Excel, and
 * Google Sheets can parse natively.
 */
export function generateExpenseReportCsv(data: ExpenseReportData): Buffer {
  const rows: string[] = [];

  // --- Section 0: Metadata ---
  rows.push('Key,Value');
  rows.push(buildCsvRow(['Report', 'TrackMyPocket Expense Report']));
  rows.push(buildCsvRow(['Period Start', data.period.startDate]));
  rows.push(buildCsvRow(['Period End', data.period.endDate]));
  rows.push(buildCsvRow(['Generated At', data.generatedAt]));
  rows.push('');

  // --- Section 1: Summary ---
  rows.push('Metric,Value');
  rows.push(buildCsvRow(['Total Expenses', formatCurrency(data.summary.totalExpenses)]));
  rows.push(buildCsvRow(['Transaction Count', data.summary.transactionCount]));
  rows.push(buildCsvRow(['Average Transaction', formatCurrency(data.summary.averageTransaction)]));
  rows.push(
    buildCsvRow(['Previous Period Change', `${data.summary.previousPeriodChange.toFixed(1)}%`]),
  );
  rows.push('');

  // --- Section 2: Expenses by Category ---
  rows.push('Category,Amount,Percentage');
  for (const cat of data.byCategory) {
    rows.push(
      buildCsvRow([cat.category, formatCurrency(cat.amount), `${cat.percentage.toFixed(1)}%`]),
    );
  }
  rows.push('');

  // --- Section 3: Expenses by Account ---
  rows.push('Account,Amount');
  for (const acc of data.byAccount) {
    rows.push(buildCsvRow([acc.accountName, formatCurrency(acc.amount)]));
  }
  rows.push('');

  // --- Section 4: Top Merchants ---
  rows.push('Merchant,Amount,Transaction Count');
  for (const merch of data.byMerchant) {
    rows.push(buildCsvRow([merch.merchant, formatCurrency(merch.amount), merch.count]));
  }
  rows.push('');

  // --- Section 5: Largest Transactions ---
  rows.push('Description,Amount,Date,Category');
  for (const tx of data.topExpenses) {
    rows.push(
      buildCsvRow([tx.description, formatCurrency(tx.amount, tx.currency), tx.date, tx.category]),
    );
  }

  return Buffer.from(rows.join('\n'), 'utf-8');
}
