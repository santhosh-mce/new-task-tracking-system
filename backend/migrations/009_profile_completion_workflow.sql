BEGIN;

-- 1. Add profile_status to users table
ALTER TABLE users ADD COLUMN IF NOT EXISTS profile_status VARCHAR(30) NOT NULL DEFAULT 'incomplete';

-- 2. Drop NOT NULL on users.full_name so password setup can happen before profile details
ALTER TABLE users ALTER COLUMN full_name DROP NOT NULL;
ALTER TABLE users ALTER COLUMN full_name SET DEFAULT '';

-- 3. Mark existing active users with a password as 'complete'
UPDATE users SET profile_status = 'complete' WHERE password_hash IS NOT NULL AND status = 'active';

-- 4. Update check constraint on user_profiles staff_category to allow 'Manager'
ALTER TABLE user_profiles DROP CONSTRAINT IF EXISTS ck_user_profiles_staff_category;
ALTER TABLE user_profiles ADD CONSTRAINT ck_user_profiles_staff_category
    CHECK (staff_category IS NULL OR staff_category IN ('Employee', 'Intern', 'Manager', 'Vendor'));

-- 5. Add staff_id and new profile fields to user_profiles
ALTER TABLE user_profiles ADD COLUMN IF NOT EXISTS staff_id VARCHAR(80);
CREATE UNIQUE INDEX IF NOT EXISTS uq_user_profiles_staff_id ON user_profiles (staff_id) WHERE staff_id IS NOT NULL;

ALTER TABLE user_profiles ADD COLUMN IF NOT EXISTS profile_photo TEXT;
ALTER TABLE user_profiles ADD COLUMN IF NOT EXISTS dob DATE;
ALTER TABLE user_profiles ADD COLUMN IF NOT EXISTS gender VARCHAR(30);
ALTER TABLE user_profiles ADD COLUMN IF NOT EXISTS address TEXT;
ALTER TABLE user_profiles ADD COLUMN IF NOT EXISTS city VARCHAR(100);
ALTER TABLE user_profiles ADD COLUMN IF NOT EXISTS highest_qualification VARCHAR(150);
ALTER TABLE user_profiles ADD COLUMN IF NOT EXISTS institution VARCHAR(200);
ALTER TABLE user_profiles ADD COLUMN IF NOT EXISTS degree VARCHAR(200);
ALTER TABLE user_profiles ADD COLUMN IF NOT EXISTS graduation_year INTEGER;
ALTER TABLE user_profiles ADD COLUMN IF NOT EXISTS resume_url TEXT;
ALTER TABLE user_profiles ADD COLUMN IF NOT EXISTS work_location VARCHAR(120);

COMMIT;
