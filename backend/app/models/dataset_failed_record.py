from sqlalchemy import (
    Column,
    DateTime,
    ForeignKey,
    Index,
    Integer,
    JSON,
    Text,
    func,
)

from app.db.session import Base


class DatasetFailedRecord(Base):
    __tablename__ = "dataset_failed_records"

    __table_args__ = (
        Index(
            "ix_failed_dataset_row",
            "dataset_version_id",
            "row_number",
        ),
    )

    id = Column(Integer, primary_key=True, index=True)

    dataset_version_id = Column(
        Integer,
        ForeignKey("dataset_versions.id", ondelete="CASCADE"),
        nullable=False,
    )

    row_number = Column(Integer, nullable=False)
    error_message = Column(Text, nullable=False)
    row_data = Column(JSON, nullable=True)

    created_at = Column(
        DateTime(timezone=True),
        nullable=False,
        server_default=func.now(),
    )