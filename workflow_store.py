from __future__ import annotations

from contextlib import contextmanager
import json
import os
from pathlib import Path
import tempfile
from typing import Any, Iterator, Optional

from dotenv import load_dotenv
from google.cloud import storage

load_dotenv()

WORKFLOW_BUCKET_ENV = "WORKFLOW_BUCKET"
WORKFLOW_PREFIX_ENV = "WORKFLOW_PREFIX"
WORKFLOW_LOCAL_ROOT_ENV = "WORKFLOW_LOCAL_ROOT"
WORKFLOW_LOCAL_FALLBACK_ENV = "WORKFLOW_LOCAL_FALLBACK"

DEFAULT_WORKFLOW_PREFIX = "workflows"
DEFAULT_LOCAL_ROOT = ".workflow_data"


def _normalize_prefix(prefix: str) -> str:
    cleaned = (prefix or "").strip().strip("/")
    return cleaned or DEFAULT_WORKFLOW_PREFIX


class BaseWorkflowStore:
    def __init__(self, root_prefix: str) -> None:
        self.root_prefix = _normalize_prefix(root_prefix)

    def manifest_path(self, workflow_id: str) -> str:
        return f"{self.root_prefix}/{workflow_id}/manifest.json"

    def artifact_path(self, workflow_id: str, relative_path: str) -> str:
        cleaned = relative_path.strip("/")
        return f"{self.root_prefix}/{workflow_id}/{cleaned}"

    def save_manifest(self, manifest: dict[str, Any]) -> None:
        self.write_json(manifest["workflow_id"], "manifest.json", manifest)

    def load_manifest(self, workflow_id: str) -> dict[str, Any]:
        return self.read_json(workflow_id, "manifest.json")

    def write_json(self, workflow_id: str, relative_path: str, payload: Any) -> None:
        content = json.dumps(payload, ensure_ascii=False, indent=2)
        self.write_text(workflow_id, relative_path, content, content_type="application/json")

    def read_json(self, workflow_id: str, relative_path: str) -> Any:
        return json.loads(self.read_text(workflow_id, relative_path))

    def write_text(
        self,
        workflow_id: str,
        relative_path: str,
        content: str,
        *,
        content_type: str = "text/plain; charset=utf-8",
    ) -> None:
        raise NotImplementedError

    def read_text(self, workflow_id: str, relative_path: str) -> str:
        raise NotImplementedError

    def write_bytes(
        self,
        workflow_id: str,
        relative_path: str,
        content: bytes,
        *,
        content_type: str = "application/octet-stream",
    ) -> None:
        raise NotImplementedError

    def exists(self, workflow_id: str, relative_path: str) -> bool:
        raise NotImplementedError

    @contextmanager
    def materialize_file(self, workflow_id: str, relative_path: str) -> Iterator[str]:
        raise NotImplementedError

    def storage_descriptor(self) -> str:
        raise NotImplementedError


class LocalWorkflowStore(BaseWorkflowStore):
    def __init__(self, root_prefix: str, local_root: str) -> None:
        super().__init__(root_prefix)
        self.local_root = Path(local_root).resolve()
        self.local_root.mkdir(parents=True, exist_ok=True)

    def _path(self, workflow_id: str, relative_path: str) -> Path:
        return self.local_root / self.root_prefix / workflow_id / relative_path.strip("/")

    def write_text(
        self,
        workflow_id: str,
        relative_path: str,
        content: str,
        *,
        content_type: str = "text/plain; charset=utf-8",
    ) -> None:
        file_path = self._path(workflow_id, relative_path)
        file_path.parent.mkdir(parents=True, exist_ok=True)
        file_path.write_text(content, encoding="utf-8")

    def read_text(self, workflow_id: str, relative_path: str) -> str:
        return self._path(workflow_id, relative_path).read_text(encoding="utf-8")

    def write_bytes(
        self,
        workflow_id: str,
        relative_path: str,
        content: bytes,
        *,
        content_type: str = "application/octet-stream",
    ) -> None:
        file_path = self._path(workflow_id, relative_path)
        file_path.parent.mkdir(parents=True, exist_ok=True)
        file_path.write_bytes(content)

    def exists(self, workflow_id: str, relative_path: str) -> bool:
        return self._path(workflow_id, relative_path).exists()

    @contextmanager
    def materialize_file(self, workflow_id: str, relative_path: str) -> Iterator[str]:
        yield str(self._path(workflow_id, relative_path))

    def storage_descriptor(self) -> str:
        return str((self.local_root / self.root_prefix).resolve())


class GCSWorkflowStore(BaseWorkflowStore):
    def __init__(self, bucket_name: str, root_prefix: str) -> None:
        super().__init__(root_prefix)
        self.bucket_name = bucket_name
        self.client = storage.Client()
        self.bucket = self.client.bucket(bucket_name)

    def _blob(self, workflow_id: str, relative_path: str):
        return self.bucket.blob(self.artifact_path(workflow_id, relative_path))

    def write_text(
        self,
        workflow_id: str,
        relative_path: str,
        content: str,
        *,
        content_type: str = "text/plain; charset=utf-8",
    ) -> None:
        self._blob(workflow_id, relative_path).upload_from_string(content, content_type=content_type)

    def read_text(self, workflow_id: str, relative_path: str) -> str:
        return self._blob(workflow_id, relative_path).download_as_text(encoding="utf-8")

    def write_bytes(
        self,
        workflow_id: str,
        relative_path: str,
        content: bytes,
        *,
        content_type: str = "application/octet-stream",
    ) -> None:
        self._blob(workflow_id, relative_path).upload_from_string(content, content_type=content_type)

    def exists(self, workflow_id: str, relative_path: str) -> bool:
        return self._blob(workflow_id, relative_path).exists()

    @contextmanager
    def materialize_file(self, workflow_id: str, relative_path: str) -> Iterator[str]:
        suffix = Path(relative_path).suffix
        temp_file = tempfile.NamedTemporaryFile(delete=False, suffix=suffix)
        temp_file.close()
        blob = self._blob(workflow_id, relative_path)
        blob.download_to_filename(temp_file.name)
        try:
            yield temp_file.name
        finally:
            try:
                os.remove(temp_file.name)
            except FileNotFoundError:
                pass

    def storage_descriptor(self) -> str:
        return f"gs://{self.bucket_name}/{self.root_prefix}"


_store_instance: Optional[BaseWorkflowStore] = None


def get_workflow_store() -> BaseWorkflowStore:
    global _store_instance
    if _store_instance is not None:
        return _store_instance

    root_prefix = os.getenv(WORKFLOW_PREFIX_ENV, DEFAULT_WORKFLOW_PREFIX)
    bucket_name = (os.getenv(WORKFLOW_BUCKET_ENV) or "").strip()
    local_root = os.getenv(WORKFLOW_LOCAL_ROOT_ENV, DEFAULT_LOCAL_ROOT)

    if bucket_name:
        try:
            _store_instance = GCSWorkflowStore(bucket_name, root_prefix)
            return _store_instance
        except Exception:
            allow_local_fallback = os.getenv(WORKFLOW_LOCAL_FALLBACK_ENV, "true").lower() != "false"
            if not allow_local_fallback:
                raise

    _store_instance = LocalWorkflowStore(root_prefix, local_root)
    return _store_instance