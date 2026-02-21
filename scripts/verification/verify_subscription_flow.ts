
import { ServiceBootstrap } from '../../src/bootstrap/ServiceBootstrap';
import { Container } from '../../src/di/Container';
import { TOKENS } from '../../src/di/tokens';
import { SubscriptionService } from '../../src/domains/subscription/services/SubscriptionService';
import { SubscriptionPlanRepository } from '../../src/domains/subscription/repositories/SubscriptionRepository';

async function verify() {
    // Init
    const bootstrap = ServiceBootstrap.getInstance();
    await bootstrap.initialize('Verification Script');

    const container = Container.getInstance();
    const subService = container.resolve<SubscriptionService>(TOKENS.SubscriptionService);
    const db = container.resolve<any>(TOKENS.Database);

    // 1. Create Test Org
    const orgId = '123e4567-e89b-12d3-a456-426614174000'; // UUID
    const userId = '123e4567-e89b-12d3-a456-426614174001'; // UUID

    // 0. Create Test User
    console.log('Creating test user...');
    await db.query(`DELETE FROM users WHERE id = $1`, [userId]);
    await db.query(`INSERT INTO users (id, email, first_name, last_name, role, created_at, updated_at) VALUES ($1, $2, $3, $4, $5, NOW(), NOW())`,
        [userId, 'test-sub-owner@example.com', 'Test', 'Owner', 'customer']);

    console.log('Creating test organization...');
    // Delete if exists
    await db.query(`DELETE FROM organizations WHERE id = $1`, [orgId]);
    await db.query(`INSERT INTO organizations (id, name, slug, owner_id, created_at, updated_at) VALUES ($1, $2, $3, $4, NOW(), NOW())`,
        [orgId, 'Test Org Subscription', `test-org-${Date.now()}`, userId]);

    try {
        // 2. Subscribe to Free
        console.log('Subscribing to Free plan...');

        await subService.subscribe(orgId, 'free', { provider: 'manual', subscriptionId: 'sub-free-001' });

        let currentSub = await subService.getCurrentSubscription(orgId);
        console.log('Current Subscription:', currentSub?.planId);
        if (currentSub?.planId !== 'free') throw new Error('Failed to subscribe to free');

        // 3. Upgrade to Pro
        console.log('Upgrading to Pro plan...');
        await subService.upgrade(orgId, 'pro');

        currentSub = await subService.getCurrentSubscription(orgId);
        console.log('Current Subscription:', currentSub?.planId);
        console.log('Features Snapshot:', currentSub?.featuresSnapshot);

        if (currentSub?.planId !== 'pro') throw new Error('Failed to upgrade to pro');
        if (!currentSub?.featuresSnapshot.includes('ai_advisor')) throw new Error('Pro features missing in snapshot');

        // 4. Modify Pro Plan definition in DB (Simulate plan change)
        console.log('Modifying Pro plan definition in DB...');
        // Remove 'ai_advisor' from Pro plan in DB
        const newFeatures = JSON.stringify(["basic_reporting", "advanced_reporting"]); // Removed ai_advisor
        await db.query(`UPDATE subscription_plans SET features = $1 WHERE id = 'pro'`, [newFeatures]);

        // 5. Verify Grandfathering
        console.log('Verifying grandfathering...');
        // Fetch subscription again - snapshot should still have 'ai_advisor'
        const subAfterPlanChange = await subService.getCurrentSubscription(orgId);
        console.log('Subscription Features after Plan Change:', subAfterPlanChange?.featuresSnapshot);

        if (!subAfterPlanChange?.featuresSnapshot.includes('ai_advisor')) {
            console.error('❌ Grandfathering FAILED: Feature removed from active subscription snapshot');
            throw new Error('Grandfathering failed');
        } else {
            console.log('✅ Grandfathering VERIFIED: Feature retained in snapshot');
        }

    } finally {
        // Cleanup
        console.log('Cleaning up...');
        await db.query(`DELETE FROM organization_subscriptions WHERE organization_id = $1`, [orgId]);
        await db.query(`DELETE FROM organizations WHERE id = $1`, [orgId]);
        await db.query(`DELETE FROM users WHERE id = $1`, [userId]);
        // Restore Pro Plan
        const originalProFeatures = JSON.stringify(["basic_reporting", "advanced_reporting", "ai_advisor", "export_data"]);
        await db.query(`UPDATE subscription_plans SET features = $1 WHERE id = 'pro'`, [originalProFeatures]);
    }

    process.exit(0);
}

verify().catch(err => {
    console.error(err);
    process.exit(1);
});
