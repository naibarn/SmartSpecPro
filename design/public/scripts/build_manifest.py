#!/usr/bin/env python3
"""Generate a content-addressed manifest for the SmartAIHub public design package."""

import hashlib
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
OUTPUT = ROOT / "PUBLIC_DESIGN_PACKAGE.json"
PACKAGE_FILES = sorted(
    path for path in ROOT.rglob("*")
    if path.is_file() and path != OUTPUT and "__pycache__" not in path.parts
)
AUTHORITIES = [
    Path("specs/feature/263-smartaihub-public-website-experience-modernization/spec.md"),
    Path("specs/feature/263-smartaihub-public-website-experience-modernization/implementation/public-route-inventory.json"),
    Path("specs/feature/263-smartaihub-public-website-experience-modernization/implementation/public-claims-registry.json"),
    Path("specs/feature/263-smartaihub-public-website-experience-modernization/implementation/public-media-governance-inventory.json"),
]

files = []
for path in PACKAGE_FILES:
    content = path.read_bytes()
    files.append({"path": path.relative_to(ROOT).as_posix(), "sha256": hashlib.sha256(content).hexdigest()})

authority_files = []
for relative_path in AUTHORITIES:
    path = ROOT.parent.parent / relative_path
    if not path.is_file():
        raise SystemExit(f"missing source authority: {relative_path}")
    authority_files.append({"path": relative_path.as_posix(), "sha256": hashlib.sha256(path.read_bytes()).hexdigest()})

canonical = json.dumps(files, ensure_ascii=False, separators=(",", ":")).encode()
manifest = {
    "package": "smartaihub-public-web",
    "version": "1.0.0",
    "aligned_with": "Spec 270 R1.4",
    "experience_authority": "Spec 263 revision 263.8",
    "artifact_status": "repository-owned public UI candidate; not a Spec 270 native canonical design artifact",
    "package_digest_algorithm": "sha256(canonical-json(file-path-and-sha256-list))",
    "package_digest": hashlib.sha256(canonical).hexdigest(),
    "files": files,
    "source_authorities": authority_files,
}
OUTPUT.write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + "\n")
print(manifest["package_digest"])
