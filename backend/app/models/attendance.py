from datetime import date, datetime, time
from decimal import Decimal
from sqlalchemy import (
    Boolean,
    Column,
    Date,
    DateTime,
    ForeignKey,
    Integer,
    Numeric,
    String,
    Text,
    Time,
    UniqueConstraint,
)
from sqlalchemy.orm import relationship

from app.database import Base


class AttendancePolicy(Base):
    __tablename__ = "attendance_policies"

    id = Column(Integer, primary_key=True)
    company_name = Column(String(100), nullable=False, default="Ingage")
    shift_start_time = Column(Time, nullable=False, default=time(9, 30))
    grace_period_minutes = Column(Integer, nullable=False, default=15)
    expected_daily_hours = Column(Numeric(4, 2), nullable=False, default=Decimal("8.00"))
    cutoff_time = Column(Time, nullable=False, default=time(14, 0))
    timezone = Column(String(50), nullable=False, default="Asia/Kolkata")
    deduct_lunch_break = Column(Boolean, nullable=False, default=True)
    deduct_tea_break = Column(Boolean, nullable=False, default=False)
    deduct_personal_break = Column(Boolean, nullable=False, default=True)
    deduct_short_break = Column(Boolean, nullable=False, default=False)
    max_break_minutes = Column(Integer, nullable=False, default=60)
    updated_at = Column(DateTime(timezone=True), nullable=False, default=datetime.utcnow)


class DailyAttendance(Base):
    __tablename__ = "daily_attendances"
    __table_args__ = (
        UniqueConstraint("user_id", "date", name="uq_daily_attendance_user_date"),
    )

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(
        Integer,
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    date = Column(Date, nullable=False, index=True)
    status = Column(String(30), nullable=False, default="Not Checked In", index=True)
    first_check_in = Column(DateTime(timezone=True), nullable=True)
    last_check_out = Column(DateTime(timezone=True), nullable=True)
    total_work_minutes = Column(Integer, nullable=False, default=0)
    total_break_minutes = Column(Integer, nullable=False, default=0)
    net_work_minutes = Column(Integer, nullable=False, default=0)
    is_finalized = Column(Boolean, nullable=False, default=False)
    created_at = Column(DateTime(timezone=True), nullable=False, default=datetime.utcnow)
    updated_at = Column(DateTime(timezone=True), nullable=False, default=datetime.utcnow)

    user = relationship("User", foreign_keys=[user_id])
    sessions = relationship("AttendanceSession", back_populates="attendance", cascade="all, delete-orphan", order_by="AttendanceSession.check_in")
    breaks = relationship("AttendanceBreak", back_populates="attendance", cascade="all, delete-orphan", order_by="AttendanceBreak.start_time")
    corrections = relationship("AttendanceCorrection", back_populates="attendance")


class AttendanceSession(Base):
    __tablename__ = "attendance_sessions"

    id = Column(Integer, primary_key=True, index=True)
    attendance_id = Column(
        Integer,
        ForeignKey("daily_attendances.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    user_id = Column(
        Integer,
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    check_in = Column(DateTime(timezone=True), nullable=False, default=datetime.utcnow, index=True)
    check_out = Column(DateTime(timezone=True), nullable=True, index=True)
    duration_minutes = Column(Integer, nullable=True)
    last_heartbeat = Column(DateTime(timezone=True), nullable=True)
    session_status = Column(String(30), nullable=False, default="Online")
    working_seconds = Column(Integer, nullable=False, default=0)
    break_seconds = Column(Integer, nullable=False, default=0)
    source = Column(String(30), nullable=False, default="manual")
    ip_address = Column(String(45), nullable=True)
    user_agent = Column(Text, nullable=True)
    created_at = Column(DateTime(timezone=True), nullable=False, default=datetime.utcnow)

    attendance = relationship("DailyAttendance", back_populates="sessions")
    user = relationship("User", foreign_keys=[user_id])


class AttendanceBreak(Base):
    __tablename__ = "attendance_breaks"

    id = Column(Integer, primary_key=True, index=True)
    attendance_id = Column(
        Integer,
        ForeignKey("daily_attendances.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    session_id = Column(
        Integer,
        ForeignKey("attendance_sessions.id", ondelete="SET NULL"),
        nullable=True,
    )
    user_id = Column(
        Integer,
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    break_type = Column(String(30), nullable=False, default="Lunch")
    start_time = Column(DateTime(timezone=True), nullable=False, default=datetime.utcnow, index=True)
    end_time = Column(DateTime(timezone=True), nullable=True, index=True)
    duration_minutes = Column(Integer, nullable=True)
    is_deducted = Column(Boolean, nullable=False, default=True)
    reason = Column(Text, nullable=True)
    created_at = Column(DateTime(timezone=True), nullable=False, default=datetime.utcnow)

    attendance = relationship("DailyAttendance", back_populates="breaks")
    session = relationship("AttendanceSession")
    user = relationship("User", foreign_keys=[user_id])


class AttendanceCorrection(Base):
    __tablename__ = "attendance_corrections"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(
        Integer,
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    attendance_id = Column(
        Integer,
        ForeignKey("daily_attendances.id", ondelete="SET NULL"),
        nullable=True,
    )
    request_date = Column(Date, nullable=False, index=True)
    requested_check_in = Column(DateTime(timezone=True), nullable=False)
    requested_check_out = Column(DateTime(timezone=True), nullable=False)
    requested_break_minutes = Column(Integer, nullable=True, default=0)
    reason = Column(Text, nullable=False)
    status = Column(String(20), nullable=False, default="Pending", index=True)
    reviewed_by_id = Column(
        Integer,
        ForeignKey("users.id", ondelete="SET NULL"),
        nullable=True,
    )
    reviewer_remarks = Column(Text, nullable=True)
    reviewed_at = Column(DateTime(timezone=True), nullable=True)
    created_at = Column(DateTime(timezone=True), nullable=False, default=datetime.utcnow)
    updated_at = Column(DateTime(timezone=True), nullable=False, default=datetime.utcnow)

    user = relationship("User", foreign_keys=[user_id])
    reviewed_by = relationship("User", foreign_keys=[reviewed_by_id])
    attendance = relationship("DailyAttendance", back_populates="corrections")


class UserLeave(Base):
    __tablename__ = "user_leaves"
    __table_args__ = (
        UniqueConstraint("user_id", "leave_date", name="uq_user_leaves_user_date"),
    )

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(
        Integer,
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    leave_date = Column(Date, nullable=False, index=True)
    leave_type = Column(String(50), nullable=False, default="Casual Leave")
    status = Column(String(20), nullable=False, default="Approved")
    created_at = Column(DateTime(timezone=True), nullable=False, default=datetime.utcnow)

    user = relationship("User", foreign_keys=[user_id])
