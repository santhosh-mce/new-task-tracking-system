import io
import unittest
from datetime import date
from fastapi import HTTPException, UploadFile
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.database import Base
from app.models.user import User
from app.models.staff_profile import StaffProfile, StaffCategory
from app.models.project import Project, ProjectMember, ProjectDepartment, ProjectStatus, ProjectDocument, ProjectLink
from app.models.task import Task, TaskAssignment
from app.schemas.projects import (
    ProjectCreate,
    ProjectUpdate,
    ProjectLinkCreate,
    ProjectLinkUpdate,
    ProjectDocumentUpdate,
    ProjectMembersAssignRequest,
)
from app.routers.projects import (
    create_project,
    get_project,
    list_projects,
    update_project,
    upload_project_document,
    download_project_document,
    update_project_document,
    replace_project_document,
    delete_project_document,
    add_project_link,
    update_project_link,
    delete_project_link,
    assign_project_team,
    list_project_members,
)
from app.routers.users import get_user


class ProjectManagementTests(unittest.TestCase):
    def setUp(self):
        self.engine = create_engine(
            "sqlite://",
            connect_args={"check_same_thread": False},
            poolclass=StaticPool,
        )
        Base.metadata.create_all(self.engine)
        self.Session = sessionmaker(bind=self.engine, autoflush=False)
        self.db = self.Session()

        # Seed users
        self.admin = User(
            id=1,
            full_name="Admin User",
            email="admin@test.com",
            role="admin",
            status="active",
        )
        self.manager = User(
            id=2,
            full_name="Manager User",
            email="manager@test.com",
            role="manager",
            status="active",
        )
        self.emp = User(
            id=3,
            full_name="Emp One",
            email="emp1@test.com",
            role="employee",
            status="active",
        )
        self.intern = User(
            id=4,
            full_name="Intern One",
            email="intern1@test.com",
            role="intern",
            status="active",
        )
        self.inactive_user = User(
            id=5,
            full_name="Inactive Guy",
            email="inactive@test.com",
            role="employee",
            status="inactive",
        )
        self.db.add_all([self.admin, self.manager, self.emp, self.intern, self.inactive_user])
        self.db.commit()

    def tearDown(self):
        self.db.close()
        self.engine.dispose()

    def test_create_project_success(self):
        payload = ProjectCreate(
            name="Alpha Project",
            description="Alpha Description",
            client_name="Acme Corp",
            department=ProjectDepartment.INGAGE,
            start_date=date(2026, 1, 1),
            end_date=date(2026, 6, 30),
            status=ProjectStatus.IN_PROGRESS,
            manager_id=self.manager.id,
            links=[ProjectLinkCreate(title="Specs", url="https://acme.com/specs", description="Docs")],
        )
        res = create_project(payload=payload, db=self.db, current_user=self.admin)
        self.assertEqual(res["name"], "Alpha Project")
        self.assertEqual(res["client_name"], "Acme Corp")
        self.assertEqual(res["department"], ProjectDepartment.INGAGE)
        self.assertEqual(res["manager"].id, self.manager.id)
        self.assertEqual(res["members"], [])
        self.assertEqual(len(res["links"]), 1)
        self.assertEqual(res["links"][0].url, "https://acme.com/specs")

    def test_create_project_invalid_dates(self):
        payload = ProjectCreate(
            name="Invalid Date Project",
            description="Testing dates",
            department=ProjectDepartment.REZOV,
            start_date=date(2026, 7, 1),
            end_date=date(2026, 6, 1),  # start > end
        )
        with self.assertRaises(HTTPException) as ctx:
            create_project(payload=payload, db=self.db, current_user=self.admin)
        self.assertEqual(ctx.exception.status_code, 422)

    def test_create_project_invalid_manager_rejected(self):
        payload = ProjectCreate(
            name="Invalid Manager Project",
            description="Testing invalid manager",
            department=ProjectDepartment.EDUTECH,
            start_date=date(2026, 1, 1),
            end_date=date(2026, 2, 1),
            manager_id=self.emp.id,  # emp is not admin or manager
        )
        with self.assertRaises(HTTPException) as ctx:
            create_project(payload=payload, db=self.db, current_user=self.admin)
        self.assertEqual(ctx.exception.status_code, 400)
        self.assertIn("Selected Project Manager must have an Admin or Manager role", ctx.exception.detail)

    def test_update_project_success(self):
        proj = Project(
            name="Beta Project",
            description="Initial Beta",
            client_name="Beta Client",
            department=ProjectDepartment.REZOV,
            start_date=date(2026, 1, 1),
            end_date=date(2026, 5, 1),
            status=ProjectStatus.NOT_STARTED,
            manager_id=self.manager.id,
        )
        self.db.add(proj)
        self.db.commit()
        self.db.refresh(proj)

        update_payload = ProjectUpdate(
            name="Beta Project Revised",
            status=ProjectStatus.IN_PROGRESS,
        )
        res = update_project(
            project_id=proj.id,
            payload=update_payload,
            db=self.db,
            current_user=self.admin,
        )
        self.assertEqual(res["name"], "Beta Project Revised")
        self.assertEqual(res["status"], ProjectStatus.IN_PROGRESS)

    def test_update_project_preserves_fields_when_omitted(self):
        proj = Project(
            name="Preserve Fields Test",
            description="Testing preserving fields on edit",
            client_name="Preserve Inc",
            department=ProjectDepartment.REZOV,
            start_date=date(2026, 2, 1),
            end_date=date(2026, 6, 1),
            status=ProjectStatus.NOT_STARTED,
            manager_id=self.manager.id,
        )
        self.db.add(proj)
        self.db.commit()
        self.db.refresh(proj)

        # Update other fields without specifying manager_id
        update_payload = ProjectUpdate(
            name="Preserve Fields Revised Name",
            client_name="Preserve Inc Updated",
            status=ProjectStatus.IN_PROGRESS,
        )
        res = update_project(
            project_id=proj.id,
            payload=update_payload,
            db=self.db,
            current_user=self.admin,
        )
        self.assertEqual(res["name"], "Preserve Fields Revised Name")
        self.assertEqual(res["client_name"], "Preserve Inc Updated")
        self.assertEqual(res["status"], ProjectStatus.IN_PROGRESS)
        self.assertEqual(res["manager"].id, self.manager.id)

    def test_project_links_crud(self):
        proj = Project(
            name="Link Test Proj",
            description="Testing links",
            department=ProjectDepartment.INGAGE,
            start_date=date(2026, 1, 1),
            end_date=date(2026, 5, 1),
            status=ProjectStatus.NOT_STARTED,
        )
        self.db.add(proj)
        self.db.commit()

        # Add link
        link = add_project_link(
            project_id=proj.id,
            payload=ProjectLinkCreate(title="GitHub", url="https://github.com/org/repo", description="Source Code"),
            db=self.db,
            current_user=self.admin,
        )
        self.assertEqual(link.title, "GitHub")
        self.assertEqual(link.url, "https://github.com/org/repo")

        # Update link
        updated_link = update_project_link(
            project_id=proj.id,
            link_id=link.id,
            payload=ProjectLinkUpdate(title="GitHub Main Repo"),
            db=self.db,
            current_user=self.admin,
        )
        self.assertEqual(updated_link.title, "GitHub Main Repo")

        # Delete link
        del_res = delete_project_link(
            project_id=proj.id,
            link_id=link.id,
            db=self.db,
            current_user=self.admin,
        )
        self.assertIn("successfully", del_res["detail"])

    def test_project_documents_crud(self):
        proj = Project(
            name="Doc Test Proj",
            description="Testing docs",
            department=ProjectDepartment.EDUTECH,
            start_date=date(2026, 1, 1),
            end_date=date(2026, 5, 1),
            status=ProjectStatus.NOT_STARTED,
        )
        self.db.add(proj)
        self.db.commit()

        # Create dummy file
        dummy_content = b"%PDF-1.4 test pdf content"
        upload_file = UploadFile(
            file=io.BytesIO(dummy_content),
            filename="architecture_diagram.pdf",
            headers={"content-type": "application/pdf"},
        )

        doc = upload_project_document(
            project_id=proj.id,
            file=upload_file,
            title="Architecture Diagram",
            description="High-level architecture",
            db=self.db,
            current_user=self.admin,
        )
        self.assertEqual(doc.title, "Architecture Diagram")
        self.assertEqual(doc.file_name, "architecture_diagram.pdf")

        # Update document metadata
        updated_doc = update_project_document(
            project_id=proj.id,
            document_id=doc.id,
            payload=ProjectDocumentUpdate(title="Architecture Spec v2"),
            db=self.db,
            current_user=self.admin,
        )
        self.assertEqual(updated_doc.title, "Architecture Spec v2")

        # Download document
        res_file = download_project_document(
            project_id=proj.id,
            document_id=doc.id,
            db=self.db,
            current_user=self.admin,
        )
        self.assertEqual(res_file.filename, "architecture_diagram.pdf")

        # Replace document
        new_content = b"%PDF-1.5 replaced pdf content"
        replace_file = UploadFile(
            file=io.BytesIO(new_content),
            filename="architecture_v3.pdf",
            headers={"content-type": "application/pdf"},
        )
        replaced_doc = replace_project_document(
            project_id=proj.id,
            document_id=doc.id,
            file=replace_file,
            db=self.db,
            current_user=self.admin,
        )
        self.assertEqual(replaced_doc.file_name, "architecture_v3.pdf")

        # Delete document
        del_res = delete_project_document(
            project_id=proj.id,
            document_id=doc.id,
            db=self.db,
            current_user=self.admin,
        )
        self.assertIn("successfully", del_res["detail"])

    def test_create_project_without_members(self):
        payload = ProjectCreate(
            name="Zero Members Project",
            description="Testing project creation with no team members",
            client_name="Beta Corp",
            department=ProjectDepartment.REZOV,
            start_date=date(2026, 2, 1),
            end_date=date(2026, 5, 1),
            status=ProjectStatus.NOT_STARTED,
            manager_id=self.manager.id,
            member_ids=[],
            links=[ProjectLinkCreate(title="Roadmap", url="https://beta.com/roadmap")],
        )
        res = create_project(payload=payload, db=self.db, current_user=self.admin)
        self.assertEqual(res["name"], "Zero Members Project")
        self.assertEqual(res["manager"].id, self.manager.id)
        # Verify 0 members in returned object
        self.assertEqual(len(res["members"]), 0)
        # Verify 0 ProjectMember records in DB
        pm_count = self.db.query(ProjectMember).filter(ProjectMember.project_id == res["id"]).count()
        self.assertEqual(pm_count, 0)
        # Verify manager authorization to edit
        from app.routers.projects import project_editor_access_or_404
        proj = project_editor_access_or_404(self.db, res["id"], self.manager)
        self.assertEqual(proj.id, res["id"])
        # Verify document upload on this project
        test_file = UploadFile(
            file=io.BytesIO(b"Sample PDF bytes"),
            filename="requirements.pdf",
            headers={"content-type": "application/pdf"},
        )
        doc = upload_project_document(
            project_id=res["id"],
            title="Requirements Doc",
            file=test_file,
            db=self.db,
            current_user=self.manager,
        )
        self.assertEqual(doc.title, "Requirements Doc")
        # Verify links preserved
        self.assertEqual(len(res["links"]), 1)
        self.assertEqual(res["links"][0].title, "Roadmap")

    def test_project_team_members_unique_count_and_assignment(self):
        proj = Project(
            id=50,
            name="Team Count Project",
            description="Testing unique team count",
            department=ProjectDepartment.INGAGE,
            start_date=date(2026, 1, 1),
            end_date=date(2026, 6, 30),
            status=ProjectStatus.NOT_STARTED,
            manager_id=self.manager.id,
        )
        self.db.add(proj)
        self.db.commit()

        # 1. Project starts with 0 members (no tasks created yet)
        initial_details = get_project(proj.id, db=self.db, user=self.admin)
        self.assertEqual(len(initial_details["members"]), 0)

        # 2. Create tasks with Employee, Intern, and Admin assigned
        # Task 1 assigned to Employee & Intern
        task1 = Task(
            id=501,
            project_id=proj.id,
            title="Design Wireframes",
            status="In Progress",
            priority="High",
            assigned_by_id=self.admin.id,
        )
        self.db.add(task1)
        self.db.flush()
        self.db.add_all([
            TaskAssignment(task_id=task1.id, user_id=self.emp.id),
            TaskAssignment(task_id=task1.id, user_id=self.intern.id),
        ])

        # Task 2 assigned to Admin & Manager (must be excluded from Project Team summary)
        task2 = Task(
            id=502,
            project_id=proj.id,
            title="Management Review",
            status="Assigned",
            priority="Medium",
            assigned_by_id=self.admin.id,
        )
        self.db.add(task2)
        self.db.flush()
        self.db.add_all([
            TaskAssignment(task_id=task2.id, user_id=self.admin.id),
            TaskAssignment(task_id=task2.id, user_id=self.manager.id),
        ])

        # Task 3 also assigned to Employee (deduplication check across multiple tasks)
        task3 = Task(
            id=503,
            project_id=proj.id,
            title="Implement UI",
            status="Assigned",
            priority="Medium",
            assigned_by_id=self.admin.id,
        )
        self.db.add(task3)
        self.db.flush()
        self.db.add(TaskAssignment(task_id=task3.id, user_id=self.emp.id))
        self.db.commit()

        # 3. get_project should dynamically derive exactly 2 members: Employee and Intern
        # Admin and Manager must be excluded even though assigned to Task 2!
        # Employee must appear once, not twice despite being on Task 1 and Task 3!
        details = get_project(proj.id, db=self.db, user=self.admin)
        self.assertEqual(len(details["members"]), 2)
        member_ids = {m.id for m in details["members"]}
        self.assertIn(self.emp.id, member_ids)
        self.assertIn(self.intern.id, member_ids)
        self.assertNotIn(self.admin.id, member_ids)
        self.assertNotIn(self.manager.id, member_ids)

        # 4. list_projects also populates the 2 dynamic unique members
        proj_list = list_projects(db=self.db, user=self.admin)
        target = next(p for p in proj_list["items"] if p["id"] == proj.id)
        self.assertEqual(len(target["members"]), 2)

        # 5. list_project_members endpoint returns paginated 2 members
        paginated = list_project_members(project_id=proj.id, db=self.db, user=self.admin)
        self.assertEqual(paginated["total"], 2)
        self.assertEqual(len(paginated["items"]), 2)

        # 6. Removal after last assignment: remove Intern from Task 1
        intern_assignment = (
            self.db.query(TaskAssignment)
            .filter(TaskAssignment.task_id == task1.id, TaskAssignment.user_id == self.intern.id)
            .first()
        )
        self.db.delete(intern_assignment)
        self.db.commit()

        # Intern now has no tasks in this project -> dynamically removed from Project Team
        updated_details = get_project(proj.id, db=self.db, user=self.admin)
        self.assertEqual(len(updated_details["members"]), 1)
        self.assertEqual(updated_details["members"][0].id, self.emp.id)

    def test_duplicate_admin_and_same_name_users_separate_members(self):
        # Create two separate admin users who have the exact same name
        admin_a = User(id=81, full_name="admin", email="admin_a@test.com", role="admin", status="active")
        admin_b = User(id=82, full_name="admin", email="admin_b@test.com", role="admin", status="active")
        # Create two separate users who have the exact same name "Santhosh Kumar"
        sk_intern = User(id=83, full_name="Santhosh Kumar", email="sk_intern@test.com", role="intern", status="active")
        sk_emp = User(id=84, full_name="Santhosh Kumar", email="sk_emp@test.com", role="employee", status="active")
        self.db.add_all([admin_a, admin_b, sk_intern, sk_emp])
        self.db.commit()

        prof_sk_intern = StaffProfile(user_id=sk_intern.id, staff_category=StaffCategory.INTERN, department="Product")
        prof_sk_emp = StaffProfile(user_id=sk_emp.id, staff_category=StaffCategory.EMPLOYEE, department="Engineering")
        self.db.add_all([prof_sk_intern, prof_sk_emp])
        self.db.commit()

        proj = Project(
            id=51,
            name="Same Name Users Project",
            description="Testing same name users kept separate",
            department=ProjectDepartment.REZOV,
            start_date=date(2026, 2, 1),
            end_date=date(2026, 7, 31),
            status=ProjectStatus.NOT_STARTED,
            manager_id=self.manager.id,
        )
        self.db.add(proj)
        self.db.commit()

        # Assign all 4 users to a task in proj
        task = Task(
            id=510,
            project_id=proj.id,
            title="Shared Project Task",
            status="Assigned",
            priority="Medium",
            assigned_by_id=admin_a.id,
        )
        self.db.add(task)
        self.db.flush()
        self.db.add_all([
            TaskAssignment(task_id=task.id, user_id=admin_a.id),
            TaskAssignment(task_id=task.id, user_id=admin_b.id),
            TaskAssignment(task_id=task.id, user_id=sk_intern.id),
            TaskAssignment(task_id=task.id, user_id=sk_emp.id),
        ])
        self.db.commit()

        # In get_project, admin_a and admin_b are excluded; sk_intern and sk_emp are included!
        # Even though sk_intern and sk_emp have the exact same name "Santhosh Kumar",
        # they must NOT be merged because deduplication is by stable database user ID (83 and 84).
        details = get_project(proj.id, db=self.db, user=self.admin)
        self.assertEqual(len(details["members"]), 2)
        member_ids = [m.id for m in details["members"]]
        self.assertEqual(sorted(member_ids), [83, 84])

        # Verify roles and company units are preserved separately
        emp_m = next(m for m in details["members"] if m.id == 84)
        intern_m = next(m for m in details["members"] if m.id == 83)
        self.assertEqual(emp_m.role, "employee")
        self.assertEqual(emp_m.company_unit, "Engineering")
        self.assertEqual(intern_m.role, "intern")
        self.assertEqual(intern_m.company_unit, "Product")

    def test_user_profile_assigned_projects_and_joining_date(self):
        # Create user with NO joining date (missing/empty)
        user_no_jd = User(id=91, full_name="No JD User", email="noj@test.com", role="employee", status="active")
        prof_no_jd = StaffProfile(user_id=91, staff_category=StaffCategory.EMPLOYEE, department="QA", joining_date=None)
        # Create user with only standalone tasks
        user_standalone = User(id=92, full_name="Standalone User", email="standalone@test.com", role="employee", status="active")
        prof_standalone = StaffProfile(user_id=92, staff_category=StaffCategory.EMPLOYEE, department="Design", joining_date=None)
        # Create user with project-linked tasks
        user_project = User(id=93, full_name="Project User", email="projuser@test.com", role="employee", status="active")
        prof_project = StaffProfile(user_id=93, staff_category=StaffCategory.EMPLOYEE, department="Engineering", joining_date=date(2026, 1, 15))
        self.db.add_all([user_no_jd, user_standalone, user_project, prof_no_jd, prof_standalone, prof_project])
        self.db.commit()

        # Project 61 and 62
        proj_a = Project(
            id=61,
            name="Project Alpha",
            description="Alpha project",
            department=ProjectDepartment.INGAGE,
            start_date=date(2026, 1, 1),
            end_date=date(2026, 6, 30),
            status=ProjectStatus.IN_PROGRESS,
            manager_id=self.manager.id,
        )
        proj_b = Project(
            id=62,
            name="Project Beta",
            description="Beta project",
            department=ProjectDepartment.REZOV,
            start_date=date(2026, 2, 1),
            end_date=date(2026, 7, 31),
            status=ProjectStatus.IN_PROGRESS,
            manager_id=self.manager.id,
        )
        self.db.add_all([proj_a, proj_b])
        self.db.commit()

        # user_project is assigned to Task on proj_a and Task on proj_b, plus a duplicate task on proj_a
        t1 = Task(id=601, project_id=proj_a.id, title="Alpha Task 1", status="In Progress", priority="High", assigned_by_id=self.admin.id)
        t2 = Task(id=602, project_id=proj_a.id, title="Alpha Task 2", status="Assigned", priority="Medium", assigned_by_id=self.admin.id)
        t3 = Task(id=603, project_id=proj_b.id, title="Beta Task 1", status="Assigned", priority="Low", assigned_by_id=self.admin.id)
        # user_standalone is assigned only to a standalone task (project_id=None)
        t_standalone = Task(id=604, project_id=None, title="Standalone Task", status="Assigned", priority="Medium", assigned_by_id=self.admin.id)

        self.db.add_all([t1, t2, t3, t_standalone])
        self.db.flush()

        self.db.add_all([
            TaskAssignment(task_id=t1.id, user_id=user_project.id),
            TaskAssignment(task_id=t2.id, user_id=user_project.id),
            TaskAssignment(task_id=t3.id, user_id=user_project.id),
            TaskAssignment(task_id=t_standalone.id, user_id=user_standalone.id),
        ])
        self.db.commit()

        # 1. user_no_jd has no tasks and no joining date
        profile_no_jd = get_user(user_id=user_no_jd.id, db=self.db, current_user=self.admin)
        self.assertIsNone(profile_no_jd["joining_date"])
        self.assertEqual(len(profile_no_jd["assigned_projects"]), 0)

        # 2. user_standalone has standalone-only tasks: assigned_projects must be empty
        profile_standalone = get_user(user_id=user_standalone.id, db=self.db, current_user=self.admin)
        self.assertEqual(len(profile_standalone["assigned_projects"]), 0)

        # 3. user_project has tasks in proj_a (2 tasks) and proj_b (1 task):
        # Distinct projects derived from actual task assignments = exactly 2 projects (deduplicated!)
        profile_project = get_user(user_id=user_project.id, db=self.db, current_user=self.admin)
        self.assertEqual(profile_project["joining_date"], date(2026, 1, 15))
        self.assertEqual(len(profile_project["assigned_projects"]), 2)
        proj_ids = {p.id for p in profile_project["assigned_projects"]}
        self.assertEqual(proj_ids, {61, 62})


if __name__ == "__main__":
    unittest.main()

