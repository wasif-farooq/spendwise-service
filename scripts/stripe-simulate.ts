import Stripe from 'stripe';
import { ConfigLoader } from '../src/config/ConfigLoader';

type StripeClient = InstanceType<typeof Stripe>;

const formatTimestamp = (timestamp: number | undefined | null): string => {
	if (!timestamp) return 'N/A';
	try {
		const date = new Date(timestamp * 1000);
		return isNaN(date.getTime()) ? 'Invalid' : date.toISOString();
	} catch {
		return 'Error';
	}
};

const ACTIONS: Record<string, (stripe: StripeClient | null, args: string[]) => Promise<void>> = {
	'invoice-create': async (stripe, args) => {
		const subscriptionId = args[0] || 'sub_1TRrXxRszVgJB3cXb4SoBLlm';
		const customerId = args[1] || 'cus_UQisnzvWUAVirG';
		const amount = parseInt(args[2]) || 1900;

		console.log(`Creating invoice item for customer ${customerId}...`);
		await stripe!.invoiceItems.create({
			customer: customerId,
			amount: amount,
			currency: 'usd',
			description: 'Test recurring payment',
		});

		console.log('Creating invoice...');
		const invoice = await stripe!.invoices.create({
			customer: customerId,
			collection_method: 'charge_automatically',
			subscription: subscriptionId,
		});

		console.log(`Invoice created: ${invoice.id}`);
		console.log(`Status: ${invoice.status}`);
		console.log(`Amount: $${invoice.amount_due / 100}`);

		console.log('\nFinalizing and paying invoice...');
		const paidInvoice = await stripe!.invoices.pay(invoice.id);

		console.log(`\n✅ Invoice paid: ${paidInvoice.id}`);
		console.log(`Status: ${paidInvoice.status}`);
		console.log(`Paid at: ${new Date((paidInvoice as any).paid_at * 1000).toISOString()}`);
	},

	'invoice-fail': async (stripe, args) => {
		const subscriptionId = args[0] || 'sub_1TRrXxRszVgJB3cXb4SoBLlm';
		const customerId = args[1] || 'cus_UQisnzvWUAVirG';

		console.log(`Creating invoice item with failing payment for customer ${customerId}...`);
		await stripe!.invoiceItems.create({
			customer: customerId,
			amount: 1900,
			currency: 'usd',
			description: 'Test failed payment',
		});

		console.log('Creating invoice...');
		const invoice = await stripe!.invoices.create({
			customer: customerId,
			collection_method: 'charge_automatically',
			subscription: subscriptionId,
		});

		console.log(`\nFailed invoice created: ${invoice.id}`);
		console.log('Note: Full failure simulation requires Stripe test card setup');
	},

	'subscription-update': async (stripe, args) => {
		const subscriptionId = args[0] || 'sub_1TRrXxRszVgJB3cXb4SoBLlm';

		console.log(`Fetching subscription: ${subscriptionId}`);
		const subscription = await stripe!.subscriptions.retrieve(subscriptionId);

		console.log(`Current status: ${subscription.status}`);
		console.log(`Cancel at period end: ${subscription.cancel_at_period_end}`);

		console.log('\nUpdating subscription (marking for cancellation)...');
		const updated = await stripe!.subscriptions.update(subscriptionId, {
			cancel_at_period_end: true,
		});

		console.log(`\n✅ Subscription updated`);
		console.log(`Cancel at period end: ${updated.cancel_at_period_end}`);
		console.log(`Current period end: ${formatTimestamp((subscription as any).current_period_end)}`);
	},

	'subscription-reactivate': async (stripe, args) => {
		const subscriptionId = args[0] || 'sub_1TRrXxRszVgJB3cXb4SoBLlm';

		console.log(`Fetching subscription: ${subscriptionId}`);
		const subscription = await stripe!.subscriptions.retrieve(subscriptionId);

		console.log(`Current cancel_at_period_end: ${subscription.cancel_at_period_end}`);

		if (!subscription.cancel_at_period_end) {
			console.log('\n⚠️ Subscription is not set to cancel. Nothing to reactivate.');
			return;
		}

		console.log('\nReactivating subscription (removing cancellation)...');
		const updated = await stripe!.subscriptions.update(subscriptionId, {
			cancel_at_period_end: false,
		});

		console.log(`\n✅ Subscription reactivated`);
		console.log(`Cancel at period end: ${updated.cancel_at_period_end}`);
	},

	'subscription-cancel': async (stripe, args) => {
		const subscriptionId = args[0] || 'sub_1TRrXxRszVgJB3cXb4SoBLlm';
		const immediately = args[1] === '--now';

		console.log(`Canceling subscription: ${subscriptionId}`);
		console.log(`Immediate cancellation: ${immediately}`);

		if (immediately) {
			const canceled = await stripe!.subscriptions.cancel(subscriptionId);
			console.log(`\n✅ Subscription cancelled immediately`);
			console.log(`Status: ${canceled.status}`);
		} else {
			const updated = await stripe!.subscriptions.update(subscriptionId, {
				cancel_at_period_end: true,
			});
			console.log(`\n✅ Subscription will cancel at period end`);
			console.log(`Cancel at period end: ${updated.cancel_at_period_end}`);
			console.log(`Current period end: ${formatTimestamp((updated as any).current_period_end)}`);
		}
	},

	'subscription-details': async (stripe, args) => {
		const subscriptionId = args[0] || 'sub_1TRrXxRszVgJB3cXb4SoBLlm';

		console.log(`Fetching subscription: ${subscriptionId}`);
		const subscription = await stripe!.subscriptions.retrieve(subscriptionId) as any;

		console.log('\n=== Subscription Details ===');
		console.log(`ID: ${subscription.id}`);
		console.log(`Status: ${subscription.status}`);
		console.log(`Customer: ${subscription.customer}`);
		console.log(`Current Period: ${formatTimestamp(subscription.current_period_start)} to ${formatTimestamp(subscription.current_period_end)}`);
		console.log(`Cancel at Period End: ${subscription.cancel_at_period_end}`);
		console.log(`Created: ${formatTimestamp(subscription.created)}`);

		if (subscription.items?.data?.length) {
			console.log('\n=== Items ===');
			subscription.items.data.forEach((item: any, i: number) => {
				console.log(`Item ${i + 1}:`);
				console.log(`  Price: ${item.price.id}`);
				console.log(`  Amount: $${item.price.unit_amount / 100}/${item.price.recurring.interval}`);
			});
		}

		console.log('\n=== Raw JSON ===');
		console.log(JSON.stringify(subscription, null, 2));
	},

	'help': async () => {
		console.log(`
Stripe Simulation Commands
=============================

Usage: pnpm stripe:simulate <action> [args]

Actions:
  invoice-create  [subscriptionId] [customerId] [amount]
    - Create and pay an invoice (simulate recurring payment)

  invoice-fail   [subscriptionId] [customerId]
    - Simulate failed payment

  subscription-update   [subscriptionId]
    - Mark subscription for cancellation at period end

  subscription-reactivate [subscriptionId]
    - Remove cancellation (reactivate subscription)

  subscription-cancel    [subscriptionId] [--now]
    - Cancel subscription (use --now for immediate cancellation)

  subscription-details    [subscriptionId]
    - Show full subscription details

  help
    - Show this help message

Examples:
  pnpm stripe:simulate invoice-create
  pnpm stripe:simulate subscription-details
  pnpm stripe:simulate subscription-cancel --now

Default values:
  subscriptionId: sub_1TRrXxRszVgJB3cXb4SoBLlm
  customerId: cus_UQisnzvWUAVirG
`);
	},
};

