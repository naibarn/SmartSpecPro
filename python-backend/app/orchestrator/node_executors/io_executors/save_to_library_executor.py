"""Save to Library Executor - Save workflow output to My Library."""

import csv
import io
import json
import os
import time
from typing import Any, Optional

import httpx
import structlog

from app.core.config import settings
from app.orchestrator.node_executors.base import ExecutionContext, NodeExecutionData

logger = structlog.get_logger()


class SaveToLibraryExecutor:
    """
    Save workflow output as a document in My Library (Document Management).

    Creates a new library item via internal tRPC HTTP call to the Node.js
    backend, linking it back to the originating workflow execution.
    """

    REQUEST_TIMEOUT = 30.0
    MAX_CONTENT_SIZE = 10 * 1024 * 1024  # 10 MB

    CONTENT_TYPE_MAP: dict[str, str] = {
        "markdown": "text/markdown",
        "text": "text/plain",
        "json": "application/json",
        "csv": "text/csv",
        "html": "text/html",
    }

    EXTENSION_TO_CONTENT_TYPE: dict[str, str] = {
        ".md": "markdown",
        ".txt": "text",
        ".json": "json",
        ".csv": "csv",
        ".html": "html",
        ".htm": "html",
    }

    CONTENT_TYPE_TO_ITEM_TYPE: dict[str, str] = {
        "markdown": "document",
        "text": "text",
        "json": "data",
        "csv": "spreadsheet",
        "html": "document",
    }

    def _get_gateway_url(self) -> str:
        url = getattr(settings, "SMARTSPEC_WEB_GATEWAY_URL", "") or os.getenv(
            "SMARTSPEC_WEB_GATEWAY_URL", ""
        )
        return url.rstrip("/") if url else "http://localhost:3000"

    def _get_gateway_token(self) -> str:
        return getattr(settings, "SMARTSPEC_WEB_GATEWAY_TOKEN", "") or os.getenv(
            "SMARTSPEC_WEB_GATEWAY_TOKEN", ""
        )

    def _auth_headers(self, context: ExecutionContext) -> dict[str, str]:
        headers: dict[str, str] = {"Content-Type": "application/json"}
        token = self._get_gateway_token()
        if token:
            headers["Authorization"] = f"Bearer {token}"
        if context.user_id:
            headers["X-User-ID"] = str(context.user_id)
        if context.tenant_id:
            headers["X-Tenant-ID"] = context.tenant_id
        return headers

    async def execute(
        self, data: NodeExecutionData, context: ExecutionContext
    ) -> dict[str, Any]:
        """Save content to the library."""
        start_time = time.monotonic()

        content = data.inputs.get("content")
        file_name = data.inputs.get("file_name")
        content_type = data.inputs.get("content_type")
        folder = data.inputs.get("folder")
        tags = data.inputs.get("tags")
        title = data.inputs.get("title")
        visibility = data.inputs.get("visibility", "private")

        if content is None:
            return self._error_result("content is required")

        if not file_name or not isinstance(file_name, str):
            return self._error_result(
                "file_name is required and must be a string"
            )

        file_name = file_name.strip()
        if not file_name:
            return self._error_result("file_name must not be empty")

        if any(c in file_name for c in ["/", "\\", ".."]) or file_name.startswith("."):
            return self._error_result(
                "file_name contains invalid characters or patterns. "
                "Path separators (/, \\), directory traversal (..), "
                "and hidden file prefixes (.) are not allowed."
            )

        if not content_type:
            content_type = self._detect_content_type(file_name)

        if (
            content_type not in self.CONTENT_TYPE_MAP
            and content_type not in self.CONTENT_TYPE_MAP.values()
        ):
            return self._error_result(
                f"Unsupported content_type: '{content_type}'. "
                f"Supported: {', '.join(sorted(self.CONTENT_TYPE_MAP.keys()))}"
            )

        for short, mime in self.CONTENT_TYPE_MAP.items():
            if content_type == mime:
                content_type = short
                break

        valid_visibilities = {"private", "team", "public"}
        if visibility not in valid_visibilities:
            visibility = "private"

        if tags is not None:
            if not isinstance(tags, list):
                return self._error_result("tags must be a list of strings")
            tags = [str(t).strip() for t in tags if t][:20]

        content_str = self._serialize_content(content, content_type)
        if content_str is None:
            return self._error_result("Failed to serialize content")

        content_bytes = content_str.encode("utf-8")
        if len(content_bytes) > self.MAX_CONTENT_SIZE:
            return self._error_result(
                f"Content too large: {len(content_bytes)} bytes "
                f"(max {self.MAX_CONTENT_SIZE // (1024 * 1024)} MB)"
            )

        logger.info(
            "save_to_library_start",
            file_name=file_name,
            content_type=content_type,
            content_size=len(content_bytes),
            node_id=data.node_id,
            workflow_id=context.workflow_id,
        )

        item_type = self.CONTENT_TYPE_TO_ITEM_TYPE.get(content_type, "document")
        display_title = (title or file_name).strip()

        create_input: dict[str, Any] = {
            "itemType": item_type,
            "source": "workflow",
            "title": display_title,
            "status": "ready",
            "visibility": visibility,
            "metadata": {
                "file_name": file_name,
                "content_type": content_type,
                "source_type": "workflow",
                "workflow_id": context.workflow_id,
                "execution_id": context.execution_id,
            },
            "sourceLink": {
                "linkType": "workflow",
                "linkId": context.execution_id,
                "providerTaskId": context.workflow_id,
            },
        }

        if folder:
            create_input["metadata"]["folder"] = folder
        if tags:
            create_input["metadata"]["tags"] = tags

        base_url = self._get_gateway_url()
        headers = self._auth_headers(context)

        try:
            result = await self._create_library_item(
                base_url, create_input, headers
            )
        except Exception as e:
            return self._error_result(f"Failed to create library item: {e}")

        if not result:
            return self._error_result("Library API returned empty result")

        item_id = result.get("item", {}).get("id") or result.get("id")
        file_url = (
            result.get("item", {}).get("sourceUrl") or result.get("sourceUrl")
        )

        if item_id and content_type in ("markdown", "text", "html"):
            try:
                await self._save_markdown_content(
                    base_url, item_id, content_str, headers
                )
            except Exception as e:
                logger.warning(
                    "save_to_library_content_save_failed",
                    item_id=item_id,
                    error=str(e),
                    node_id=data.node_id,
                )

        elapsed_ms = self._elapsed_ms(start_time)
        logger.info(
            "save_to_library_complete",
            item_id=item_id,
            file_name=file_name,
            elapsed_ms=elapsed_ms,
            node_id=data.node_id,
        )

        return {
            "item_id": item_id,
            "file_url": file_url,
            "success": True,
            "error": None,
        }

    async def _create_library_item(
        self,
        base_url: str,
        create_input: dict[str, Any],
        headers: dict[str, str],
    ) -> Optional[dict[str, Any]]:
        url = f"{base_url}/trpc/library.createItem?batch=1"
        payload = {"0": {"json": create_input}}

        async with httpx.AsyncClient(timeout=self.REQUEST_TIMEOUT) as client:
            response = await client.post(url, json=payload, headers=headers)

        if response.status_code != 200:
            raise RuntimeError(
                f"Library createItem API returned status {response.status_code}: "
                f"{response.text[:500]}"
            )

        body = response.json()

        if isinstance(body, list) and len(body) > 0:
            result_data = body[0].get("result", {}).get("data", {})
            return result_data.get("json") or result_data
        elif isinstance(body, dict):
            result_data = body.get("result", {}).get("data", {})
            return result_data.get("json") or result_data

        return None

    async def _save_markdown_content(
        self,
        base_url: str,
        item_id: int,
        content: str,
        headers: dict[str, str],
    ) -> None:
        url = f"{base_url}/trpc/library.saveMarkdown?batch=1"
        payload = {
            "0": {
                "json": {
                    "id": item_id,
                    "content": content,
                    "changeDescription": "Created by workflow",
                },
            },
        }

        async with httpx.AsyncClient(timeout=self.REQUEST_TIMEOUT) as client:
            response = await client.post(url, json=payload, headers=headers)

        if response.status_code != 200:
            raise RuntimeError(
                f"Library saveMarkdown API returned status {response.status_code}: "
                f"{response.text[:500]}"
            )

    def _detect_content_type(self, file_name: str) -> str:
        _, ext = os.path.splitext(file_name)
        return self.EXTENSION_TO_CONTENT_TYPE.get(ext.lower(), "text")

    def _serialize_content(
        self, content: Any, content_type: str
    ) -> Optional[str]:
        if isinstance(content, str):
            return content

        if isinstance(content, (dict, list)):
            if content_type == "json":
                return json.dumps(
                    content, indent=2, ensure_ascii=False, default=str
                )
            elif content_type == "csv":
                return self._dict_list_to_csv(content)
            else:
                return json.dumps(
                    content, indent=2, ensure_ascii=False, default=str
                )

        if content is None:
            return ""

        return str(content)

    def _dict_list_to_csv(self, content: Any) -> str:
        if not isinstance(content, list) or not content:
            return str(content)

        if not isinstance(content[0], dict):
            output = io.StringIO()
            writer = csv.writer(output)
            writer.writerow(["value"])
            for item in content:
                writer.writerow([item])
            return output.getvalue()

        output = io.StringIO()
        fieldnames = list(content[0].keys())
        writer = csv.DictWriter(output, fieldnames=fieldnames)
        writer.writeheader()
        for row in content:
            writer.writerow(row)
        return output.getvalue()

    def _elapsed_ms(self, start_time: float) -> float:
        return round((time.monotonic() - start_time) * 1000, 2)

    def _error_result(self, error_message: str) -> dict[str, Any]:
        return {
            "item_id": None,
            "file_url": None,
            "success": False,
            "error": error_message,
        }
# mypy: ignore-errors
