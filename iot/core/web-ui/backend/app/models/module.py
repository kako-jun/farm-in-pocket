from sqlalchemy import Column, Integer, String, Text, DateTime
from datetime import datetime
from .base import Base, TimestampMixin


class Module(Base, TimestampMixin):
    """モジュールテーブル"""
    __tablename__ = "modules"

    id = Column(Integer, primary_key=True, autoincrement=True)
    name = Column(String(100), unique=True, nullable=False, index=True)
    version = Column(String(20), nullable=False)
    description = Column(Text)
    status = Column(String(20), nullable=False, default="stopped")  # running, stopped, error
    container_id = Column(String(64))  # Dockerコンテナ ID
    image_name = Column(String(200))
    config = Column(Text)  # JSON形式の設定

    def __repr__(self):
        return f"<Module(name={self.name}, version={self.version}, status={self.status})>"
