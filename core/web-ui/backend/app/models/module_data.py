from sqlalchemy import Column, Integer, String, Text, DateTime, Index
from datetime import datetime
from .base import Base


class ModuleData(Base):
    """モジュールデータテーブル"""
    __tablename__ = "module_data"

    id = Column(Integer, primary_key=True, autoincrement=True)
    module_name = Column(String(100), nullable=False, index=True)
    timestamp = Column(DateTime, default=datetime.utcnow, nullable=False, index=True)
    data = Column(Text, nullable=False)  # JSON形式のセンサーデータ

    __table_args__ = (
        Index('idx_module_timestamp', 'module_name', 'timestamp'),
    )

    def __repr__(self):
        return f"<ModuleData(module_name={self.module_name}, timestamp={self.timestamp})>"
