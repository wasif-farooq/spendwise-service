import { ExpenseReportData } from './ExpenseReportGenerator';

export function generateExpenseReportCsv(data: ExpenseReportData): Buffer {
  const lines: string[] = [];
  
  const formatCurrency = (amount: number) => amount.toFixed(2);

  // Header
  lines.push('SpendWise Expense Report');
  lines.push(`Period: ${data.period.startDate} to ${data.period.endDate}`);
  lines.push(`Generated: ${data.generatedAt}`);
  lines.push('');

  // Summary
  lines.push('=== SUMMARY ===');
  lines.push(`Total Expenses,${formatCurrency(data.summary.totalExpenses)}`);
  lines.push(`Transaction Count,${data.summary.transactionCount}`);
  lines.push(`Average Transaction,${formatCurrency(data.summary.averageTransaction)}`);
  lines.push(`Previous Period Change,${data.summary.previousPeriodChange.toFixed(1)}%`);
  lines.push('');

  // By Category
  lines.push('=== EXPENSES BY CATEGORY ===');
  lines.push('Category,Amount,Percentage');
  for (const cat of data.byCategory) {
    lines.push(`${cat.category},${formatCurrency(cat.amount)},${cat.percentage.toFixed(1)}%`);
  }
  lines.push('');

  // By Merchant
  lines.push('=== TOP MERCHANTS ===');
  lines.push('Merchant,Amount,Transaction Count');
  for (const merch of data.byMerchant) {
    lines.push(`${merch.merchant},${formatCurrency(merch.amount)},${merch.count}`);
  }
  lines.push('');

  // By Account
  lines.push('=== EXPENSES BY ACCOUNT ===');
  lines.push('Account,Amount');
  for (const acc of data.byAccount) {
    lines.push(`${acc.accountName},${formatCurrency(acc.amount)}`);
  }
  lines.push('');

  // Top Expenses
  lines.push('=== LARGEST TRANSACTIONS ===');
  lines.push('Description,Amount,Date,Category');
  for (const tx of data.topExpenses) {
    const desc = tx.description.replace(/,/g, ';');
    lines.push(`${desc},${formatCurrency(tx.amount)},${tx.date},${tx.category}`);
  }

  return Buffer.from(lines.join('\n'), 'utf-8');
}