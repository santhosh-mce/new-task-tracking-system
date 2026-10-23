BEGIN;

CREATE TABLE IF NOT EXISTS projects (
    id SERIAL PRIMARY KEY,
    name VARCHAR(200) NOT NULL,
    description TEXT,
    department VARCHAR(40) NOT NULL,
    start_date DATE NOT NULL,
    end_date DATE NOT NULL,
    status VARCHAR(30) NOT NULL,
    manager_id INTEGER REFERENCES users(id) ON DELETE RESTRICT,
    CONSTRAINT ck_projects_date_range CHECK (end_date >= start_date),
    CONSTRAINT ck_projects_department
        CHECK (department IN ('Ingage', 'Rezov', 'Edutech')),
    CONSTRAINT ck_projects_status
        CHECK (status IN ('Not Started', 'In Progress', 'On Hold', 'Completed', 'Cancelled'))
);

CREATE INDEX IF NOT EXISTS ix_projects_manager_id ON projects(manager_id);
CREATE INDEX IF NOT EXISTS ix_projects_status ON projects(status);
CREATE INDEX IF NOT EXISTS ix_projects_department ON projects(department);

CREATE TABLE IF NOT EXISTS user_profiles (
    id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL UNIQUE REFERENCES users(id) ON DELETE RESTRICT,
    staff_category VARCHAR(20),
    employee_id VARCHAR(80) UNIQUE,
    intern_id VARCHAR(80) UNIQUE,
    mobile VARCHAR(40),
    department VARCHAR(120),
    joining_date DATE,
    reporting_manager_id INTEGER REFERENCES users(id) ON DELETE RESTRICT,
    skills JSONB,
    CONSTRAINT ck_user_profiles_staff_category
        CHECK (staff_category IS NULL OR staff_category IN ('Employee', 'Intern', 'Vendor')),
    CONSTRAINT ck_user_profiles_employee_category
        CHECK (employee_id IS NULL OR staff_category = 'Employee'),
    CONSTRAINT ck_user_profiles_intern_category
        CHECK (intern_id IS NULL OR staff_category = 'Intern')
);

CREATE INDEX IF NOT EXISTS ix_user_profiles_user_id ON user_profiles(user_id);
CREATE INDEX IF NOT EXISTS ix_user_profiles_reporting_manager_id
    ON user_profiles(reporting_manager_id);
CREATE INDEX IF NOT EXISTS ix_user_profiles_staff_category
    ON user_profiles(staff_category);

CREATE TABLE IF NOT EXISTS user_education (
    id SERIAL PRIMARY KEY,
    profile_id INTEGER NOT NULL REFERENCES user_profiles(id) ON DELETE RESTRICT,
    institution VARCHAR(200),
    qualification VARCHAR(200),
    field_of_study VARCHAR(200),
    start_date DATE,
    end_date DATE,
    CONSTRAINT uq_user_education_profile_institution_qualification
        UNIQUE (profile_id, institution, qualification)
);

CREATE INDEX IF NOT EXISTS ix_user_education_profile_id ON user_education(profile_id);

CREATE TABLE IF NOT EXISTS project_members (
    id SERIAL PRIMARY KEY,
    project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE RESTRICT,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    CONSTRAINT uq_project_members_project_user UNIQUE (project_id, user_id)
);

CREATE INDEX IF NOT EXISTS ix_project_members_project_id ON project_members(project_id);
CREATE INDEX IF NOT EXISTS ix_project_members_user_id ON project_members(user_id);

CREATE TABLE IF NOT EXISTS tasks (
    id SERIAL PRIMARY KEY,
    project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE RESTRICT,
    title VARCHAR(200) NOT NULL,
    description TEXT,
    status VARCHAR(40) NOT NULL,
    due_date DATE
);

CREATE INDEX IF NOT EXISTS ix_tasks_project_id ON tasks(project_id);

COMMIT;
