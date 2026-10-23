-- 015_realtime_attendance_sessions.sql
-- Adds columns for real-time session tracking, live status, heartbeats, and accumulated seconds

ALTER TABLE attendance_sessions
ADD COLUMN IF NOT EXISTS last_heartbeat TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS session_status VARCHAR(30) NOT NULL DEFAULT 'Online',
ADD COLUMN IF NOT EXISTS working_seconds INTEGER NOT NULL DEFAULT 0,
ADD COLUMN IF NOT EXISTS break_seconds INTEGER NOT NULL DEFAULT 0;

CREATE INDEX IF NOT EXISTS ix_attendance_sessions_status ON attendance_sessions(session_status);
CREATE INDEX IF NOT EXISTS ix_attendance_sessions_last_heartbeat ON attendance_sessions(last_heartbeat);

ALTER TABLE users
ADD COLUMN IF NOT EXISTS last_login_at TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS last_seen_at TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS current_status VARCHAR(30) NOT NULL DEFAULT 'Offline';

CREATE INDEX IF NOT EXISTS ix_users_current_status ON users(current_status);
