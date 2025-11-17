import docker
from docker.errors import DockerException, NotFound
from typing import List, Dict, Optional
import json


class DockerManager:
    """Docker管理サービス"""

    def __init__(self):
        try:
            self.client = docker.from_env()
        except DockerException as e:
            print(f"Failed to connect to Docker: {e}")
            self.client = None

    def is_available(self) -> bool:
        """Dockerが利用可能かチェック"""
        return self.client is not None

    def list_containers(self, filter_prefix: str = "farminpocket-") -> List[Dict]:
        """
        コンテナ一覧を取得

        Args:
            filter_prefix: コンテナ名のフィルタ（前方一致）

        Returns:
            コンテナ情報のリスト
        """
        if not self.is_available():
            return []

        try:
            containers = self.client.containers.list(all=True)
            result = []

            for container in containers:
                name = container.name
                if name.startswith(filter_prefix):
                    result.append({
                        "id": container.id,
                        "name": name,
                        "status": container.status,
                        "image": container.image.tags[0] if container.image.tags else "unknown",
                        "created": container.attrs.get("Created"),
                        "labels": container.labels
                    })

            return result
        except DockerException as e:
            print(f"Failed to list containers: {e}")
            return []

    def get_container(self, container_name: str) -> Optional[Dict]:
        """
        特定のコンテナ情報を取得

        Args:
            container_name: コンテナ名

        Returns:
            コンテナ情報（存在しない場合はNone）
        """
        if not self.is_available():
            return None

        try:
            container = self.client.containers.get(container_name)
            return {
                "id": container.id,
                "name": container.name,
                "status": container.status,
                "image": container.image.tags[0] if container.image.tags else "unknown",
                "created": container.attrs.get("Created"),
                "labels": container.labels,
                "ports": container.ports,
                "environment": container.attrs.get("Config", {}).get("Env", [])
            }
        except NotFound:
            return None
        except DockerException as e:
            print(f"Failed to get container: {e}")
            return None

    def start_container(self, container_name: str) -> bool:
        """
        コンテナを起動

        Args:
            container_name: コンテナ名

        Returns:
            成功した場合True
        """
        if not self.is_available():
            return False

        try:
            container = self.client.containers.get(container_name)
            container.start()
            return True
        except NotFound:
            print(f"Container not found: {container_name}")
            return False
        except DockerException as e:
            print(f"Failed to start container: {e}")
            return False

    def stop_container(self, container_name: str, timeout: int = 10) -> bool:
        """
        コンテナを停止

        Args:
            container_name: コンテナ名
            timeout: タイムアウト（秒）

        Returns:
            成功した場合True
        """
        if not self.is_available():
            return False

        try:
            container = self.client.containers.get(container_name)
            container.stop(timeout=timeout)
            return True
        except NotFound:
            print(f"Container not found: {container_name}")
            return False
        except DockerException as e:
            print(f"Failed to stop container: {e}")
            return False

    def restart_container(self, container_name: str, timeout: int = 10) -> bool:
        """
        コンテナを再起動

        Args:
            container_name: コンテナ名
            timeout: タイムアウト（秒）

        Returns:
            成功した場合True
        """
        if not self.is_available():
            return False

        try:
            container = self.client.containers.get(container_name)
            container.restart(timeout=timeout)
            return True
        except NotFound:
            print(f"Container not found: {container_name}")
            return False
        except DockerException as e:
            print(f"Failed to restart container: {e}")
            return False

    def get_container_logs(self, container_name: str, tail: int = 100) -> List[str]:
        """
        コンテナのログを取得

        Args:
            container_name: コンテナ名
            tail: 取得する行数

        Returns:
            ログの配列
        """
        if not self.is_available():
            return []

        try:
            container = self.client.containers.get(container_name)
            logs = container.logs(tail=tail, timestamps=True).decode('utf-8')
            return logs.split('\n')
        except NotFound:
            print(f"Container not found: {container_name}")
            return []
        except DockerException as e:
            print(f"Failed to get logs: {e}")
            return []

    def get_container_stats(self, container_name: str) -> Optional[Dict]:
        """
        コンテナの統計情報を取得

        Args:
            container_name: コンテナ名

        Returns:
            統計情報
        """
        if not self.is_available():
            return None

        try:
            container = self.client.containers.get(container_name)
            stats = container.stats(stream=False)
            return stats
        except NotFound:
            print(f"Container not found: {container_name}")
            return None
        except DockerException as e:
            print(f"Failed to get stats: {e}")
            return None


# シングルトンインスタンス
docker_manager = DockerManager()
