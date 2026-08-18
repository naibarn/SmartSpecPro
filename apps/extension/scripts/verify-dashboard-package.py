#!/usr/bin/env python3
import json
import sys
import zipfile
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
package = json.loads((ROOT / "package.json").read_text())
version = package["version"]
zip_path = ROOT.parent / "web/client/public/releases" / f"smartaihub-companion-extension-{version}.zip"
required_files = {
    "manifest.json",
    "panel.html",
    "assets/content.js",
    "assets/dragBridge.js",
    "assets/panel.css",
    "assets/panel.js",
    "assets/serviceWorker.js",
}


def fail(message: str) -> None:
    print(f"Extension dashboard package verification failed: {message}", file=sys.stderr)
    sys.exit(1)


if not zip_path.exists():
    fail(f"missing zip: {zip_path}")

with zipfile.ZipFile(zip_path) as archive:
    names = set(archive.namelist())
    missing = sorted(required_files - names)
    if missing:
        fail(f"missing files in zip: {', '.join(missing)}")

    manifest = json.loads(archive.read("manifest.json"))
    if manifest.get("version") != version:
        fail(f"manifest version {manifest.get('version')} does not match package version {version}")
    if manifest.get("name") != "SmartAIHub Companion":
        fail(f"unexpected manifest name: {manifest.get('name')}")

    panel_js = archive.read("assets/panel.js").decode("utf-8", errors="ignore")
    bundled_js = "\n".join(
        archive.read(name).decode("utf-8", errors="ignore")
        for name in sorted(names)
        if name.startswith("assets/") and name.endswith(".js")
    )
    if version not in panel_js:
        fail(f"panel bundle does not contain version marker {version}")
    if "SmartAIHub Companion" not in panel_js:
        fail("panel bundle does not contain SmartAIHub Companion product name")
    if "/api/desktop-releases/companion-extension/latest" not in bundled_js:
        fail("extension bundle does not contain canonical Companion update route")

    drag_bridge_js = archive.read("assets/dragBridge.js").decode("utf-8", errors="ignore")
    for marker in [
        "google_flow_drag_delivery",
        "grok_drag_delivery",
        "grok_native_file_passthrough",
        "grok_main_world_file_delivery",
        "file_input_after_preview",
        "synthetic_drop_fallback",
        "file_input_retry",
        "dragleave_dragend",
    ]:
        if marker not in drag_bridge_js:
            fail(f"dragBridge bundle missing marker: {marker}")

    if "image-proxy" not in panel_js:
        fail("panel bundle missing same-origin image proxy fallback")

    host_permissions = set(manifest.get("host_permissions", []))
    for grok_match in ["https://grok.com/*", "https://*.grok.com/*"]:
        if grok_match not in host_permissions:
            fail(f"manifest missing Grok host permission: {grok_match}")

    drag_bridge_matches = {
        match
        for script in manifest.get("content_scripts", [])
        if "assets/dragBridge.js" in script.get("js", [])
        for match in script.get("matches", [])
    }
    for grok_match in ["https://grok.com/*", "https://*.grok.com/*"]:
        if grok_match not in drag_bridge_matches:
            fail(f"drag bridge is not injected on Grok: {grok_match}")

    service_worker_js = archive.read("assets/serviceWorker.js").decode("utf-8", errors="ignore")
    if "grok.com" not in service_worker_js:
        fail("service worker does not activate the drag bridge on Grok")
    if "MAIN" not in service_worker_js or "SMARTAIHUB_DELIVER_GROK_MEDIA_TO_MAIN_WORLD" not in service_worker_js:
        fail("service worker missing Grok main-world file delivery")
    if "native_files_setter" not in service_worker_js:
        fail("service worker missing Grok native file-input setter")

print(f"Verified {zip_path}")
