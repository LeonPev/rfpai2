"""File storage abstraction supporting Google Cloud Storage with local fallback."""

from __future__ import annotations

from contextlib import contextmanager
from io import BytesIO
import os
from pathlib import Path
import tempfile
from typing import Iterator, Optional

from dotenv import load_dotenv
from google.cloud import storage

load_dotenv()

# Environment variables
FILE_BUCKET_ENV = "FILE_BUCKET"
FILE_PREFIX_ENV = "FILE_PREFIX"
FILE_LOCAL_ROOT_ENV = "FILE_LOCAL_ROOT"
FILE_LOCAL_FALLBACK_ENV = "FILE_LOCAL_FALLBACK"

DEFAULT_FILE_PREFIX = "files"
DEFAULT_LOCAL_ROOT = ".file_data"


class BaseFileStore:
    """Base class for file storage implementations."""

    def __init__(self, root_prefix: str) -> None:
        self.root_prefix = (root_prefix or "").strip().strip("/") or DEFAULT_FILE_PREFIX

    def file_path(self, namespace: str, filename: str) -> str:
        """Get the full path for a file in storage."""
        cleaned = filename.strip("/")
        return f"{self.root_prefix}/{namespace}/{cleaned}"

    def write_bytes(
        self,
        namespace: str,
        filename: str,
        content: bytes,
        content_type: str = "application/octet-stream",
    ) -> None:
        """Write bytes to storage."""
        raise NotImplementedError

    def read_bytes(self, namespace: str, filename: str) -> bytes:
        """Read bytes from storage."""
        raise NotImplementedError

    def write_text(
        self,
        namespace: str,
        filename: str,
        content: str,
        content_type: str = "text/plain; charset=utf-8",
    ) -> None:
        """Write text to storage."""
        self.write_bytes(namespace, filename, content.encode("utf-8"), content_type)

    def read_text(self, namespace: str, filename: str) -> str:
        """Read text from storage."""
        return self.read_bytes(namespace, filename).decode("utf-8")

    def exists(self, namespace: str, filename: str) -> bool:
        """Check if file exists in storage."""
        raise NotImplementedError

    def delete(self, namespace: str, filename: str) -> bool:
        """Delete file from storage. Returns True if deleted, False if not found."""
        raise NotImplementedError

    def list_files(self, namespace: str) -> list[str]:
        """List all files in a namespace."""
        raise NotImplementedError

    @contextmanager
    def materialize_file(self, namespace: str, filename: str) -> Iterator[str]:
        """Provide a local file path for reading. Context manager yields the path."""
        raise NotImplementedError

    def storage_descriptor(self) -> str:
        """Get a description of where files are stored."""
        raise NotImplementedError


class LocalFileStore(BaseFileStore):
    """File storage using local filesystem."""

    def __init__(self, root_prefix: str, local_root: str) -> None:
        super().__init__(root_prefix)
        self.local_root = Path(local_root).resolve()
        self.local_root.mkdir(parents=True, exist_ok=True)

    def _path(self, namespace: str, filename: str) -> Path:
        """Get the full local path for a file."""
        path = self.local_root / self.root_prefix / namespace / filename.strip("/")
        # Security: ensure path is within local_root
        try:
            path.resolve().relative_to(self.local_root)
        except ValueError:
            raise ValueError(f"Invalid path: {filename}")
        return path

    def write_bytes(
        self,
        namespace: str,
        filename: str,
        content: bytes,
        content_type: str = "application/octet-stream",
    ) -> None:
        file_path = self._path(namespace, filename)
        file_path.parent.mkdir(parents=True, exist_ok=True)
        file_path.write_bytes(content)

    def read_bytes(self, namespace: str, filename: str) -> bytes:
        return self._path(namespace, filename).read_bytes()

    def exists(self, namespace: str, filename: str) -> bool:
        return self._path(namespace, filename).exists()

    def delete(self, namespace: str, filename: str) -> bool:
        path = self._path(namespace, filename)
        if path.exists():
            path.unlink()
            return True
        return False

    def list_files(self, namespace: str) -> list[str]:
        namespace_path = self.local_root / self.root_prefix / namespace
        if not namespace_path.exists():
            return []
        return sorted([f.name for f in namespace_path.iterdir() if f.is_file()])

    @contextmanager
    def materialize_file(self, namespace: str, filename: str) -> Iterator[str]:
        yield str(self._path(namespace, filename))

    def storage_descriptor(self) -> str:
        return str((self.local_root / self.root_prefix).resolve())


class GCSFileStore(BaseFileStore):
    """File storage using Google Cloud Storage."""

    def __init__(self, bucket_name: str, root_prefix: str) -> None:
        super().__init__(root_prefix)
        self.bucket_name = bucket_name
        self.client = storage.Client()
        self.bucket = self.client.bucket(bucket_name)

    def _blob(self, namespace: str, filename: str):
        """Get a GCS blob reference."""
        return self.bucket.blob(self.file_path(namespace, filename))

    def write_bytes(
        self,
        namespace: str,
        filename: str,
        content: bytes,
        content_type: str = "application/octet-stream",
    ) -> None:
        self._blob(namespace, filename).upload_from_string(content, content_type=content_type)

    def read_bytes(self, namespace: str, filename: str) -> bytes:
        return self._blob(namespace, filename).download_as_bytes()

    def exists(self, namespace: str, filename: str) -> bool:
        return self._blob(namespace, filename).exists()

    def delete(self, namespace: str, filename: str) -> bool:
        blob = self._blob(namespace, filename)
        if blob.exists():
            blob.delete()
            return True
        return False

    def list_files(self, namespace: str) -> list[str]:
        prefix = f"{self.root_prefix}/{namespace}/"
        blobs = self.client.list_blobs(self.bucket_name, prefix=prefix)
        return sorted([blob.name.split("/")[-1] for blob in blobs if blob.name != prefix])

    @contextmanager
    def materialize_file(self, namespace: str, filename: str) -> Iterator[str]:
        """Download file to temporary location and clean up after."""
        suffix = Path(filename).suffix
        temp_file = tempfile.NamedTemporaryFile(delete=False, suffix=suffix)
        temp_file.close()
        blob = self._blob(namespace, filename)
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


_store_instance: Optional[BaseFileStore] = None


def get_file_store() -> BaseFileStore:
    """Get or create the file store instance."""
    global _store_instance
    if _store_instance is not None:
        return _store_instance

    root_prefix = os.getenv(FILE_PREFIX_ENV, DEFAULT_FILE_PREFIX)
    bucket_name = (os.getenv(FILE_BUCKET_ENV) or "").strip()
    local_root = os.getenv(FILE_LOCAL_ROOT_ENV, DEFAULT_LOCAL_ROOT)

    if bucket_name:
        try:
            _store_instance = GCSFileStore(bucket_name, root_prefix)
            return _store_instance
        except Exception:
            allow_local_fallback = os.getenv(FILE_LOCAL_FALLBACK_ENV, "true").lower() != "false"
            if not allow_local_fallback:
                raise

    _store_instance = LocalFileStore(root_prefix, local_root)
    return _store_instance


def reset_file_store() -> None:
    """Reset the global file store instance (useful for testing)."""
    global _store_instance
    _store_instance = None
