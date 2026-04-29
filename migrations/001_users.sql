-- 001_users.sql - Core authentication tables
-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Users Table
CREATE TABLE "users" (
    "id" UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    "email" VARCHAR(255) UNIQUE NOT NULL,
    "first_name" VARCHAR(100),
    "last_name" VARCHAR(100),
    "is_active" BOOLEAN DEFAULT true,
    "role" VARCHAR(50) DEFAULT 'free',
    "status" VARCHAR(50) DEFAULT 'active',
    "created_at" TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    "deleted_at" TIMESTAMP WITH TIME ZONE,
    "avatar" VARCHAR(500),
    "email_verified" BOOLEAN DEFAULT false,
    "email_verification_code" VARCHAR(10),
    "email_verified_at" TIMESTAMP WITH TIME ZONE,
    "two_factor_enabled" BOOLEAN DEFAULT false,
    "two_factor_method" VARCHAR(20),
    "two_factor_secret" VARCHAR(255),
    "backup_codes" TEXT[]
);

-- Auth Identities Table
CREATE TABLE "auth_identities" (
    "id" UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    "user_id" UUID REFERENCES "users"("id") ON DELETE CASCADE,
    "provider" VARCHAR(50) NOT NULL,
    "sub" VARCHAR(255),
    "password_hash" VARCHAR(255),
    "created_at" TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    "last_login_at" TIMESTAMP WITH TIME ZONE,
    UNIQUE("provider", "sub")
);

-- Indexes for users
CREATE INDEX "idx_users_email" ON "users"("email");
CREATE INDEX "idx_users_status" ON "users"("status");

-- Indexes for auth_identities
CREATE INDEX "idx_auth_identities_user_id" ON "auth_identities"("user_id");