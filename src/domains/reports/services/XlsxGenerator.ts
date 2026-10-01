import * as XLSX from 'xlsx';
import { ExpenseReportData } from './ExpenseReportGenerator';

/**
 * Format a date string to a readable format.
 */
function formatDate(dateStr: string): string {
  try {
    const d = new Date(dateStr);
    return d.toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      timeZone: 'UTC',
    });
  } catch {
    return dateStr;
  }
}

/**
 * Build a sheet from an array-of-arrays with optional column widths.
 */
function buildSheet(data: (string | number)[][], colWidths?: number[]): XLSX.WorkSheet {
  const ws = XLSX.utils.aoa_to_sheet(data);
  if (colWidths) {
    ws['!cols'] = colWidths.map((w) => ({ wch: w }));
  }
  return ws;
}

/**
 * Add a blank separator row between sections in a sheet.
 */
function addSeparator(data: (string | number)[][]) {
  data.push([]);
}

/**
 * Add a section label row between data sections.
 */
function addSectionLabel(data: (string | number)[][], title: string) {
  addSeparator(data);
  data.push([title]);
  addSeparator(data);
}

export function generateExpenseReportXlsx(data: ExpenseReportData): Buffer {
  const workbook = XLSX.utils.book_new();

  // ═══════════════════════════════════════════════════════
  // Sheet 1: Overview
  // ═══════════════════════════════════════════════════════
  const overview: (string | number)[][] = [
    ['TrackMyPocket Expense Report'],
    [`Period: ${formatDate(data.period.startDate)} — ${formatDate(data.period.endDate)}`],
    [`Generated: ${formatDate(data.generatedAt)}`],
    [`Amounts in ${data.currency}`],
  ];
  if (data.unconvertedCurrencies.length) {
    overview.push([`Not included (no exchange rate): ${data.unconvertedCurrencies.join(' ')}`]);
  }

  addSectionLabel(overview, 'Summary');
  overview.push(['Metric', 'Value']);
  overview.push(['Total Expenses', data.summary.totalExpenses]);
  overview.push(['Transaction Count', data.summary.transactionCount]);
  overview.push(['Average Transaction', data.summary.averageTransaction]);
  overview.push(['Previous Period Change', `${data.summary.previousPeriodChange.toFixed(1)}%`]);

  addSectionLabel(overview, 'Expenses by Category');
  overview.push(['Category', 'Amount', 'Percentage']);
  for (const cat of data.byCategory) {
    overview.push([cat.category, cat.amount, `${cat.percentage.toFixed(1)}%`]);
  }

  addSectionLabel(overview, 'Expenses by Account');
  overview.push(['Account', 'Amount']);
  for (const acc of data.byAccount) {
    overview.push([acc.accountName, acc.amount]);
  }

  const overviewSheet = buildSheet(overview, [30, 20, 18]);
  XLSX.utils.book_append_sheet(workbook, overviewSheet, 'Overview');

  // ═══════════════════════════════════════════════════════
  // Sheet 2: By Category (tabular)
  // ═══════════════════════════════════════════════════════
  const categoryData: (string | number)[][] = [
    ['Category', 'Amount', 'Percentage of Total'],
  ];
  for (const cat of data.byCategory) {
    categoryData.push([cat.category, cat.amount, `${cat.percentage.toFixed(1)}%`]);
  }
  const categorySheet = buildSheet(categoryData, [25, 18, 20]);
  XLSX.utils.book_append_sheet(workbook, categorySheet, 'By Category');

  // ═══════════════════════════════════════════════════════
  // Sheet 3: By Account (tabular)
  // ═══════════════════════════════════════════════════════
  const accountData: (string | number)[][] = [
    ['Account', 'Expenses'],
  ];
  for (const acc of data.byAccount) {
    accountData.push([acc.accountName, acc.amount]);
  }
  const accountSheet = buildSheet(accountData, [30, 18]);
  XLSX.utils.book_append_sheet(workbook, accountSheet, 'By Account');

  // ═══════════════════════════════════════════════════════
  // Sheet 4: Top Merchants (tabular)
  // ═══════════════════════════════════════════════════════
  const merchantData: (string | number)[][] = [
    ['Merchant', 'Total Spent', 'Transactions'],
  ];
  for (const merch of data.byMerchant) {
    merchantData.push([merch.merchant, merch.amount, merch.count]);
  }
  const merchantSheet = buildSheet(merchantData, [35, 18, 15]);
  XLSX.utils.book_append_sheet(workbook, merchantSheet, 'Top Merchants');

  // ═══════════════════════════════════════════════════════
  // Sheet 5: Largest Transactions (tabular)
  // ═══════════════════════════════════════════════════════
  const txData: (string | number)[][] = [['Description', 'Amount', 'Currency', 'Date', 'Category']];
  for (const tx of data.topExpenses) {
    txData.push([tx.description, tx.amount, tx.currency || data.currency, tx.date, tx.category]);
  }
  const txSheet = buildSheet(txData, [40, 18, 10, 14, 20]);
  XLSX.utils.book_append_sheet(workbook, txSheet, 'Largest Transactions');

  // Write to buffer
  const xlsxBuffer = XLSX.write(workbook, {
    bookType: 'xlsx',
    type: 'buffer',
  });

  return Buffer.from(xlsxBuffer);
}
