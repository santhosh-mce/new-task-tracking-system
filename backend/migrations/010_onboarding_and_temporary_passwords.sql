BEGIN;

-- 1. Add must_change_password and onboarding_status to users table
ALTER TABLE users ADD COLUMN IF NOT EXISTS must_change_password BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE users ADD COLUMN IF NOT EXISTS onboarding_status VARCHAR(30) NOT NULL DEFAULT 'completed';

-- 2. Add designation to user_profiles
ALTER TABLE user_profiles ADD COLUMN IF NOT EXISTS designation VARCHAR(120);

COMMIT;
