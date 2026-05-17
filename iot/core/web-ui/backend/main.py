from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse
from contextlib import asynccontextmanager
import os
from pathlib import Path

from app.api import system, modules, logs, settings
from app.core.config import settings as app_settings
from app.core.database import init_db


@asynccontextmanager
async def lifespan(app: FastAPI):
    """アプリケーション起動時・終了時の処理"""
    # 起動時
    print("🌾 Farm in Pocket Web UI starting...")
    print("📊 Initializing database...")
    await init_db()
    print("✅ Database initialized")
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

# ルーター登録（/api prefix）
app.include_router(system.router, prefix="/api/system", tags=["system"])
app.include_router(modules.router, prefix="/api/modules", tags=["modules"])
app.include_router(logs.router, prefix="/api/logs", tags=["logs"])
app.include_router(settings.router, prefix="/api/settings", tags=["settings"])


@app.get("/api")
async def api_root():
    """APIルートエンドポイント"""
    return {
        "message": "Farm in Pocket API",
        "version": "0.1.0",
        "status": "running"
    }


@app.get("/api/health")
async def health_check():
    """ヘルスチェック"""
    return {"status": "healthy"}


# React静的ファイル配信（本番環境のみ）
FRONTEND_DIST = Path(__file__).parent.parent / "frontend" / "dist"

if FRONTEND_DIST.exists():
    # assetsディレクトリ（JS, CSS, 画像など）
    app.mount("/assets", StaticFiles(directory=str(FRONTEND_DIST / "assets")), name="assets")

    print(f"📦 Serving React static files from: {FRONTEND_DIST}")

    @app.get("/{full_path:path}")
    async def serve_react_app(full_path: str):
        """
        React SPAの配信
        - /api/* 以外のすべてのリクエストをReactアプリで処理
        - 存在しないルートもindex.htmlを返す（React Routerが処理）
        """
        # APIパスは除外（すでにルーター登録済み）
        if full_path.startswith("api"):
            return {"error": "Not Found"}, 404

        # ファイルが存在すればそれを返す
        file_path = FRONTEND_DIST / full_path
        if file_path.exists() and file_path.is_file():
            return FileResponse(file_path)

        # それ以外はすべてindex.htmlを返す（SPA対応）
        return FileResponse(FRONTEND_DIST / "index.html")
else:
    print("⚠️  React build not found. Run 'npm run build' in frontend/ directory.")
    print("⚠️  API is available at http://localhost:8000/api")

    @app.get("/")
    async def root():
        """開発環境用ルート"""
        return {
            "message": "Farm in Pocket API (Development Mode)",
            "version": "0.1.0",
            "status": "running",
            "note": "React frontend is running separately on http://localhost:5173"
        }


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(
        "main:app",
        host="0.0.0.0",
        port=8000,
        reload=True,
        log_level="info"
    )
