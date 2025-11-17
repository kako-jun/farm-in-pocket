from sqlalchemy import Column, Integer, String, Text, DateTime, Index
from datetime import datetime
from .base import Base


class Log(Base):
    """ログテーブル"""
    __tablename__ = "logs"

    id = Column(Integer, primary_key=True, autoincrement=True)
    module_name = Column(String(100), index=True)
    level = Column(String(20), nullable=False, index=True)  # DEBUG, INFO, WARNING, ERROR
    message = Column(Text, nullable=False)
    timestamp = Column(DateTime, default=datetime.utcnow, nullable=False, index=True)

    __table_args__ = (
        Index('idx_log_timestamp', 'timestamp'),
    )

    def __repr__(self):
        return f"<Log(level={self.level}, module={self.module_name}, timestamp={self.timestamp})>"
