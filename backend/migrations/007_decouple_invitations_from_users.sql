BEGIN;

-- 1. Add email column to user_invitations
ALTER TABLE user_invitations ADD COLUMN IF NOT EXISTS email VARCHAR(255);

-- 2. Populate email from existing users if any records exist
UPDATE user_invitations ui
SET email = lower(u.email)
FROM users u
WHERE ui.user_id = u.id AND ui.email IS NULL;

-- 3. Set email to NOT NULL
ALTER TABLE user_invitations ALTER COLUMN email SET NOT NULL;

-- 4. Create index on lower(email)
CREATE INDEX IF NOT EXISTS ix_user_invitations_email_lower
    ON user_invitations (lower(email));

-- 5. Drop NOT NULL on user_id so user_id can be null before registration
ALTER TABLE user_invitations ALTER COLUMN user_id DROP NOT NULL;

-- 6. Drop UNIQUE constraint on user_id if it exists
ALTER TABLE user_invitations DROP CONSTRAINT IF EXISTS user_invitations_user_id_key;

-- 7. Add invited_by_id foreign key
ALTER TABLE user_invitations ADD COLUMN IF NOT EXISTS invited_by_id INTEGER REFERENCES users(id) ON DELETE SET NULL;

-- 8. Add status column
ALTER TABLE user_invitations ADD COLUMN IF NOT EXISTS status VARCHAR(30) NOT NULL DEFAULT 'pending';

-- 9. Update status of existing completed invitations
UPDATE user_invitations SET status = 'completed' WHERE completed_at IS NOT NULL;

COMMIT;
