from pydantic_settings import BaseSettings
from typing import List


class Settings(BaseSettings):
    """アプリケーション設定"""

    # アプリケーション設定
    APP_NAME: str = "Farm in Pocket"
    APP_VERSION: str = "0.1.0"
    DEBUG: bool = True

    # CORS設定
    CORS_ORIGINS: List[str] = [
        "http://localhost:3000",
        "http://localhost:5173",
        "http://farminpocket.local",
    ]

    # データベース設定
    DATABASE_URL: str = "sqlite+aiosqlite:///./farminpocket.db"

    # Docker設定
    DOCKER_SOCKET: str = "unix:///var/run/docker.sock"

    # ログ設定
    LOG_LEVEL: str = "INFO"
    LOG_FILE: str = "./logs/app.log"

    class Config:
        env_file = ".env"
        case_sensitive = True


settings = Settings()
