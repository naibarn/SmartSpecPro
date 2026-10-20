#!/usr/bin/env python3
"""Prepare a pinned CPU Python HTTP image; never publish or start compute."""
import argparse
import hashlib
import json
import os
from pathlib import Path
import re
import shutil
import subprocess
import tempfile

from linux_backend_release import ReleaseError, validate_build_result
from package_cloudflare_http_image import PINNED_IMAGE, packager_source_sha

OWNED = [
    "apps/web/scripts/package_cloudflare_python_http_image.py",
    "apps/web/scripts/package_cloudflare_http_image.py",
    "python-backend/CloudflareHttp.Containerfile",
    "python-backend/app/core/cloudflare_http_entrypoint.py",
    "python-backend/requirements-cloudflare-http.lock",
    "python-backend/requirements-cloudflare-http.in",
]
SOURCE_PATHS = [
    "python-backend/app",
    "apps/web/skills/unified-payin-slip-parser/src",
    "apps/web/skills/unified-payin-slip-parser/configs",
]


def validate_cpu_lock(lock: str) -> None:
    if re.search(r"(?mi)^(?:nvidia[-_]|cuda[-_]|triton\b|--)", lock):
        raise ReleaseError("PYTHON_HTTP_CPU_LOCK_DENIED")
    requirements = lock.replace("\\\n", " ").splitlines()
    if not requirements or not any(line.startswith("torch @ https://download-r2.pytorch.org/whl/cpu/torch-") for line in requirements):
        raise ReleaseError("PYTHON_HTTP_CPU_LOCK_REQUIRED")
    for line in requirements:
        if not line.strip() or line.startswith("#"):
            continue
        parts = line.split("--hash=")
        package = parts[0].strip()
        if not (re.fullmatch(r"[a-zA-Z0-9._-]+==[a-zA-Z0-9.+!_-]+", package) or re.fullmatch(
            r"torch @ https://download-r2\.pytorch\.org/whl/cpu/torch-[^\s/]+\.whl#sha256=[a-f0-9]{64}", package
        )) or len(parts) < 2 or any(not re.fullmatch(r"sha256:[a-f0-9]{64}", value.strip()) for value in parts[1:]):
            raise ReleaseError("PYTHON_HTTP_HASHED_LOCK_REQUIRED")


def prepare_context(build_result: Path, output: Path, base_image: str, connector_image: str) -> dict:
    if not PINNED_IMAGE.fullmatch(base_image) or not PINNED_IMAGE.fullmatch(connector_image):
        raise ReleaseError("HTTP_IMAGE_PINNED_BASE_REQUIRED")
    record, _, workspace = validate_build_result(build_result)
    packager_sha = packager_source_sha(OWNED)
    repository = Path(__file__).parents[3]
    lock = (repository / "python-backend/requirements-cloudflare-http.lock").read_text()
    validate_cpu_lock(lock)
    paths = subprocess.run(
        ["git", "-c", f"safe.directory={workspace}", "-C", str(workspace), "ls-files", "-z", "--", *SOURCE_PATHS],
        capture_output=True, text=True, check=True,
    ).stdout.split("\0")
    if not all((workspace / name).is_file() for name in (
        "python-backend/app/main.py", "python-backend/app/core/application_runtime.py", "python-backend/app/core/application_database_tls.py"
    )):
        raise ReleaseError("PYTHON_HTTP_REQUEST_RUNTIME_REQUIRED")
    if output.exists() or output.is_symlink():
        raise ReleaseError("HTTP_IMAGE_OUTPUT_ALREADY_EXISTS")
    output.parent.mkdir(parents=True, exist_ok=True)
    stage = Path(tempfile.mkdtemp(prefix=".python-http-image-", dir=output.parent))
    try:
        for name in filter(None, paths):
            relative = Path(name)
            source = workspace / name
            if source.is_symlink() or not source.is_file() or not source.resolve().is_relative_to(workspace):
                raise ReleaseError("HTTP_IMAGE_EXTERNAL_LINK_DENIED")
            if source.name == ".env" or source.name.startswith(".env.") or "__pycache__" in source.parts:
                raise ReleaseError("HTTP_IMAGE_ENV_FILE_DENIED")
            target = stage / "runtime" / relative
            target.parent.mkdir(parents=True, exist_ok=True)
            shutil.copyfile(source, target)
        for name in ("src/unified_slip_parser/router.py", "configs/issuer-detection.rules.json", "configs/transaction-type.rules.json", "configs/normalization.rules.json"):
            if not (stage / "runtime/apps/web/skills/unified-payin-slip-parser" / name).is_file():
                raise ReleaseError("PYTHON_HTTP_SLIP_PARSER_REQUIRED")
        shutil.copyfile(repository / "python-backend/app/core/cloudflare_http_entrypoint.py", stage / "runtime/python-backend/app/core/cloudflare_http_entrypoint.py")
        shutil.copyfile(repository / "python-backend/requirements-cloudflare-http.in", stage / "runtime/python-backend/requirements.txt")
        shutil.copyfile(repository / "python-backend/CloudflareHttp.Containerfile", stage / "Containerfile")
        (stage / "requirements-cloudflare-http.lock").write_text(lock)
        files = {str(path.relative_to(stage)): hashlib.sha256(path.read_bytes()).hexdigest() for path in sorted(stage.rglob("*")) if path.is_file()}
        proof = {
            "schemaVersion": 1, "sourceSha": record["source_revision"], "packagerSourceSha": packager_sha,
            "canonicalArtifactDigest": record["artifact"]["artifact_digest"],
            "baseImage": base_image, "connectorImage": connector_image,
            "runtime": "python-http", "containerPolicy": "on-demand", "port": 8000,
            "buildArguments": {"PYTHON_HTTP_IMAGE": base_image, "ACCESS_CONNECTOR_IMAGE": connector_image, "SOURCE_SHA": record["source_revision"]},
            "files": files, "publish": False, "providerMutations": 0,
        }
        (stage / "image-input.json").write_text(json.dumps(proof, indent=2) + "\n")
        os.rename(stage, output)
        return {**proof, "context": str(output)}
    finally:
        if stage.exists():
            shutil.rmtree(stage)


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--build-result", type=Path, required=True)
    parser.add_argument("--output", type=Path, required=True)
    parser.add_argument("--base-image", required=True)
    parser.add_argument("--connector-image", required=True)
    args = parser.parse_args()
    print(json.dumps(prepare_context(args.build_result, args.output.absolute(), args.base_image, args.connector_image)))
