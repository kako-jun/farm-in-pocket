from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
import psutil
import platform
from datetime import datetime, timedelta

router = APIRouter()


class SystemStatus(BaseModel):
    """システムステータスのレスポンスモデル"""
    cpu_usage: float
    memory_total: int
    memory_used: int
    memory_percent: float
    disk_total: int
    disk_used: int
    disk_percent: float
    uptime_seconds: int
    platform: str
    python_version: str
    timestamp: datetime


class SystemInfo(BaseModel):
    """システム情報のレスポンスモデル"""
    hostname: str
    platform: str
    platform_version: str
    architecture: str
    processor: str
    cpu_count: int


@router.get("/status", response_model=SystemStatus)
async def get_system_status():
    """
    システムステータスを取得

    Returns:
        SystemStatus: CPU、メモリ、ディスク、稼働時間などの情報
    """
    try:
        # CPU使用率
        cpu_percent = psutil.cpu_percent(interval=1)

        # メモリ情報
        memory = psutil.virtual_memory()

        # ディスク情報
        disk = psutil.disk_usage('/')

        # 稼働時間
        boot_time = psutil.boot_time()
        uptime = int(datetime.now().timestamp() - boot_time)

        return SystemStatus(
            cpu_usage=cpu_percent,
            memory_total=memory.total,
            memory_used=memory.used,
            memory_percent=memory.percent,
            disk_total=disk.total,
            disk_used=disk.used,
            disk_percent=disk.percent,
            uptime_seconds=uptime,
            platform=platform.system(),
            python_version=platform.python_version(),
            timestamp=datetime.now()
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to get system status: {str(e)}")


@router.get("/info", response_model=SystemInfo)
async def get_system_info():
    """
    システム情報を取得

    Returns:
        SystemInfo: ホスト名、プラットフォーム、アーキテクチャなどの情報
    """
    try:
        return SystemInfo(
            hostname=platform.node(),
            platform=platform.system(),
            platform_version=platform.version(),
            architecture=platform.machine(),
            processor=platform.processor() or "Unknown",
            cpu_count=psutil.cpu_count()
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to get system info: {str(e)}")
