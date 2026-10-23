
from sqlalchemy import Boolean, Column, DateTime, Integer, String

from app.database import Base


class User(Base):
    __tablename__ = "users"

    id = Column(Integer, primary_key=True, index=True)
    full_name = Column(String(150), nullable=True, default="")
    email = Column(
        String(255),
        unique=True,
        index=True,
        nullable=False,
    )
    password_hash = Column(String(255), nullable=True)
    role = Column(String(20), nullable=False)
    status = Column(
        String(30),
        nullable=False,
        default="invitation_pending",
    )
    profile_status = Column(
        String(30),
        nullable=False,
        default="incomplete",
    )
    must_change_password = Column(
        Boolean,
        nullable=False,
        default=False,
    )
    onboarding_status = Column(
        String(30),
        nullable=False,
        default="completed",
    )
    last_login_at = Column(DateTime(timezone=True), nullable=True)
    last_seen_at = Column(DateTime(timezone=True), nullable=True)
    current_status = Column(
        String(30),
        nullable=False,
        default="Offline",
    )

