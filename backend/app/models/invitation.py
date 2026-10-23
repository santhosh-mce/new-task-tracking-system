from sqlalchemy import (
    CheckConstraint,
    Column,
    DateTime,
    ForeignKey,
    Integer,
    String,
)
from sqlalchemy.orm import relationship

from app.database import Base


class UserInvitation(Base):
    __tablename__ = "user_invitations"
    __table_args__ = (
        CheckConstraint(
            "role IN ('admin', 'manager', 'employee', 'intern', 'team_lead')",
            name="ck_user_invitations_role",
        ),

        CheckConstraint(
            "window_attempt_count >= 0 AND window_attempt_count <= 5",
            name="ck_user_invitations_window_attempt_count",
        ),
    )

    id = Column(Integer, primary_key=True)
    email = Column(String(255), nullable=False, index=True)
    role = Column(String(20), nullable=False)
    token_hash = Column(String(64), nullable=True, unique=True, index=True)
    sent_at = Column(DateTime(timezone=True), nullable=True)
    expires_at = Column(DateTime(timezone=True), nullable=True)
    status = Column(String(30), nullable=False, default="pending")
    completed_at = Column(DateTime(timezone=True), nullable=True)
    revoked_at = Column(DateTime(timezone=True), nullable=True)
    last_attempt_at = Column(DateTime(timezone=True), nullable=True)
    attempt_window_started_at = Column(DateTime(timezone=True), nullable=True)
    window_attempt_count = Column(Integer, nullable=False, default=0)

    user_id = Column(
        Integer,
        ForeignKey("users.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )
    invited_by_id = Column(
        Integer,
        ForeignKey("users.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )

    user = relationship("User", foreign_keys=[user_id])
    invited_by = relationship("User", foreign_keys=[invited_by_id])
