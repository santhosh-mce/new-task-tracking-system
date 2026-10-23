BEGIN;

-- Allow personal daily tasks without an explicit project
ALTER TABLE tasks ALTER COLUMN project_id DROP NOT NULL;

COMMIT;
