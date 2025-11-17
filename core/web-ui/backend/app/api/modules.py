from fastapi import APIRouter, HTTPException, Depends
from pydantic import BaseModel
from typing import List, Optional, Dict, Any
from datetime import datetime
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from app.core.database import get_db
from app.services.docker_manager import docker_manager
from app.models.module import Module as ModuleModel

router = APIRouter()


class ModuleStatus(BaseModel):
    """モジュールステータス"""
    name: str
    version: str
    status: str  # running, stopped, error
    description: str
    metrics: Optional[Dict[str, Any]] = None
    last_update: datetime


class ModuleList(BaseModel):
    """モジュール一覧"""
    modules: List[ModuleStatus]


@router.get("", response_model=ModuleList)
async def get_modules(db: AsyncSession = Depends(get_db)):
    """
    導入済みモジュール一覧を取得

    Returns:
        ModuleList: モジュールのリスト
    """
    # Dockerコンテナ情報を取得
    containers = docker_manager.list_containers()

    modules = []
    for container in containers:
        # ステータスをマッピング
        status = "running" if container["status"] == "running" else "stopped"

        # ダミーメトリクス（後で実際のデータに置き換え）
        metrics = {}
        if "temp" in container["name"]:
            metrics = {"temperature": 24.5, "humidity": 65.0}
        elif "irrigation" in container["name"]:
            metrics = {"next_watering": "2025-11-17T14:30:00Z"}

        modules.append(ModuleStatus(
            name=container["name"],
            version=container.get("labels", {}).get("version", "1.0.0"),
            status=status,
            description=container.get("labels", {}).get("description", ""),
            metrics=metrics if metrics else None,
            last_update=datetime.now()
        ))

    return ModuleList(modules=modules)


@router.get("/{module_name}", response_model=ModuleStatus)
async def get_module_detail(module_name: str, db: AsyncSession = Depends(get_db)):
    """
    モジュール詳細を取得

    Args:
        module_name: モジュール名

    Returns:
        ModuleStatus: モジュールの詳細情報
    """
    # Dockerコンテナ情報を取得
    container = docker_manager.get_container(module_name)

    if not container:
        raise HTTPException(status_code=404, detail="Module not found")

    # ステータスをマッピング
    status = "running" if container["status"] == "running" else "stopped"

    # ダミーメトリクス
    metrics = {}
    if "temp" in module_name:
        metrics = {"temperature": 24.5, "humidity": 65.0}
    elif "irrigation" in module_name:
        metrics = {"next_watering": "2025-11-17T14:30:00Z"}

    return ModuleStatus(
        name=container["name"],
        version=container.get("labels", {}).get("version", "1.0.0"),
        status=status,
        description=container.get("labels", {}).get("description", ""),
        metrics=metrics if metrics else None,
        last_update=datetime.now()
    )


@router.post("/{module_name}/start")
async def start_module(module_name: str, db: AsyncSession = Depends(get_db)):
    """
    モジュールを起動

    Args:
        module_name: モジュール名

    Returns:
        Dict: 操作結果
    """
    success = docker_manager.start_container(module_name)

    if not success:
        raise HTTPException(status_code=500, detail=f"Failed to start module {module_name}")

    return {"message": f"Module {module_name} started successfully"}


@router.post("/{module_name}/stop")
async def stop_module(module_name: str, db: AsyncSession = Depends(get_db)):
    """
    モジュールを停止

    Args:
        module_name: モジュール名

    Returns:
        Dict: 操作結果
    """
    success = docker_manager.stop_container(module_name)

    if not success:
        raise HTTPException(status_code=500, detail=f"Failed to stop module {module_name}")

    return {"message": f"Module {module_name} stopped successfully"}


@router.post("/{module_name}/restart")
async def restart_module(module_name: str, db: AsyncSession = Depends(get_db)):
    """
    モジュールを再起動

    Args:
        module_name: モジュール名

    Returns:
        Dict: 操作結果
    """
    success = docker_manager.restart_container(module_name)

    if not success:
        raise HTTPException(status_code=500, detail=f"Failed to restart module {module_name}")

    return {"message": f"Module {module_name} restarted successfully"}
