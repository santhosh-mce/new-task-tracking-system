from enum import Enum

from sqlalchemy import (
    CheckConstraint,
    Column,
    Date,
    Enum as SqlEnum,
    ForeignKey,
    Integer,
    JSON,
    String,
    UniqueConstraint,
)
from sqlalchemy.orm import relationship

from app.database import Base


class StaffCategory(str, Enum):
    EMPLOYEE = "Employee"
    INTERN = "Intern"
    MANAGER = "Manager"
    VENDOR = "Vendor"


class StaffProfile(Base):
    __tablename__ = "user_profiles"
    __table_args__ = (
        CheckConstraint(
            "employee_id IS NULL OR staff_category = 'Employee'",
            name="ck_user_profiles_employee_category",
        ),
        CheckConstraint(
            "intern_id IS NULL OR staff_category = 'Intern'",
            name="ck_user_profiles_intern_category",
        ),
    )

    id = Column(Integer, primary_key=True)
    user_id = Column(
        Integer,
        ForeignKey("users.id", ondelete="RESTRICT"),
        nullable=False,
        unique=True,
        index=True,
    )
    staff_category = Column(
        SqlEnum(
            StaffCategory,
            name="staff_category",
            native_enum=False,
            values_callable=lambda enum_class: [item.value for item in enum_class],
            validate_strings=True,
            create_constraint=True,
        ),
        nullable=True,
    )
    staff_id = Column(String(80), nullable=True, unique=True)
    employee_id = Column(String(80), nullable=True, unique=True)
    intern_id = Column(String(80), nullable=True, unique=True)
    mobile = Column(String(40), nullable=True)
    profile_photo = Column(String(500), nullable=True)
    dob = Column(Date, nullable=True)
    gender = Column(String(30), nullable=True)
    address = Column(String(500), nullable=True)
    city = Column(String(100), nullable=True)
    highest_qualification = Column(String(150), nullable=True)
    institution = Column(String(200), nullable=True)
    degree = Column(String(200), nullable=True)
    graduation_year = Column(Integer, nullable=True)
    resume_url = Column(String(500), nullable=True)
    department = Column(String(120), nullable=True)
    designation = Column(String(120), nullable=True)
    joining_date = Column(Date, nullable=True)
    reporting_manager_id = Column(
        Integer,
        ForeignKey("users.id", ondelete="RESTRICT"),
        nullable=True,
        index=True,
    )
    work_location = Column(String(120), nullable=True)
    state = Column(String(100), nullable=True)
    country = Column(String(100), nullable=True)
    internship_end_date = Column(Date, nullable=True)
    internship_status = Column(String(40), nullable=True, default="Active")
    skills = Column(JSON, nullable=True)
    soft_skills = Column(JSON, nullable=True)
    languages = Column(JSON, nullable=True)
    certifications = Column(JSON, nullable=True)
    work_experience = Column(JSON, nullable=True)
    projects = Column(JSON, nullable=True)
    education_records = Column(JSON, nullable=True)
    professional_links = Column(JSON, nullable=True)

    user = relationship("User", foreign_keys=[user_id])
    reporting_manager = relationship("User", foreign_keys=[reporting_manager_id])
    education = relationship(
        "UserEducation",
        back_populates="profile",
        order_by="UserEducation.id",
    )


class UserEducation(Base):
    __tablename__ = "user_education"
    __table_args__ = (
        UniqueConstraint(
            "profile_id",
            "institution",
            "qualification",
            name="uq_user_education_profile_institution_qualification",
        ),
    )

    id = Column(Integer, primary_key=True)
    profile_id = Column(
        Integer,
        ForeignKey("user_profiles.id", ondelete="RESTRICT"),
        nullable=False,
        index=True,
    )
    institution = Column(String(200), nullable=True)
    qualification = Column(String(200), nullable=True)
    field_of_study = Column(String(200), nullable=True)
    start_date = Column(Date, nullable=True)
    end_date = Column(Date, nullable=True)

    profile = relationship("StaffProfile", back_populates="education")
