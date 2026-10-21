from sqlalchemy import (
    Column,
    Date,
    DateTime,
    ForeignKey,
    Integer,
    Numeric,
    String,
    func,
)
from sqlalchemy.orm import relationship

from app.db.session import Base


class Employee(Base):
    __tablename__ = "employees"

    id = Column(Integer, primary_key=True, index=True)

    employee_code = Column(
        String(30),
        unique=True,
        nullable=False,
        index=True,
    )

    first_name = Column(String(100), nullable=False)
    last_name = Column(String(100), nullable=False)

    email = Column(String(255), unique=True, nullable=False, index=True)
    phone = Column(String(25), nullable=True)
    job_title = Column(String(120), nullable=True)

    employment_type = Column(
        String(30),
        nullable=False,
        default="FULL_TIME",
    )
    employment_status = Column(
        String(30),
        nullable=False,
        default="ACTIVE",
        index=True,
    )

    date_of_joining = Column(Date, nullable=True)
    base_salary = Column(Numeric(12, 2), nullable=False, default=0)

    department_id = Column(
        Integer,
        ForeignKey("departments.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )

    manager_id = Column(
        Integer,
        ForeignKey("employees.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )

    user_id = Column(
        Integer,
        ForeignKey("users.id", ondelete="SET NULL"),
        unique=True,
        nullable=True,
    )

    created_at = Column(
        DateTime(timezone=True),
        nullable=False,
        server_default=func.now(),
    )
    updated_at = Column(
        DateTime(timezone=True),
        nullable=False,
        server_default=func.now(),
        onupdate=func.now(),
    )

    department = relationship(
        "Department",
        back_populates="employees",
    )

    user = relationship(
        "User",
        back_populates="employee",
    )

    manager = relationship(
        "Employee",
        remote_side=[id],
        backref="direct_reports",
        foreign_keys=[manager_id],
    )