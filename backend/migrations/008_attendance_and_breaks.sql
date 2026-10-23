BEGIN;

-- 1. Attendance Policy configuration table
CREATE TABLE IF NOT EXISTS attendance_policies (
    id SERIAL PRIMARY KEY,
    company_name VARCHAR(100) NOT NULL DEFAULT 'Ingage',
    shift_start_time TIME NOT NULL DEFAULT '09:30:00',
    grace_period_minutes INTEGER NOT NULL DEFAULT 15,
    expected_daily_hours NUMERIC(4, 2) NOT NULL DEFAULT 8.00,
    cutoff_time TIME NOT NULL DEFAULT '14:00:00',
    timezone VARCHAR(50) NOT NULL DEFAULT 'Asia/Kolkata',
    deduct_lunch_break BOOLEAN NOT NULL DEFAULT TRUE,
    deduct_tea_break BOOLEAN NOT NULL DEFAULT FALSE,
    deduct_personal_break BOOLEAN NOT NULL DEFAULT TRUE,
    deduct_short_break BOOLEAN NOT NULL DEFAULT FALSE,
    max_break_minutes INTEGER NOT NULL DEFAULT 60,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Seed default policy if empty
INSERT INTO attendance_policies (
    id, company_name, shift_start_time, grace_period_minutes,
    expected_daily_hours, cutoff_time, timezone,
    deduct_lunch_break, deduct_tea_break, deduct_personal_break, deduct_short_break,
    max_break_minutes, updated_at
)
SELECT 1, 'Ingage', '09:30:00', 15, 8.00, '14:00:00', 'Asia/Kolkata', TRUE, FALSE, TRUE, FALSE, 60, NOW()
WHERE NOT EXISTS (SELECT 1 FROM attendance_policies WHERE id = 1);

-- 2. Daily Attendance records table (per user per business date)
CREATE TABLE IF NOT EXISTS daily_attendances (
    id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    date DATE NOT NULL,
    status VARCHAR(30) NOT NULL DEFAULT 'Not Checked In',
    first_check_in TIMESTAMPTZ,
    last_check_out TIMESTAMPTZ,
    total_work_minutes INTEGER NOT NULL DEFAULT 0,
    total_break_minutes INTEGER NOT NULL DEFAULT 0,
    net_work_minutes INTEGER NOT NULL DEFAULT 0,
    is_finalized BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_daily_attendance_user_date UNIQUE (user_id, date)
);

CREATE INDEX IF NOT EXISTS ix_daily_attendances_user_id ON daily_attendances(user_id);
CREATE INDEX IF NOT EXISTS ix_daily_attendances_date ON daily_attendances(date);
CREATE INDEX IF NOT EXISTS ix_daily_attendances_status ON daily_attendances(status);
CREATE INDEX IF NOT EXISTS ix_daily_attendances_user_date ON daily_attendances(user_id, date);

-- 3. Attendance Sessions table (supports multiple login/logout sessions per day)
CREATE TABLE IF NOT EXISTS attendance_sessions (
    id SERIAL PRIMARY KEY,
    attendance_id INTEGER NOT NULL REFERENCES daily_attendances(id) ON DELETE CASCADE,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    check_in TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    check_out TIMESTAMPTZ,
    duration_minutes INTEGER,
    source VARCHAR(30) NOT NULL DEFAULT 'manual',
    ip_address VARCHAR(45),
    user_agent TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS ix_attendance_sessions_attendance_id ON attendance_sessions(attendance_id);
CREATE INDEX IF NOT EXISTS ix_attendance_sessions_user_id ON attendance_sessions(user_id);
CREATE INDEX IF NOT EXISTS ix_attendance_sessions_check_in ON attendance_sessions(check_in);
CREATE INDEX IF NOT EXISTS ix_attendance_sessions_check_out ON attendance_sessions(check_out);

-- 4. Attendance Breaks table
CREATE TABLE IF NOT EXISTS attendance_breaks (
    id SERIAL PRIMARY KEY,
    attendance_id INTEGER NOT NULL REFERENCES daily_attendances(id) ON DELETE CASCADE,
    session_id INTEGER REFERENCES attendance_sessions(id) ON DELETE SET NULL,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    break_type VARCHAR(30) NOT NULL DEFAULT 'Lunch',
    start_time TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    end_time TIMESTAMPTZ,
    duration_minutes INTEGER,
    is_deducted BOOLEAN NOT NULL DEFAULT TRUE,
    reason TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS ix_attendance_breaks_attendance_id ON attendance_breaks(attendance_id);
CREATE INDEX IF NOT EXISTS ix_attendance_breaks_user_id ON attendance_breaks(user_id);
CREATE INDEX IF NOT EXISTS ix_attendance_breaks_start_time ON attendance_breaks(start_time);
CREATE INDEX IF NOT EXISTS ix_attendance_breaks_end_time ON attendance_breaks(end_time);

-- 5. Attendance Corrections table & review audit history
CREATE TABLE IF NOT EXISTS attendance_corrections (
    id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    attendance_id INTEGER REFERENCES daily_attendances(id) ON DELETE SET NULL,
    request_date DATE NOT NULL,
    requested_check_in TIMESTAMPTZ NOT NULL,
    requested_check_out TIMESTAMPTZ NOT NULL,
    requested_break_minutes INTEGER DEFAULT 0,
    reason TEXT NOT NULL,
    status VARCHAR(20) NOT NULL DEFAULT 'Pending',
    reviewed_by_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
    reviewer_remarks TEXT,
    reviewed_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS ix_attendance_corrections_user_id ON attendance_corrections(user_id);
CREATE INDEX IF NOT EXISTS ix_attendance_corrections_request_date ON attendance_corrections(request_date);
CREATE INDEX IF NOT EXISTS ix_attendance_corrections_status ON attendance_corrections(status);

-- 6. User Leaves table (to avoid marking Absent when user is on leave or holiday)
CREATE TABLE IF NOT EXISTS user_leaves (
    id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    leave_date DATE NOT NULL,
    leave_type VARCHAR(50) NOT NULL DEFAULT 'Casual Leave',
    status VARCHAR(20) NOT NULL DEFAULT 'Approved',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_user_leaves_user_date UNIQUE (user_id, leave_date)
);

CREATE INDEX IF NOT EXISTS ix_user_leaves_user_date ON user_leaves(user_id, leave_date);

COMMIT;
