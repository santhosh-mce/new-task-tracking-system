BEGIN;

-- Add internship tracking fields to user_profiles
ALTER TABLE user_profiles ADD COLUMN IF NOT EXISTS internship_end_date DATE;
ALTER TABLE user_profiles ADD COLUMN IF NOT EXISTS internship_status VARCHAR(40) DEFAULT 'Active';

COMMIT;
