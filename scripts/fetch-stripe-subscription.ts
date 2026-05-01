import Stripe from 'stripe';
import { ConfigLoader } from '../src/config/ConfigLoader';

function formatDate(timestamp: number | undefined | null): string {
	if (!timestamp) return 'N/A';
	try {
		const date = new Date(timestamp * 1000);
		return isNaN(date.getTime()) ? 'Invalid date' : date.toISOString();
	} catch {
		return 'Conversion error';
	}
}

const args = process.argv.slice(2);

if (args.length === 0) {
	console.error('Usage: ts-node scripts/fetch-stripe-subscription.ts <merchantSubscriptionId>');
	console.error('Example: ts-node scripts/fetch-stripe-subscription.ts sub_1234567890');
	process.exit(1);
}

const merchantSubscriptionId = args[0];

async function main() {
	const configLoader = ConfigLoader.getInstance();
	const secretKey = configLoader.get('stripe.secretKey');

	if (!secretKey) {
		console.error('Error: STRIPE_SECRET_KEY is not configured');
		process.exit(1);
	}

	const stripe = new Stripe(secretKey);

	try {
		console.log(`Fetching Stripe subscription: ${merchantSubscriptionId}`);
		const subscription = await stripe.subscriptions.retrieve(merchantSubscriptionId) as any;

		console.log('\n=== Subscription Details ===');
		console.log(`ID: ${subscription.id}`);
		console.log(`Status: ${subscription.status}`);
		console.log(`Current Period Start: ${formatDate(subscription.current_period_start)}`);
		console.log(`Current Period End: ${formatDate(subscription.current_period_end)}`);
		console.log(`Cancel At Period End: ${subscription.cancel_at_period_end}`);
		console.log(`Created: ${formatDate(subscription.created)}`);

		if (subscription.customer) {
			console.log(`\n=== Customer ===`);
			if (typeof subscription.customer === 'string') {
				console.log(`Customer ID: ${subscription.customer}`);
			} else {
				console.log(`Customer ID: ${subscription.customer.id}`);
				console.log(`Customer Email: ${subscription.customer.email}`);
				console.log(`Customer Name: ${subscription.customer.name}`);
			}
		}

		if (subscription.items?.data?.length) {
			console.log(`\n=== Items ===`);
			subscription.items.data.forEach((item: any, index: number) => {
				console.log(`Item ${index + 1}:`);
				console.log(`  Price ID: ${item.price?.id}`);
				console.log(`  Product: ${item.price?.product}`);
				console.log(`  Amount: $${item.price?.unit_amount / 100}/${item.price?.recurring?.interval}`);
				console.log(`  Current Period: ${formatDate(item.current_period_start)} to ${formatDate(item.current_period_end)}`);
			});
		}

		if (subscription.metadata) {
			console.log(`\n=== Metadata ===`);
			console.log(JSON.stringify(subscription.metadata, null, 2));
		}

		console.log('\n=== Raw JSON ===');
		console.log(JSON.stringify(subscription, null, 2));

	} catch (error: any) {
		console.error('Error fetching subscription:', error.message);
		if (error.code === 'resource_missing') {
			console.error(`Subscription "${merchantSubscriptionId}" not found in Stripe`);
		}
		process.exit(1);
	}
}

main();