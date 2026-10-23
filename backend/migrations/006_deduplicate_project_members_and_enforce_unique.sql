-- Migration 006: Deduplicate project members and task assignments and ensure unique constraints
BEGIN;

-- 1. Deduplicate project_members keeping the lowest id for any (project_id, user_id)
DELETE FROM project_members a
USING project_members b
WHERE a.id > b.id
  AND a.project_id = b.project_id
  AND a.user_id = b.user_id;

-- 2. Ensure unique constraint on project_members (project_id, user_id)
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'uq_project_members_project_user'
    ) THEN
        ALTER TABLE project_members
        ADD CONSTRAINT uq_project_members_project_user UNIQUE (project_id, user_id);
    END IF;
END $$;

-- 3. Deduplicate task_assignments keeping the lowest id for any (task_id, user_id)
DELETE FROM task_assignments a
USING task_assignments b
WHERE a.id > b.id
  AND a.task_id = b.task_id
  AND a.user_id = b.user_id;

-- 4. Ensure unique constraint on task_assignments (task_id, user_id)
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'uq_task_assignments_task_user'
    ) THEN
        ALTER TABLE task_assignments
        ADD CONSTRAINT uq_task_assignments_task_user UNIQUE (task_id, user_id);
    END IF;
END $$;

COMMIT;
