#!/usr/bin/env python3
import json
import sys
import zipfile
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
package = json.loads((ROOT / "package.json").read_text())
version = package["version"]
zip_path = ROOT.parent / "web/client/public/releases" / f"smartaihub-marketplace-capture-extension-{version}.zip"
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

    panel_js = archive.read("assets/panel.js").decode("utf-8", errors="ignore")
    if version not in panel_js:
        fail(f"panel bundle does not contain version marker {version}")

    drag_bridge_js = archive.read("assets/dragBridge.js").decode("utf-8", errors="ignore")
    for marker in [
        "google_flow_drag_delivery",
        "file_input_after_preview",
        "synthetic_drop_fallback",
        "file_input_retry",
        "dragleave_dragend",
    ]:
        if marker not in drag_bridge_js:
            fail(f"dragBridge bundle missing marker: {marker}")

print(f"Verified {zip_path}")
