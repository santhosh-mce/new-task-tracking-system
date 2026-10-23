BEGIN;

ALTER TABLE user_profiles ADD COLUMN IF NOT EXISTS state VARCHAR(100);
ALTER TABLE user_profiles ADD COLUMN IF NOT EXISTS country VARCHAR(100);
ALTER TABLE user_profiles ADD COLUMN IF NOT EXISTS education_records JSONB DEFAULT '[]'::jsonb;
ALTER TABLE user_profiles ADD COLUMN IF NOT EXISTS soft_skills JSONB DEFAULT '[]'::jsonb;
ALTER TABLE user_profiles ADD COLUMN IF NOT EXISTS languages JSONB DEFAULT '[]'::jsonb;
ALTER TABLE user_profiles ADD COLUMN IF NOT EXISTS certifications JSONB DEFAULT '[]'::jsonb;
ALTER TABLE user_profiles ADD COLUMN IF NOT EXISTS work_experience JSONB DEFAULT '[]'::jsonb;
ALTER TABLE user_profiles ADD COLUMN IF NOT EXISTS projects JSONB DEFAULT '[]'::jsonb;
ALTER TABLE user_profiles ADD COLUMN IF NOT EXISTS professional_links JSONB DEFAULT '{}'::jsonb;

COMMIT;
