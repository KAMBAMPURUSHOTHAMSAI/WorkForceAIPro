from sqlalchemy import (
    Column,
    DateTime,
    ForeignKey,
    Integer,
    JSON,
    String,
    Text,
    func,
)

from app.db.session import Base


class DatasetVersion(Base):
    __tablename__ = "dataset_versions"

    id = Column(Integer, primary_key=True, index=True)
    version_number = Column(Integer, unique=True, nullable=False)

    original_filename = Column(String(255), nullable=False)
    stored_filename = Column(String(100), unique=True, nullable=False)

    target_column = Column(String(100), nullable=False, default="Attrition")

    total_rows = Column(Integer, nullable=False, default=0)
    valid_rows = Column(Integer, nullable=False, default=0)
    failed_rows = Column(Integer, nullable=False, default=0)

    feature_columns = Column(JSON, nullable=True)
    validation_summary = Column(JSON, nullable=True)
    model_metrics = Column(JSON, nullable=True)

    status = Column(
        String(20),
        nullable=False,
        default="UPLOADED",
        index=True,
    )

    error_message = Column(Text, nullable=True)

    uploaded_by = Column(
        Integer,
        ForeignKey("users.id", ondelete="SET NULL"),
        nullable=True,
    )

    created_at = Column(
        DateTime(timezone=True),
        nullable=False,
        server_default=func.now(),
    )