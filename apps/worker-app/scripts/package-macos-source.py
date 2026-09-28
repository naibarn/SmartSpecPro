#!/usr/bin/env python3
"""Create the downloadable Worker App macOS source snapshot."""

from __future__ import annotations

import argparse
import hashlib
import json
import shutil
import subprocess
import sys
import zipfile
from datetime import datetime, timezone
from pathlib import Path


REPO_ROOT = Path(__file__).resolve().parents[3]
APP_ROOT = REPO_ROOT / "apps" / "worker-app"
SOURCE_RELEASES_DIR = REPO_ROOT / "apps" / "web" / "client" / "public" / "releases"
LIVE_RELEASES_DIR = REPO_ROOT / "apps" / "web" / "dist" / "public" / "releases"
SOURCE_ROOTS = (
    Path("package.json"),
    Path("package-lock.json"),
    Path("scripts/check-node-version.mjs"),
    Path("apps/worker-app"),
    Path("packages/remotion-render"),
)

EXCLUDED_PARTS = {
    ".git",
    ".runtime-release-staging",
    ".turbo",
    "node_modules",
    "target",
    "dist",
    "build",
    "runtime-pack",
    "__pycache__",
    ".mypy_cache",
}
EXCLUDED_RELEASE_DIRS = {
    "apps/web/client/public/releases",
    "apps/web/dist/public/releases",
}
EXCLUDED_SUFFIXES = {
    ".dmg",
    ".exe",
    ".msi",
    ".appimage",
    ".7z",
    ".tar",
    ".gz",
    ".sqlite",
    ".sqlite3",
    ".db",
    ".log",
    ".pem",
    ".key",
    ".p12",
    ".pfx",
    ".mobileprovision",
}


def git_source_files() -> list[Path]:
    result = subprocess.run(
        ["git", "ls-files", "--cached", "--others", "--exclude-standard", "-z"],
        cwd=REPO_ROOT,
        check=True,
        stdout=subprocess.PIPE,
    )
    paths: list[Path] = []
    for raw_path in result.stdout.split(b"\0"):
        if not raw_path:
            continue
        relative = Path(raw_path.decode("utf-8"))
        if not any(relative == root or root in relative.parents for root in SOURCE_ROOTS):
            continue
        if should_exclude(relative):
            continue
        absolute = REPO_ROOT / relative
        if absolute.is_file() and not absolute.is_symlink():
            paths.append(relative)
    return sorted(set(paths), key=lambda path: path.as_posix())


def should_exclude(relative: Path) -> bool:
    path_text = relative.as_posix()
    parts = set(relative.parts)
    if parts & EXCLUDED_PARTS:
        return True
    if any(path_text == directory or path_text.startswith(f"{directory}/") for directory in EXCLUDED_RELEASE_DIRS):
        return True

    name = relative.name
    lower_name = name.lower()
    if lower_name.startswith(".env") and lower_name not in {".env.example", ".env.template"}:
        return True
    if lower_name.endswith(tuple(EXCLUDED_SUFFIXES)):
        return True
    if lower_name in {"credentials.json", "service-account.json", "secrets.json"}:
        return True
    return False


def sha256_bytes(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def add_bytes(archive: zipfile.ZipFile, name: str, data: bytes) -> None:
    info = zipfile.ZipInfo(name)
    info.date_time = (2020, 1, 1, 0, 0, 0)
    info.compress_type = zipfile.ZIP_DEFLATED
    info.external_attr = 0o100644 << 16
    archive.writestr(info, data)


def build_archive(output_path: Path, files: list[Path], version: str) -> dict[str, object]:
    entries: list[dict[str, object]] = []
    output_path.parent.mkdir(parents=True, exist_ok=True)
    with zipfile.ZipFile(output_path, "w", compression=zipfile.ZIP_DEFLATED, compresslevel=6) as archive:
        for relative in files:
            data = (REPO_ROOT / relative).read_bytes()
            name = f"smart-ai-hub-worker-app-macos-source-{version}/{relative.as_posix()}"
            add_bytes(archive, name, data)
            entries.append({"path": relative.as_posix(), "sizeBytes": len(data), "sha256": sha256_bytes(data)})

        manifest = {
            "bundleKind": "worker-app-macos-source",
            "workerAppVersion": version,
            "generatedAt": datetime.now(timezone.utc).isoformat(),
            "fileCount": len(entries),
            "excluded": [
                "node_modules",
                "target/dist/build output",
                "generated runtime packs and release binaries",
                "environment files and private key material",
            ],
            "files": entries,
        }
        manifest_data = (json.dumps(manifest, indent=2, ensure_ascii=False) + "\n").encode("utf-8")
        add_bytes(
            archive,
            f"smart-ai-hub-worker-app-macos-source-{version}/SOURCE_BUNDLE_MANIFEST.json",
            manifest_data,
        )
    return {"fileCount": len(entries), "archiveSha256": sha256_bytes(output_path.read_bytes())}


def validate_archive(path: Path, version: str) -> None:
    root = f"smart-ai-hub-worker-app-macos-source-{version}/"
    forbidden_fragments = (
        "/node_modules/",
        "/target/",
        "/dist/",
        "/runtime-pack/",
        "/.env",
        "/.git/",
    )
    with zipfile.ZipFile(path) as archive:
        names = archive.namelist()
        required = {
            f"{root}package.json",
            f"{root}package-lock.json",
            f"{root}apps/worker-app/package.json",
            f"{root}apps/worker-app/MAC_BUILD.md",
            f"{root}apps/worker-app/MAC_RUNTIME_BUILD.md",
            f"{root}apps/worker-app/scripts/package-macos-runtime.mjs",
            f"{root}apps/worker-app/src-tauri/entitlements.plist",
            f"{root}SOURCE_BUNDLE_MANIFEST.json",
        }
        missing = sorted(required - set(names))
        if missing:
            raise RuntimeError(f"source bundle is missing required files: {', '.join(missing)}")
        forbidden = [
            name
            for name in names
            if any(fragment in f"/{name}" for fragment in forbidden_fragments if fragment != "/.env")
            or any(
                part.startswith(".env") and part not in {".env.example", ".env.template"}
                for part in Path(name).parts
            )
        ]
        if forbidden:
            raise RuntimeError(f"source bundle contains forbidden paths: {', '.join(forbidden[:5])}")


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--output-dir", type=Path, default=SOURCE_RELEASES_DIR)
    parser.add_argument("--no-live-copy", action="store_true")
    args = parser.parse_args()

    package = json.loads((APP_ROOT / "package.json").read_text(encoding="utf-8"))
    version = str(package["version"])
    files = git_source_files()
    if len(files) < 50:
        raise RuntimeError(f"source file selection unexpectedly small: {len(files)} files")

    archive_name = f"smart-ai-hub-worker-app-macos-source-{version}.zip"
    output_path = args.output_dir / archive_name
    metadata = build_archive(output_path, files, version)
    validate_archive(output_path, version)

    if not args.no_live_copy and LIVE_RELEASES_DIR.exists() and args.output_dir.resolve() != LIVE_RELEASES_DIR.resolve():
        LIVE_RELEASES_DIR.mkdir(parents=True, exist_ok=True)
        shutil.copy2(output_path, LIVE_RELEASES_DIR / archive_name)

    print(json.dumps({"archive": str(output_path), **metadata}, indent=2))
    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except (OSError, RuntimeError, subprocess.CalledProcessError) as error:
        print(f"[worker-app] macOS source bundle failed: {error}", file=sys.stderr)
        raise SystemExit(1)
