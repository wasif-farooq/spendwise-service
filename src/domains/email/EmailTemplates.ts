interface ExpenseReportData {
  period: {
    startDate: string;
    endDate: string;
  };
  summary: {
    totalExpenses: number;
    transactionCount: number;
    averageTransaction: number;
    previousPeriodChange: number;
  };
  byCategory: Array<{ category: string; amount: number; percentage: number }>;
  byMerchant: Array<{ merchant: string; amount: number; count: number }>;
  topExpenses: Array<{ description: string; amount: number; date: string; category: string }>;
}

export function generateExpenseReportEmailHtml(data: ExpenseReportData): string {
  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD'
    }).format(amount);
  };

  const formatDate = (date: string) => {
    return new Date(date).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    });
  };

  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Expense Report</title>
</head>
<body style="margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background-color: #f9fafb;">
    <table width="100%" cellpadding="0" cellspacing="0" style="background-color: #f9fafb;">
      <tr>
        <td align="center" style="padding: 40px 20px;">
          <table width="100%" cellpadding="0" cellspacing="0" style="max-width: 600px; background-color: #ffffff; border-radius: 12px; box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);">
            <!-- Header -->
            <tr>
              <td style="padding: 32px 40px; background: linear-gradient(135deg, #10b981 0%, #059669 100%); border-radius: 12px 12px 0 0;">
                <h1 style="margin: 0; color: #ffffff; font-size: 24px; font-weight: 700;">Expense Report</h1>
                <p style="margin: 8px 0 0 0; color: rgba(255, 255, 255, 0.9); font-size: 14px;">
                  ${formatDate(data.period.startDate)} - ${formatDate(data.period.endDate)}
                </p>
              </td>
            </tr>

            <!-- Summary -->
            <tr>
              <td style="padding: 32px 40px 24px;">
                <h2 style="margin: 0 0 20px 0; color: #111827; font-size: 18px; font-weight: 600;">Summary</h2>
                <table width="100%" cellpadding="0" cellspacing="0">
                  <tr>
                    <td style="padding: 16px; background-color: #f3f4f6; border-radius: 8px; text-align: center;">
                      <p style="margin: 0; color: #6b7280; font-size: 12px; text-transform: uppercase; letter-spacing: 0.5px;">Total Expenses</p>
                      <p style="margin: 8px 0 0 0; color: #111827; font-size: 28px; font-weight: 700;">${formatCurrency(data.summary.totalExpenses)}</p>
                    </td>
                    <td style="width: 16px;"></td>
                    <td style="padding: 16px; background-color: #f3f4f6; border-radius: 8px; text-align: center;">
                      <p style="margin: 0; color: #6b7280; font-size: 12px; text-transform: uppercase; letter-spacing: 0.5px;">Transactions</p>
                      <p style="margin: 8px 0 0 0; color: #111827; font-size: 28px; font-weight: 700;">${data.summary.transactionCount}</p>
                    </td>
                    <td style="width: 16px;"></td>
                    <td style="padding: 16px; background-color: #f3f4f6; border-radius: 8px; text-align: center;">
                      <p style="margin: 0; color: #6b7280; font-size: 12px; text-transform: uppercase; letter-spacing: 0.5px;">Avg. Transaction</p>
                      <p style="margin: 8px 0 0 0; color: #111827; font-size: 28px; font-weight: 700;">${formatCurrency(data.summary.averageTransaction)}</p>
                    </td>
                  </tr>
                </table>
              </td>
            </tr>

            <!-- By Category -->
            <tr>
              <td style="padding: 0 40px 24px;">
                <h2 style="margin: 0 0 16px 0; color: #111827; font-size: 18px; font-weight: 600;">Expenses by Category</h2>
                <table width="100%" cellpadding="0" cellspacing="0">
                  ${data.byCategory.slice(0, 5).map(cat => `
                    <tr>
                      <td style="padding: 12px 0; border-bottom: 1px solid #f3f4f6;">
                        <span style="color: #111827; font-size: 14px;">${cat.category}</span>
                      </td>
                      <td style="padding: 12px 0; border-bottom: 1px solid #f3f4f6; text-align: right;">
                        <span style="color: #111827; font-size: 14px; font-weight: 600;">${formatCurrency(cat.amount)}</span>
                        <span style="color: #6b7280; font-size: 12px; margin-left: 8px;">(${cat.percentage.toFixed(1)}%)</span>
                      </td>
                    </tr>
                  `).join('')}
                </table>
              </td>
            </tr>

            <!-- By Merchant -->
            <tr>
              <td style="padding: 0 40px 24px;">
                <h2 style="margin: 0 0 16px 0; color: #111827; font-size: 18px; font-weight: 600;">Top Merchants</h2>
                <table width="100%" cellpadding="0" cellspacing="0">
                  ${data.byMerchant.slice(0, 5).map(merchant => `
                    <tr>
                      <td style="padding: 12px 0; border-bottom: 1px solid #f3f4f6;">
                        <span style="color: #111827; font-size: 14px;">${merchant.merchant}</span>
                        <span style="color: #6b7280; font-size: 12px; margin-left: 8px;">(${merchant.count} transactions)</span>
                      </td>
                      <td style="padding: 12px 0; border-bottom: 1px solid #f3f4f6; text-align: right;">
                        <span style="color: #111827; font-size: 14px; font-weight: 600;">${formatCurrency(merchant.amount)}</span>
                      </td>
                    </tr>
                  `).join('')}
                </table>
              </td>
            </tr>

            <!-- Top Expenses -->
            <tr>
              <td style="padding: 0 40px 32px;">
                <h2 style="margin: 0 0 16px 0; color: #111827; font-size: 18px; font-weight: 600;">Largest Transactions</h2>
                <table width="100%" cellpadding="0" cellspacing="0">
                  ${data.topExpenses.slice(0, 5).map(tx => `
                    <tr>
                      <td style="padding: 12px 0; border-bottom: 1px solid #f3f4f6;">
                        <span style="color: #111827; font-size: 14px;">${tx.description || 'No description'}</span>
                        <span style="color: #6b7280; font-size: 12px; margin-left: 8px;">${tx.category}</span>
                      </td>
                      <td style="padding: 12px 0; border-bottom: 1px solid #f3f4f6; text-align: right;">
                        <span style="color: #ef4444; font-size: 14px; font-weight: 600;">${formatCurrency(tx.amount)}</span>
                      </td>
                    </tr>
                  `).join('')}
                </table>
              </td>
            </tr>

            <!-- Footer -->
            <tr>
              <td style="padding: 24px 40px; background-color: #f9fafb; border-radius: 0 0 12px 12px; text-align: center;">
                <p style="margin: 0; color: #9ca3af; font-size: 12px;">
                  This report was generated by SpendWise. 
                </p>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>
  `.trim();
}

export function getExpenseReportSubject(data: ExpenseReportData): string {
  const formatDate = (date: string) => {
    return new Date(date).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric'
    });
  };

  return `Expense Report - ${formatDate(data.period.startDate)} to ${formatDate(data.period.endDate)}`;
}