from fastapi import APIRouter, Query
from pydantic import BaseModel
from typing import List, Optional
from datetime import datetime

router = APIRouter()


class LogEntry(BaseModel):
    """ログエントリ"""
    id: int
    module_name: Optional[str]
    level: str
    message: str
    timestamp: datetime


class LogList(BaseModel):
    """ログ一覧"""
    logs: List[LogEntry]
    total: int


@router.get("", response_model=LogList)
async def get_logs(
    module: Optional[str] = Query(None, description="モジュール名でフィルタ"),
    level: Optional[str] = Query(None, description="ログレベルでフィルタ"),
    limit: int = Query(100, description="取得件数", ge=1, le=1000),
    offset: int = Query(0, description="オフセット", ge=0)
):
    """
    ログ一覧を取得

    Args:
        module: モジュール名（オプション）
        level: ログレベル（オプション）
        limit: 取得件数
        offset: オフセット

    Returns:
        LogList: ログのリスト
    """
    # TODO: データベースから実際のログを取得
    # 現在はダミーデータを返す
    dummy_logs = [
        LogEntry(
            id=1,
            module_name="farminpocket-temp",
            level="INFO",
            message="Temperature: 24.5°C, Humidity: 65%",
            timestamp=datetime.now()
        ),
        LogEntry(
            id=2,
            module_name="farminpocket-irrigation",
            level="INFO",
            message="Irrigation started",
            timestamp=datetime.now()
        ),
        LogEntry(
            id=3,
            module_name="farminpocket-scare",
            level="WARNING",
            message="Sensor anomaly detected",
            timestamp=datetime.now()
        )
    ]

    return LogList(
        logs=dummy_logs[:limit],
        total=len(dummy_logs)
    )
