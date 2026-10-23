BEGIN;

CREATE TABLE IF NOT EXISTS daily_work_updates (
    id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    project_id INTEGER REFERENCES projects(id) ON DELETE SET NULL,
    task_id INTEGER REFERENCES tasks(id) ON DELETE SET NULL,
    update_date DATE NOT NULL DEFAULT CURRENT_DATE,
    work_description TEXT NOT NULL,
    work_status VARCHAR(40) NOT NULL DEFAULT 'In Progress',
    progress_percentage INTEGER NOT NULL DEFAULT 0,
    blockers TEXT,
    tomorrow_plan TEXT,
    attachment_url VARCHAR(500),
    live_link VARCHAR(500),
    remarks TEXT,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS ix_daily_work_updates_user_id ON daily_work_updates(user_id);
CREATE INDEX IF NOT EXISTS ix_daily_work_updates_project_id ON daily_work_updates(project_id);
CREATE INDEX IF NOT EXISTS ix_daily_work_updates_task_id ON daily_work_updates(task_id);
CREATE INDEX IF NOT EXISTS ix_daily_work_updates_update_date ON daily_work_updates(update_date);

COMMIT;