function printUsage() {
	console.log(`
Usage: pnpm stripe:simulate <action> [args]

Actions:
  invoice-create  : Create and pay an invoice (simulate recurring payment)
  invoice-fail   : Simulate failed payment
  subscription-update   : Mark subscription for cancellation
  subscription-reactivate : Remove cancellation
  subscription-cancel    : Cancel subscription
  subscription-details    : Show subscription details
  help          : Show help

Run 'pnpm stripe:simulate help' for more details.
`);
}

async function main() {
	const args = process.argv.slice(2);

	if (args.length === 0 || args[0] === 'help' || args[0] === '--help' || args[0] === '-h') {
		await ACTIONS['help'](null, []);
		process.exit(0);
	}

	const action = args[0];
	const actionFn = ACTIONS[action];

	if (!actionFn) {
		console.error(`Unknown action: ${action}`);
		printUsage();
		process.exit(1);
	}

	const config = ConfigLoader.getInstance();
	const secretKey = config.get('stripe.secretKey');

	if (!secretKey) {
		console.error('Error: stripe.secretKey is not configured');
		process.exit(1);
	}

	const stripe = new Stripe(secretKey);

	try {
		await actionFn(stripe, args.slice(1));
	} catch (error: any) {
		console.error(`\n❌ Error: ${error.message}`);
		if (error.type) {
			console.error(`Type: ${error.type}`);
		}
		if (error.code) {
			console.error(`Code: ${error.code}`);
		}
		process.exit(1);
	}
}

main();