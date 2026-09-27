-- Migration 021: Payments table for payment history and invoices
-- Stores payment transactions with invoice PDF storage URLs

CREATE TABLE IF NOT EXISTS payments (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id),
    subscription_id UUID REFERENCES user_subscriptions(id),
    stripe_payment_intent_id VARCHAR(100) UNIQUE,
    stripe_invoice_id VARCHAR(100) UNIQUE,
    stripe_charge_id VARCHAR(100),
    amount INTEGER NOT NULL,  -- in cents
    currency VARCHAR(10) NOT NULL DEFAULT 'USD',
    status VARCHAR(50) NOT NULL DEFAULT 'pending',  -- pending, succeeded, failed, refunded
    type VARCHAR(50) NOT NULL DEFAULT 'payment',  -- payment, refund, chargeback
    invoice_url TEXT,  -- Stripe dashboard URL
    invoice_pdf TEXT,  -- S3/MinIO URL for stored PDF
    description TEXT,
    metadata JSONB,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_payments_user_id ON payments(user_id);
CREATE INDEX idx_payments_subscription_id ON payments(subscription_id);
CREATE INDEX idx_payments_stripe_invoice_id ON payments(stripe_invoice_id);
CREATE INDEX idx_payments_status ON payments(status);
CREATE INDEX idx_payments_created_at ON payments(created_at DESC);

-- Add payment_reference to user_subscriptions for easier linking
ALTER TABLE user_subscriptions ADD COLUMN IF NOT EXISTS payment_reference VARCHAR(100);