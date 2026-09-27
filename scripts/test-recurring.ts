import { Client } from 'pg';
import { ConfigLoader } from '../src/config/ConfigLoader';

async function main() {
	const configLoader = ConfigLoader.getInstance();
	const dbConfig = configLoader.get('database.postgres');

	const client = new Client({
		host: dbConfig.host,
		port: dbConfig.port,
		user: dbConfig.username,
		password: dbConfig.password,
		database: dbConfig.database,
		ssl: dbConfig.ssl
	});

	try {
		await client.connect();
		const result = await client.query(`
            SELECT id, user_id, plan_id, status, merchant_subscription_id, current_period_end
            FROM user_subscriptions
            WHERE merchant_subscription_id IS NOT NULL AND merchant_subscription_id != ''
            ORDER BY created_at DESC LIMIT 10
        `);

		console.log(`Found ${result.rows.length} subscription(s):`);
		result.rows.forEach((row, i) => {
			const periodEnd = row.current_period_end
				? new Date(row.current_period_end).toISOString()
				: 'Not set';
			console.log(`${i + 1}. user=${row.user_id} plan=${row.plan_id} status=${row.status}`);
			console.log(`   period_end=${periodEnd}`);
			console.log(`   merchantSubscriptionId=${row.merchant_subscription_id || '(none)'}`);
			console.log('');
		});
	} catch (err) {
		console.error('Error:', err);
		process.exit(1);
	} finally {
		await client.end();
	}
}
main();
