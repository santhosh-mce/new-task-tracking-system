BEGIN;

DO $$
BEGIN
    IF EXISTS (
        SELECT lower(email)
        FROM users
        GROUP BY lower(email)
        HAVING count(*) > 1
    ) THEN
        RAISE EXCEPTION
            'Cannot add case-insensitive email uniqueness while duplicate user emails exist';
    END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS uq_users_email_lower
    ON users (lower(email));

CREATE TABLE IF NOT EXISTS user_invitations (
    id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL UNIQUE REFERENCES users(id) ON DELETE RESTRICT,
    role VARCHAR(20) NOT NULL,
    token_hash VARCHAR(64) UNIQUE,
    sent_at TIMESTAMPTZ,
    expires_at TIMESTAMPTZ,
    completed_at TIMESTAMPTZ,
    revoked_at TIMESTAMPTZ,
    last_attempt_at TIMESTAMPTZ,
    attempt_window_started_at TIMESTAMPTZ,
    window_attempt_count INTEGER NOT NULL DEFAULT 0,
    CONSTRAINT ck_user_invitations_role
        CHECK (role IN ('admin', 'manager', 'employee', 'intern')),
    CONSTRAINT ck_user_invitations_window_attempt_count
        CHECK (window_attempt_count >= 0 AND window_attempt_count <= 5)
);

CREATE INDEX IF NOT EXISTS ix_user_invitations_user_id
    ON user_invitations(user_id);

COMMIT;
