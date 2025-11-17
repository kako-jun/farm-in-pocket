from sqlalchemy import Column, String, Text, DateTime
from datetime import datetime
from .base import Base


class Setting(Base):
    """設定テーブル"""
    __tablename__ = "settings"

    key = Column(String(100), primary_key=True)
    value = Column(Text, nullable=False)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False)

    def __repr__(self):
        return f"<Setting(key={self.key})>"
