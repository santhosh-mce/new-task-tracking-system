from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

import app.models  # noqa: F401
from app.database import test_database_connection
from app.routers.auth import router as auth_router
from app.routers.admin_invitations import router as admin_invitations_router
from app.routers.users import router as users_router
from app.routers.projects import router as projects_router
from app.routers.dashboard import router as dashboard_router
from app.routers.tasks import router as tasks_router
from app.routers.attendance import router as attendance_router
from app.routers.profile import router as profile_router
from app.routers.employees import router as employees_router
from app.routers.interns import router as interns_router
from app.routers.notifications import router as notifications_router

app = FastAPI(
    title="Task Tracking System API",
    version="1.0.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth_router)
app.include_router(admin_invitations_router)
app.include_router(users_router)
app.include_router(projects_router)
app.include_router(dashboard_router)
app.include_router(tasks_router)
app.include_router(attendance_router)
app.include_router(profile_router)
app.include_router(employees_router)
app.include_router(interns_router)
app.include_router(notifications_router)


@app.get("/")
def home():
    return {"message": "Task Tracking System Backend is running!"}


@app.get("/health")
def health_check():
    return {"status": "healthy"}


@app.get("/health/database")
def database_health():
    try:
        test_database_connection()
        return {"database": "connected"}
    except Exception:
        return {"database": "connection_failed"}