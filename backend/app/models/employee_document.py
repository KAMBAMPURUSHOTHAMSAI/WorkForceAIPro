from sqlalchemy import (
    Boolean,
    Column,
    DateTime,
    ForeignKey,
    Integer,
    String,
    func,
)

from app.db.session import Base


class EmployeeDocument(Base):
    __tablename__ = "employee_documents"

    id = Column(Integer, primary_key=True, index=True)

    employee_id = Column(
        Integer,
        ForeignKey("employees.id", ondelete="RESTRICT"),
        nullable=False,
        index=True,
    )

    uploaded_by = Column(
        Integer,
        ForeignKey("users.id", ondelete="SET NULL"),
        nullable=True,
    )

    original_filename = Column(String(255), nullable=False)
    stored_filename = Column(
        String(100),
        unique=True,
        nullable=False,
    )

    document_type = Column(String(50), nullable=False, default="GENERAL")
    content_type = Column(String(100), nullable=False)
    file_size = Column(Integer, nullable=False)

    is_deleted = Column(Boolean, nullable=False, default=False)

    uploaded_at = Column(
        DateTime(timezone=True),
        nullable=False,
        server_default=func.now(),
    )