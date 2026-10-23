BEGIN;

-- Allow team_lead role in user_invitations check constraint
ALTER TABLE user_invitations DROP CONSTRAINT IF EXISTS ck_user_invitations_role;
ALTER TABLE user_invitations ADD CONSTRAINT ck_user_invitations_role
    CHECK (role IN ('admin', 'manager', 'employee', 'intern', 'team_lead'));

COMMIT;
