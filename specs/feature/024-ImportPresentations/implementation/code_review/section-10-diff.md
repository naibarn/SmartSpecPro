diff --git a/python-backend/app/services/gslides_importer.py b/python-backend/app/services/gslides_importer.py
index 2a940a3..4eac0b7 100644
--- a/python-backend/app/services/gslides_importer.py
+++ b/python-backend/app/services/gslides_importer.py
@@ -91,13 +91,16 @@ def rgb_float_to_hex(color: dict) -> str:
 async def _download_image(url: str, access_token: str) -> bytes | None:
     """Download a GSlides contentUrl.
 
-    Security: rejects non-HTTPS URLs without making an HTTP request.
-    Returns None on any httpx.HTTPError. Does NOT log the URL (contains embedded credentials).
+    Security:
+      - Rejects non-HTTPS URLs without making an HTTP request.
+      - Disables redirect following to prevent HTTPS→HTTP downgrade attacks.
+      - Returns None on any httpx.HTTPError.
+      - Does NOT log the URL (contains embedded credentials).
     """
     if not url.startswith("https://"):
         return None
     try:
-        async with httpx.AsyncClient(follow_redirects=True, timeout=30.0) as client:
+        async with httpx.AsyncClient(follow_redirects=False, timeout=30.0) as client:
             response = await client.get(
                 url,
                 headers={"Authorization": f"Bearer {access_token}"},
diff --git a/python-backend/app/services/pptx_importer.py b/python-backend/app/services/pptx_importer.py
index 32be8ea..9186355 100644
--- a/python-backend/app/services/pptx_importer.py
+++ b/python-backend/app/services/pptx_importer.py
@@ -4,6 +4,9 @@ PPTX Importer — parses a .pptx file into PresentationSlideContent dicts.
 Uses python-pptx to extract shapes (text, image, rect, line, group).
 Uploads embedded images to R2 via R2StorageService.upload_bytes.
 Returns ImportResult with slides and fidelity_warnings.
+
+Security: python-pptx does not execute VBA macros during parsing. Macro-enabled
+.pptm files are opened read-only — the macro content is ignored.
 """
 import io
 from dataclasses import dataclass
diff --git a/python-backend/tests/test_gslides_importer.py b/python-backend/tests/test_gslides_importer.py
index d2b26f7..cc3daa8 100644
--- a/python-backend/tests/test_gslides_importer.py
+++ b/python-backend/tests/test_gslides_importer.py
@@ -749,6 +749,28 @@ async def test_download_image_rejects_non_https():
     mock_client_cls.assert_not_called()
 
 
+@pytest.mark.asyncio
+@pytest.mark.unit
+async def test_download_image_does_not_follow_redirects():
+    """_download_image uses follow_redirects=False to prevent HTTPS→HTTP downgrade."""
+    from app.services.gslides_importer import _download_image
+
+    with patch("httpx.AsyncClient") as mock_client_cls:
+        mock_client = AsyncMock()
+        mock_client.__aenter__ = AsyncMock(return_value=mock_client)
+        mock_client.__aexit__ = AsyncMock(return_value=False)
+        mock_client.get = AsyncMock(side_effect=httpx.HTTPStatusError(
+            "302 redirect", request=MagicMock(), response=MagicMock(status_code=302)
+        ))
+        mock_client_cls.return_value = mock_client
+
+        result = await _download_image("https://example.com/img.jpg", "token")
+
+    assert result is None
+    # Verify follow_redirects=False was passed
+    mock_client_cls.assert_called_once_with(follow_redirects=False, timeout=30.0)
+
+
 @pytest.mark.asyncio
 @pytest.mark.unit
 async def test_download_image_https_success():
