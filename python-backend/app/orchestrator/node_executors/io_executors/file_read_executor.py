"""File Read Executor - Read files from workflow storage."""

import logging
from pathlib import Path
from typing import Any

import aiofiles

from app.orchestrator.node_executors.base import ExecutionContext, NodeExecutionData

logger = logging.getLogger(__name__)


class FileReadExecutor:
    """
    Read file from workflow storage.

    Security:
    - Path traversal prevention
    - Tenant isolation enforced
    - File size limits
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
        """Read file with security checks."""
        file_path = data.inputs.get("file_path")
        encoding = data.inputs.get("encoding", "utf-8")

        # Sanitize and validate path
        safe_path = self._sanitize_path(file_path, context.tenant_id)

        if not safe_path.exists():
            raise FileNotFoundError(f"File not found: {file_path}")

        # Check file size
        file_size = safe_path.stat().st_size
        if file_size > self.MAX_FILE_SIZE:
            raise ValueError(
                f"File too large: {file_size} bytes (max {self.MAX_FILE_SIZE})"
            )

        # Check extension
        if safe_path.suffix.lower() not in self.ALLOWED_EXTENSIONS:
            raise ValueError(f"File type not allowed: {safe_path.suffix}")

        # Read file
        async with aiofiles.open(safe_path, "r", encoding=encoding) as f:
            content = await f.read()

        return {
            "content": content,
            "file_name": safe_path.name,
            "file_size": file_size,
            "encoding": encoding,
            "extension": safe_path.suffix,
        }

    def _sanitize_path(self, file_path: str, tenant_id: str) -> Path:
        """Sanitize file path to prevent traversal attacks."""
        # Remove any parent directory references
        clean_path = Path(file_path).name

        # Build absolute path within tenant sandbox
        base_path = Path(f"/workflow-files/{tenant_id}")
        safe_path = (base_path / clean_path).resolve()

        # Ensure path is within tenant directory
        try:
            safe_path.relative_to(base_path)
        except ValueError:
            raise ValueError("Invalid file path: path traversal detected")

        return safe_path
