"""Library Input Executor - Read files from My Library (Document Management)."""

import ipaddress
import json
import os
import socket
import tempfile
import time
import urllib.parse
from typing import Any, Optional

import httpx
import structlog

from app.core.config import settings
from app.orchestrator.node_executors.base import ExecutionContext, NodeExecutionData

logger = structlog.get_logger()


class LibraryInputExecutor:
    """
    Read a file from My Library (Document Management) into the workflow.

    Communicates with the Node.js backend via internal tRPC HTTP API to
    retrieve library item metadata and file content.
    """

    REQUEST_TIMEOUT = 60.0
    MAX_TEXT_SIZE = 20 * 1024 * 1024  # 20 MB
    MAX_PARSE_SIZE = 50 * 1024 * 1024  # 50 MB
    VALID_FORMATS = {"raw", "text", "rows"}

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
        """Read a library item with optional content parsing."""
        start_time = time.monotonic()

        item_id = data.inputs.get("item_id")
        output_format = data.inputs.get("format", "raw")

        if not item_id:
            return self._error_result("item_id is required")

        item_id_str = str(item_id).strip()
        if not item_id_str:
            return self._error_result("item_id must not be empty")

        if output_format not in self.VALID_FORMATS:
            return self._error_result(
                f"Invalid format: '{output_format}'. "
                f"Supported: {', '.join(sorted(self.VALID_FORMATS))}"
            )

        logger.info(
            "library_input_start",
            item_id=item_id_str,
            format=output_format,
            node_id=data.node_id,
            workflow_id=context.workflow_id,
        )

        base_url = self._get_gateway_url()
        headers = self._auth_headers(context)

        # Fetch item metadata via tRPC
        try:
            item_meta = await self._fetch_item_metadata(
                base_url, item_id_str, headers
            )
        except Exception as e:
            return self._error_result(
                f"Failed to fetch library item metadata: {e}"
            )

        if item_meta is None:
            return self._error_result(f"Library item not found: {item_id_str}")

        file_name = item_meta.get("title", "unknown")
        source_url = item_meta.get("sourceUrl")
        mime_type = self._resolve_mime_type(item_meta)
        file_size = self._resolve_file_size(item_meta)
        item_metadata = item_meta.get("metadata") or {}

        if output_format == "raw":
            return {
                "content": None,
                "file_url": source_url,
                "file_name": file_name,
                "mime_type": mime_type,
                "file_size": file_size,
                "rows": None,
                "row_count": 0,
                "columns": [],
                "metadata": item_metadata,
                "success": True,
                "error": None,
            }

        if not source_url:
            return self._error_result(
                "Library item has no downloadable file (sourceUrl is empty)"
            )

        try:
            file_bytes = await self._download_file(source_url, headers)
        except Exception as e:
            return self._error_result(f"Failed to download library file: {e}")

        if file_bytes is None:
            return self._error_result("Downloaded file content is empty")

        actual_size = len(file_bytes)

        if output_format == "text":
            if actual_size > self.MAX_TEXT_SIZE:
                return self._error_result(
                    f"File too large for text extraction: {actual_size} bytes "
                    f"(max {self.MAX_TEXT_SIZE // (1024 * 1024)} MB)"
                )
            try:
                text_content = file_bytes.decode("utf-8", errors="replace")
            except Exception as e:
                return self._error_result(
                    f"Failed to decode file as text: {e}"
                )

            return {
                "content": text_content,
                "file_url": source_url,
                "file_name": file_name,
                "mime_type": mime_type,
                "file_size": actual_size,
                "rows": None,
                "row_count": 0,
                "columns": [],
                "metadata": item_metadata,
                "success": True,
                "error": None,
            }

        # Format: rows (CSV or Excel)
        if actual_size > self.MAX_PARSE_SIZE:
            return self._error_result(
                f"File too large for row parsing: {actual_size} bytes "
                f"(max {self.MAX_PARSE_SIZE // (1024 * 1024)} MB)"
            )

        parsed = await self._parse_as_rows(
            file_bytes, file_name, mime_type, data, context
        )

        elapsed_ms = self._elapsed_ms(start_time)
        logger.info(
            "library_input_complete",
            item_id=item_id_str,
            format="rows",
            row_count=parsed.get("row_count", 0),
            elapsed_ms=elapsed_ms,
            node_id=data.node_id,
        )

        return {
            "content": None,
            "file_url": source_url,
            "file_name": file_name,
            "mime_type": mime_type,
            "file_size": actual_size,
            "rows": parsed.get("rows", []),
            "row_count": parsed.get("row_count", 0),
            "columns": parsed.get("columns", []),
            "metadata": item_metadata,
            "success": parsed.get("success", True),
            "error": parsed.get("error"),
        }

    async def _fetch_item_metadata(
        self, base_url: str, item_id: str, headers: dict[str, str]
    ) -> Optional[dict[str, Any]]:
        try:
            numeric_id = int(item_id)
        except ValueError:
            raise ValueError(f"item_id must be numeric, got: {item_id}")

        input_json = json.dumps({"0": {"json": {"id": numeric_id}}})
        encoded_input = urllib.parse.quote(input_json)
        url = f"{base_url}/trpc/library.getItem?batch=1&input={encoded_input}"

        async with httpx.AsyncClient(timeout=self.REQUEST_TIMEOUT) as client:
            response = await client.get(url, headers=headers)

        if response.status_code == 404:
            return None

        if response.status_code != 200:
            raise RuntimeError(
                f"Library API returned status {response.status_code}: "
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

    def _validate_url_safety(self, url: str) -> None:
        """Validate that a URL is safe to fetch (SSRF protection).

        Blocks requests to private/internal IP ranges and non-HTTP schemes.
        Raises ValueError if the URL is unsafe.
        """
        parsed = urllib.parse.urlparse(url)

        if parsed.scheme not in ("http", "https"):
            raise ValueError(
                f"Unsupported URL scheme: '{parsed.scheme}'. Only http and https are allowed."
            )

        hostname = parsed.hostname
        if not hostname:
            raise ValueError("URL has no hostname")

        # Resolve hostname to IP addresses and check each one
        try:
            addr_infos = socket.getaddrinfo(hostname, parsed.port or 443, proto=socket.IPPROTO_TCP)
        except socket.gaierror as e:
            raise ValueError(f"Cannot resolve hostname '{hostname}': {e}")

        blocked_networks = [
            ipaddress.ip_network("127.0.0.0/8"),
            ipaddress.ip_network("10.0.0.0/8"),
            ipaddress.ip_network("172.16.0.0/12"),
            ipaddress.ip_network("192.168.0.0/16"),
            ipaddress.ip_network("169.254.0.0/16"),
            ipaddress.ip_network("::1/128"),
            ipaddress.ip_network("fd00::/8"),
            # IPv6-mapped IPv4 (bypass via ::ffff:127.0.0.1 etc.)
            ipaddress.ip_network("::ffff:0:0/96"),
            # IPv6 link-local
            ipaddress.ip_network("fe80::/10"),
            # Carrier-grade NAT (shared address space)
            ipaddress.ip_network("100.64.0.0/10"),
            # IPv4 multicast
            ipaddress.ip_network("224.0.0.0/4"),
            # IPv6 multicast
            ipaddress.ip_network("ff00::/8"),
        ]

        for family, _type, _proto, _canonname, sockaddr in addr_infos:
            ip_str = sockaddr[0]
            try:
                ip_addr = ipaddress.ip_address(ip_str)
                # Unmap IPv6-mapped IPv4 addresses so they are checked
                # against the IPv4 blocked ranges (e.g. ::ffff:127.0.0.1 -> 127.0.0.1)
                if isinstance(ip_addr, ipaddress.IPv6Address) and ip_addr.ipv4_mapped:
                    ip_addr = ip_addr.ipv4_mapped
            except ValueError:
                continue
            for network in blocked_networks:
                if ip_addr in network:
                    raise ValueError(
                        f"URL resolves to blocked internal address {ip_str} "
                        f"(network {network}). Requests to private/internal IPs are not allowed."
                    )

    async def _download_file(
        self, url: str, headers: dict[str, str]
    ) -> Optional[bytes]:
        """Download a file with manual redirect handling to prevent SSRF.

        Each redirect target is re-validated against the blocked network list
        before following, preventing redirect-based SSRF attacks where the
        initial URL is safe but redirects to an internal IP.
        """
        self._validate_url_safety(url)

        max_redirects = 5
        current_url = url

        async with httpx.AsyncClient(
            timeout=self.REQUEST_TIMEOUT,
            follow_redirects=False,
        ) as client:
            response = await client.get(current_url, headers=headers)

            redirect_count = 0
            while response.is_redirect and redirect_count < max_redirects:
                redirect_url = str(response.headers.get("location", ""))
                if not redirect_url:
                    break

                # Resolve relative redirects to absolute URLs
                if redirect_url.startswith("/"):
                    parsed_current = urllib.parse.urlparse(current_url)
                    redirect_url = (
                        f"{parsed_current.scheme}://{parsed_current.netloc}{redirect_url}"
                    )

                # Re-validate the redirect target against SSRF rules
                self._validate_url_safety(redirect_url)

                current_url = redirect_url
                response = await client.get(current_url, headers=headers)
                redirect_count += 1

            if response.is_redirect:
                raise ValueError(f"Too many redirects (max {max_redirects})")

            response.raise_for_status()
            return response.content if response.content else None

    async def _parse_as_rows(
        self,
        file_bytes: bytes,
        file_name: str,
        mime_type: str,
        data: NodeExecutionData,
        context: ExecutionContext,
    ) -> dict[str, Any]:
        ext = os.path.splitext(file_name)[1].lower() if file_name else ""
        is_excel = ext in {".xlsx", ".xlsm", ".xltx", ".xltm"} or mime_type in {
            "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
            "application/vnd.ms-excel",
        }
        is_csv = ext == ".csv" or mime_type in {"text/csv", "application/csv"}

        if is_excel:
            return await self._parse_excel(file_bytes, data, context)
        elif is_csv:
            return await self._parse_csv(file_bytes, data, context)
        else:
            return {
                "rows": [],
                "row_count": 0,
                "columns": [],
                "success": False,
                "error": (
                    f"Cannot parse file as rows: unsupported type "
                    f"(extension='{ext}', mime='{mime_type}'). "
                    "Supported: .csv, .xlsx"
                ),
            }

    async def _parse_excel(
        self,
        file_bytes: bytes,
        data: NodeExecutionData,
        context: ExecutionContext,
    ) -> dict[str, Any]:
        from app.orchestrator.node_executors.data_executors.excel_parser_executor import (
            ExcelParserExecutor,
        )

        tmp_fd, tmp_path = tempfile.mkstemp(suffix=".xlsx")
        try:
            with os.fdopen(tmp_fd, "wb") as f:
                f.write(file_bytes)

            excel_data = NodeExecutionData(
                node_id=data.node_id,
                node_type="excel_parser",
                config=data.config,
                inputs={
                    "excel_input": tmp_path,
                    "sheet_name": data.inputs.get("sheet_name"),
                    "has_header": data.inputs.get("has_header", True),
                    "skip_rows": data.inputs.get("skip_rows", 0),
                    "max_rows": data.inputs.get("max_rows", 100_000),
                },
                state=data.state,
            )
            executor = ExcelParserExecutor()
            return await executor.execute(excel_data, context)
        finally:
            if os.path.exists(tmp_path):
                os.unlink(tmp_path)

    async def _parse_csv(
        self,
        file_bytes: bytes,
        data: NodeExecutionData,
        context: ExecutionContext,
    ) -> dict[str, Any]:
        from app.orchestrator.node_executors.data_executors.csv_parser_executor import (
            CSVParserExecutor,
        )

        try:
            csv_text = file_bytes.decode(
                data.inputs.get("encoding", "utf-8"), errors="replace"
            )
        except Exception as e:
            return {
                "rows": [],
                "row_count": 0,
                "columns": [],
                "success": False,
                "error": f"Failed to decode CSV content: {e}",
            }

        csv_data = NodeExecutionData(
            node_id=data.node_id,
            node_type="csv_parser",
            config=data.config,
            inputs={
                "csv_input": csv_text,
                "has_header": data.inputs.get("has_header", True),
                "skip_rows": data.inputs.get("skip_rows", 0),
                "max_rows": data.inputs.get("max_rows", 100_000),
            },
            state=data.state,
        )
        executor = CSVParserExecutor()
        result = await executor.execute(csv_data, context)
        result.setdefault("success", True)
        result.setdefault("error", None)
        return result

    def _resolve_mime_type(self, item_meta: dict[str, Any]) -> str:
        metadata = item_meta.get("metadata") or {}
        return (
            metadata.get("file_type")
            or metadata.get("mimeType")
            or metadata.get("mime_type")
            or "application/octet-stream"
        )

    def _resolve_file_size(self, item_meta: dict[str, Any]) -> int:
        metadata = item_meta.get("metadata") or {}
        size = metadata.get("file_size_bytes") or metadata.get("fileSize") or 0
        try:
            return int(size)
        except (TypeError, ValueError):
            return 0

    def _elapsed_ms(self, start_time: float) -> float:
        return round((time.monotonic() - start_time) * 1000, 2)

    def _error_result(self, error_message: str) -> dict[str, Any]:
        return {
            "content": None,
            "file_url": None,
            "file_name": "",
            "mime_type": "",
            "file_size": 0,
            "rows": None,
            "row_count": 0,
            "columns": [],
            "metadata": {},
            "success": False,
            "error": error_message,
        }
