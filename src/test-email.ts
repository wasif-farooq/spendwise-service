import nodemailer from 'nodemailer';

const testConfigurations = [
  {
    name: 'Port 2525 - No TLS (plain)',
    config: {
      host: 'smtp.mailtrap.io',
      port: 2525,
      secure: false,
      auth: {
        user: '6a3f1e6588e368',
        pass: '89f594251c40a3'
      }
    }
  },
  {
    name: 'Port 2525 - STARTTLS with requireTLS',
    config: {
      host: 'smtp.mailtrap.io',
      port: 2525,
      secure: false,
      requireTLS: true,
      tls: {
        rejectUnauthorized: false
      },
      auth: {
        user: '6a3f1e6588e368',
        pass: '89f594251c40a3'
      }
    }
  },
  {
    name: 'Port 2525 - TLS (secure: true)',
    config: {
      host: 'smtp.mailtrap.io',
      port: 2525,
      secure: true,
      auth: {
        user: '6a3f1e6588e368',
        pass: '89f594251c40a3'
      }
    }
  },
  {
    name: 'Port 465 - Implicit TLS',
    config: {
      host: 'smtp.mailtrap.io',
      port: 465,
      secure: true,
      auth: {
        user: '6a3f1e6588e368',
        pass: '89f594251c40a3'
      }
    }
  },
  {
    name: 'Port 587 - Standard SMTP',
    config: {
      host: 'smtp.mailtrap.io',
      port: 587,
      secure: false,
      requireTLS: true,
      tls: {
        rejectUnauthorized: false
      },
      auth: {
        user: '6a3f1e6588e368',
        pass: '89f594251c40a3'
      }
    }
  },
  {
    name: 'Port 2525 - No TLS with ignoreTLS',
    config: {
      host: 'smtp.mailtrap.io',
      port: 2525,
      secure: false,
      ignoreTLS: true,
      auth: {
        user: '6a3f1e6588e368',
        pass: '89f594251c40a3'
      }
    }
  }
];

async function testEmailConfig(config: any, name: string) {
  console.log(`\n=== Testing: ${name} ===`);
  console.log('Config:', JSON.stringify(config, null, 2));
  
  const transporter = nodemailer.createTransport(config);
  
  try {
    const result = await transporter.sendMail({
      from: 'Test <noreply@trackyourpocket.com>',
      to: 'wasif@test.com',
      subject: 'Test Email - ' + name,
      text: 'This is a test email to verify SMTP configuration.',
      html: '<p>This is a test email to verify SMTP configuration.</p>'
    });
    
    console.log('✅ SUCCESS! MessageId:', result.messageId);
    return { success: true, name, messageId: result.messageId };
  } catch (error: any) {
    console.log('❌ FAILED:', error.message);
    return { success: false, name, error: error.message };
  }
}

async function runTests() {
  console.log('Starting email configuration tests...\n');
  
  const results: { success: boolean; name: string; error?: string }[] = [];
  
  for (const { name, config } of testConfigurations) {
    const result = await testEmailConfig(config, name);
    results.push(result);
    
    // Wait a bit between tests
    await new Promise(resolve => setTimeout(resolve, 1000));
  }
  
  console.log('\n\n=== SUMMARY ===');
  console.log('===============');
  
  const successResults = results.filter(r => r.success);
  const failedResults = results.filter(r => !r.success);
  
  console.log(`\n✅ Successful (${successResults.length}):`);
  successResults.forEach(r => console.log(`  - ${r.name}`));
  
  console.log(`\n❌ Failed (${failedResults.length}):`);
  failedResults.forEach(r => console.log(`  - ${r.name}: ${r.error?.substring(0, 100)}`));
  
  if (successResults.length > 0) {
    console.log('\n🎉 Working configuration:');
    console.log(JSON.stringify(testConfigurations.find(c => c.name === successResults[0].name)?.config, null, 2));
  }
}

runTests().catch(console.error);