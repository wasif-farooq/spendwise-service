import * as XLSX from 'xlsx';
import { ExpenseReportData } from './ExpenseReportGenerator';

export function generateExpenseReportXlsx(data: ExpenseReportData): Buffer {
  const workbook = XLSX.utils.book_new();
  
  const formatCurrency = (amount: number) => amount.toFixed(2);

  // Summary Sheet
  const summaryData: (string | number)[][] = [
    ['SpendWise Expense Report'],
    [`Period: ${data.period.startDate} to ${data.period.endDate}`],
    [`Generated: ${data.generatedAt}`],
    [''],
    ['=== SUMMARY ==='],
    ['Total Expenses', data.summary.totalExpenses],
    ['Transaction Count', data.summary.transactionCount],
    ['Average Transaction', data.summary.averageTransaction],
    ['Previous Period Change', `${data.summary.previousPeriodChange.toFixed(1)}%`]
  ];
  const summarySheet = XLSX.utils.aoa_to_sheet(summaryData);
  XLSX.utils.book_append_sheet(workbook, summarySheet, 'Summary');

  // By Category Sheet
  const categoryData: (string | number)[][] = [['Category', 'Amount', 'Percentage']];
  for (const cat of data.byCategory) {
    categoryData.push([cat.category, cat.amount, cat.percentage.toFixed(1) + '%']);
  }
  const categorySheet = XLSX.utils.aoa_to_sheet(categoryData);
  XLSX.utils.book_append_sheet(workbook, categorySheet, 'By Category');

  // By Merchant Sheet
  const merchantData: (string | number)[][] = [['Merchant', 'Amount', 'Transaction Count']];
  for (const merch of data.byMerchant) {
    merchantData.push([merch.merchant, merch.amount, merch.count]);
  }
  const merchantSheet = XLSX.utils.aoa_to_sheet(merchantData);
  XLSX.utils.book_append_sheet(workbook, merchantSheet, 'By Merchant');

  // By Account Sheet
  const accountData: (string | number)[][] = [['Account', 'Amount']];
  for (const acc of data.byAccount) {
    accountData.push([acc.accountName, acc.amount]);
  }
  const accountSheet = XLSX.utils.aoa_to_sheet(accountData);
  XLSX.utils.book_append_sheet(workbook, accountSheet, 'By Account');

  // Top Expenses Sheet
  const topExpData: (string | number)[][] = [['Description', 'Amount', 'Date', 'Category']];
  for (const tx of data.topExpenses) {
    topExpData.push([tx.description, tx.amount, tx.date, tx.category]);
  }
  const topExpSheet = XLSX.utils.aoa_to_sheet(topExpData);
  XLSX.utils.book_append_sheet(workbook, topExpSheet, 'Top Expenses');

  // Write to buffer
  const xlsxBuffer = XLSX.write(workbook, { 
    bookType: 'xlsx', 
    type: 'buffer' 
  });
  
  return Buffer.from(xlsxBuffer);
}