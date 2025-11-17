from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from contextlib import asynccontextmanager

from app.api import system, modules, logs, settings
from app.core.config import settings as app_settings


@asynccontextmanager
async def lifespan(app: FastAPI):
    """アプリケーション起動時・終了時の処理"""
    # 起動時
    print("🌾 Farm in Pocket Web UI starting...")
    yield
    # 終了時
    print("🌾 Farm in Pocket Web UI shutting down...")


app = FastAPI(
    title="Farm in Pocket API",
    description="零細農家・個人農家のための完全無料IoT農業システム",
    version="0.1.0",
    lifespan=lifespan,
)

# CORS設定
app.add_middleware(
    CORSMiddleware,
    allow_origins=app_settings.CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ルーター登録
app.include_router(system.router, prefix="/api/system", tags=["system"])
app.include_router(modules.router, prefix="/api/modules", tags=["modules"])
app.include_router(logs.router, prefix="/api/logs", tags=["logs"])
app.include_router(settings.router, prefix="/api/settings", tags=["settings"])


@app.get("/")
async def root():
    """ルートエンドポイント"""
    return {
        "message": "Farm in Pocket API",
        "version": "0.1.0",
        "status": "running"
    }


@app.get("/health")
async def health_check():
    """ヘルスチェック"""
    return {"status": "healthy"}


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(
        "main:app",
        host="0.0.0.0",
        port=8000,
        reload=True,
        log_level="info"
    )
