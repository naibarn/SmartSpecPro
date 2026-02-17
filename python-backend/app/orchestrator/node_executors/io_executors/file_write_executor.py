"""File Write Executor - Write files to workflow storage."""

import logging
from pathlib import Path
from typing import Any
from datetime import datetime, timezone

import aiofiles

from app.orchestrator.node_executors.base import ExecutionContext, NodeExecutionData

logger = logging.getLogger(__name__)


class FileWriteExecutor:
    """
    Write file to workflow storage.

    Features:
    - Automatic directory creation
    - Atomic writes (write to temp, then rename)
    - File size validation
    """

    MAX_FILE_SIZE = 100 * 1024 * 1024  # 100MB
    ALLOWED_EXTENSIONS = {
        ".txt",
        ".json",
        ".csv",
        ".xml",
        ".yaml",
        ".yml",
        ".md",
        ".html",
        ".js",
        ".ts",
        ".py",
    }

    async def execute(
        self, data: NodeExecutionData, context: ExecutionContext
    ) -> dict[str, Any]:
        """Write file with security checks."""
        file_path = data.inputs.get("file_path")
        content = data.inputs.get("content", "")
        encoding = data.inputs.get("encoding", "utf-8")
        append = data.inputs.get("append", False)

        # Validate content size
        content_bytes = content.encode(encoding) if isinstance(content, str) else str(content).encode(encoding)
        if len(content_bytes) > self.MAX_FILE_SIZE:
            raise ValueError(
                f"Content too large: {len(content_bytes)} bytes (max {self.MAX_FILE_SIZE})"
            )

        # Sanitize path
        safe_path = self._sanitize_path(file_path, context.tenant_id)

        # Check extension
        if safe_path.suffix.lower() not in self.ALLOWED_EXTENSIONS:
            raise ValueError(f"File type not allowed: {safe_path.suffix}")

        # Ensure directory exists
        safe_path.parent.mkdir(parents=True, exist_ok=True)

        # Atomic write
        temp_path = safe_path.with_suffix(".tmp")

        mode = "a" if append else "w"
        async with aiofiles.open(temp_path, mode, encoding=encoding) as f:
            await f.write(content)

        # Atomic rename
        temp_path.rename(safe_path)

        return {
            "file_path": str(safe_path),
            "file_name": safe_path.name,
            "bytes_written": len(content_bytes),
            "written_at": datetime.now(timezone.utc).isoformat(),
        }

    def _sanitize_path(self, file_path: str, tenant_id: str) -> Path:
        """Sanitize file path to prevent traversal attacks."""
        clean_path = Path(file_path).name
        base_path = Path(f"/workflow-files/{tenant_id}/outputs")
        safe_path = (base_path / clean_path).resolve()

        try:
            safe_path.relative_to(base_path)
        except ValueError:
            raise ValueError("Invalid file path: path traversal detected")

        return safe_path
