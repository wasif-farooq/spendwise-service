import { randomUUID } from 'crypto';
import { ConfigLoader } from '../src/config/ConfigLoader';

interface EventPayload {
	type: string;
	data: {
		object: Record<string, unknown>;
	};
}

const EVENT_TEMPLATES: Record<string, (subscriptionId: string, customerId: string) => EventPayload> = {
	'invoice.payment_succeeded': (subscriptionId, customerId) => ({
		type: 'invoice.payment_succeeded',
		data: {
			object: {
				id: `in_${randomUUID().slice(0, 16)}`,
				object: 'invoice',
				subscription: subscriptionId,
				customer: customerId,
				amount_paid: 1900,
				amount_due: 1900,
				currency: 'usd',
				status: 'paid',
				paid: true,
				created: Math.floor(Date.now() / 1000),
				invoice_pdf: 'https://pay.stripe.com/invoice/inv_test.pdf',
			},
		},
	}),

	'invoice.payment_failed': (subscriptionId, customerId) => ({
		type: 'invoice.payment_failed',
		data: {
			object: {
				id: `in_${randomUUID().slice(0, 16)}`,
				object: 'invoice',
				subscription: subscriptionId,
				customer: customerId,
				amount_due: 1900,
				currency: 'usd',
				status: 'open',
				created: Math.floor(Date.now() / 1000),
				attempt_count: 1,
				next_payment_attempt: Math.floor(Date.now() / 1000) + 3600,
			},
		},
	}),

	'customer.subscription.updated': (subscriptionId, customerId) => ({
		type: 'customer.subscription.updated',
		data: {
			object: {
				id: subscriptionId,
				object: 'subscription',
				customer: customerId,
				status: 'active',
				current_period_start: Math.floor(Date.now() / 1000),
				current_period_end: Math.floor(Date.now() / 1000) + 30 * 24 * 60 * 60,
				cancel_at_period_end: false,
				items: {
					data: [
						{
							id: `si_${randomUUID().slice(0, 12)}`,
							price: {
								id: 'price_1TRq3eRszVgJB3cXyqEbF7qL',
								unit_amount: 1900,
								recurring: { interval: 'month' },
							},
						},
					],
				},
			},
		},
	}),

	'customer.subscription.deleted': (subscriptionId, customerId) => ({
		type: 'customer.subscription.deleted',
		data: {
			object: {
				id: subscriptionId,
				object: 'subscription',
				customer: customerId,
				status: 'canceled',
				canceled_at: Math.floor(Date.now() / 1000),
				current_period_end: Math.floor(Date.now() / 1000),
			},
		},
	}),

	'checkout.session.completed': (subscriptionId, customerId) => ({
		type: 'checkout.session.completed',
		data: {
			object: {
				id: `cs_${randomUUID().slice(0, 16)}`,
				object: 'checkout.session',
				customer: customerId,
				subscription: subscriptionId,
				client_reference_id: null,
				metadata: {
					userId: null,
					planId: '5bfe3ea4-1093-4359-a8ca-8b634795a5c2',
				},
				amount_total: 1900,
				currency: 'usd',
				mode: 'subscription',
				status: 'complete',
			},
		},
	}),

	'customer.subscription.created': (subscriptionId, customerId) => ({
		type: 'customer.subscription.created',
		data: {
			object: {
				id: subscriptionId,
				object: 'subscription',
				customer: customerId,
				status: 'active',
				current_period_start: Math.floor(Date.now() / 1000),
				current_period_end: Math.floor(Date.now() / 1000) + 30 * 24 * 60 * 60,
				cancel_at_period_end: false,
			},
		},
	}),
};

function printUsage() {
	console.log(`
Usage: ts-node scripts/test-webhook.ts <event_type> [subscriptionId] [customerId]

Event types:
  - invoice.payment_succeeded    : Simulate successful payment (recurring)
  - invoice.payment_failed       : Simulate failed payment
  - customer.subscription.updated: Simulate plan change
  - customer.subscription.deleted: Simulate cancellation
  - checkout.session.completed   : Simulate new checkout
  - customer.subscription.created: Simulate new subscription

Examples:
  ts-node scripts/test-webhook.ts invoice.payment_succeeded sub_xxx cus_xxx
  ts-node scripts/test-webhook.ts invoice.payment_failed
  ts-node scripts/test-webhook.ts customer.subscription.updated

Default values (if not provided):
  subscriptionId: sub_1TRrXxRszVgJB3cXb4SoBLlm
  customerId: cus_UQisnzvWUAVirG
`);
}

async function sendWebhook(event: EventPayload, webhookSecret: string) {
	const endpoint = 'http://localhost:3000/api/v1/payment/webhook/stripe';

	const timestamp = Math.floor(Date.now() / 1000);
	const payload = JSON.stringify(event);

	const crypto = require('crypto');
	const signedPayload = `${timestamp}.${payload}`;
	const signature = crypto
		.createHmac('sha256', webhookSecret)
		.update(signedPayload)
		.digest('hex');

	const response = await fetch(endpoint, {
		method: 'POST',
		headers: {
			'Content-Type': 'application/json',
			'Stripe-Signature': `t=${timestamp},v1=${signature}`,
		},
		body: payload,
	});

	return {
		status: response.status,
		body: await response.text(),
	};
}

async function main() {
	const args = process.argv.slice(2);

	if (args.length === 0 || args[0] === 'help' || args[0] === '--help' || args[0] === '-h') {
		printUsage();
		process.exit(0);
	}

	const eventType = args[0];
	const subscriptionId = args[1] || 'sub_1TRrXxRszVgJB3cXb4SoBLlm';
	const customerId = args[2] || 'cus_UQisnzvWUAVirG';

	const template = EVENT_TEMPLATES[eventType];
	if (!template) {
		console.error(`Unknown event type: ${eventType}`);
		printUsage();
		process.exit(1);
	}

	const config = ConfigLoader.getInstance();
	const webhookSecret = config.get('stripe.webhookSecret');

	if (!webhookSecret) {
		console.error('Error: stripe.webhookSecret is not configured');
		console.log('Add STRIPE_WEBHOOK_SECRET to your environment or config');
		process.exit(1);
	}

	const event = template(subscriptionId, customerId);

	console.log(`\nSending webhook event: ${eventType}`);
	console.log(`Subscription: ${subscriptionId}`);
	console.log(`Customer: ${customerId}`);
	console.log(`Payload: ${JSON.stringify(event, null, 2)}\n`);

	try {
		const response = await sendWebhook(event, webhookSecret);
		console.log(`Response Status: ${response.status}`);
		console.log(`Response Body: ${response.body}`);

		if (response.status >= 200 && response.status < 300) {
			console.log('\n✅ Webhook sent successfully!');
		} else {
			console.log('\n❌ Webhook failed!');
			process.exit(1);
		}
	} catch (error: any) {
		console.error('Error sending webhook:', error.message);
		console.log('\nMake sure the API server is running: pnpm dev:api');
		process.exit(1);
	}
}

main();