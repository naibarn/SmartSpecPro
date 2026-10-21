#!/usr/bin/env python3
"""Prepare a local image context, never publish or activate paid compute."""
from __future__ import annotations

import argparse
import json
import os
from pathlib import Path
import re
import shutil
import subprocess
import tempfile

from linux_backend_release import ReleaseError, validate_build_result

PINNED_IMAGE = re.compile(r"[a-z0-9][a-z0-9.:-]*/[a-zA-Z0-9/_-]+@sha256:[a-f0-9]{64}")


def validate_runtime(root: Path, source_sha: str) -> None:
    if root.is_symlink():
        raise ReleaseError("HTTP_IMAGE_EXTERNAL_LINK_DENIED")
    root = root.resolve(strict=True)
    metadata = json.loads((root / "release-build.json").read_text())
    if any(metadata.get(key) != source_sha for key in ("sourceSha", "frontendSourceSha", "backendSourceSha")):
        raise ReleaseError("HTTP_IMAGE_SOURCE_MISMATCH")
    for required in ("server/_core/index.ts", "server/_core/applicationRuntime.ts", "server/_core/applicationDatabaseTls.ts", "node_modules/tsx/package.json"):
        if not (root / required).is_file():
            raise ReleaseError("HTTP_IMAGE_REQUEST_RUNTIME_REQUIRED")
    # pnpm relative links must stay inside this artifact when copied into /app.
    for parent, directories, files in os.walk(root):
        for name in directories + files:
            path = Path(parent) / name
            if (name == ".env" or (name.startswith(".env.") and name != ".env.example")) and not path.is_relative_to(root / "node_modules"):
                raise ReleaseError("HTTP_IMAGE_ENV_FILE_DENIED")
            if path.is_symlink():
                if Path(os.readlink(path)).is_absolute():
                    raise ReleaseError("HTTP_IMAGE_EXTERNAL_LINK_DENIED")
                try:
                    target = path.resolve(strict=True)
                except (OSError, RuntimeError) as exc:
                    raise ReleaseError("HTTP_IMAGE_EXTERNAL_LINK_DENIED") from exc
                if not target.is_relative_to(root):
                    raise ReleaseError("HTTP_IMAGE_EXTERNAL_LINK_DENIED")
            elif not path.is_file() and not path.is_dir():
                raise ReleaseError("HTTP_IMAGE_SPECIAL_FILE_DENIED")


def packager_source_sha(owned: list[str] | None = None) -> str:
    root = Path(__file__).parents[3]
    owned = owned or ["apps/web/CloudflareHttp.Containerfile", "apps/web/scripts/package_cloudflare_http_image.py", "apps/web/scripts/cloudflare-http-entrypoint.mjs", "apps/web/scripts/bundle-cloudflare-http-api.mjs", "apps/web/scripts/build_cloudflare_http_image.py"]
    dirty = subprocess.run(["git", "-C", str(root), "status", "--porcelain=v1", "--", *owned], capture_output=True, text=True, check=True).stdout
    if dirty:
        raise ReleaseError("HTTP_IMAGE_PACKAGER_SOURCE_DIRTY")
    return subprocess.run(["git", "-C", str(root), "rev-parse", "HEAD"], capture_output=True, text=True, check=True).stdout.strip()


def prepare_context(build_result: Path, output: Path, base_image: str, connector_image: str) -> dict:
    if not PINNED_IMAGE.fullmatch(base_image) or not PINNED_IMAGE.fullmatch(connector_image):
        raise ReleaseError("HTTP_IMAGE_PINNED_BASE_REQUIRED")
    # Reuse the existing receipt/path/digest/source authority, not a second ledger.
    record, artifact, _ = validate_build_result(build_result)
    packager_sha = packager_source_sha()
    runtime = artifact / "backend-runtime"
    validate_runtime(runtime, record["source_revision"])
    if output.exists() or output.is_symlink():
        raise ReleaseError("HTTP_IMAGE_OUTPUT_ALREADY_EXISTS")
    output.parent.mkdir(parents=True, exist_ok=True)
    stage = Path(tempfile.mkdtemp(prefix=".http-image-", dir=output.parent))
    try:
        def ignore(directory: str, names: list[str]) -> list[str]:
            # SPA assets are already published to the Worker ASSETS binding.
            return [name for name in names if name == ".env" or (name.startswith(".env.") and name != ".env.example")
                    or (Path(directory) == runtime and name in {"dist", ".data", "logs", "uploads"})]
        shutil.copytree(runtime, stage / "runtime", symlinks=True, ignore=ignore)
        bundle = subprocess.run(
            ["node", str(Path(__file__).with_name("bundle-cloudflare-http-api.mjs")), str(runtime),
             str(stage / "runtime"), "/app"],
            capture_output=True, text=True, check=False,
        )
        if bundle.returncode != 0:
            raise ReleaseError("HTTP_IMAGE_API_BUNDLE_FAILED")
        bundle_receipt = json.loads(bundle.stdout)
        shutil.copyfile(Path(__file__).parents[1] / "CloudflareHttp.Containerfile", stage / "Containerfile")
        shutil.copyfile(Path(__file__).with_name("cloudflare-http-entrypoint.mjs"), stage / "cloudflare-http-entrypoint.mjs")
        proof = {"schemaVersion": 1, "packagerSourceSha": packager_sha, "connectorImage": connector_image, "sourceSha": record["source_revision"], "canonicalArtifactDigest": record["artifact"]["artifact_digest"],
                 "baseImage": base_image, "runtime": "node-http", "containerPolicy": "on-demand", "port": 3000,
                 "httpApiBundle": {key: bundle_receipt[key] for key in ("entrypoint", "manifestSha256", "bytes", "inputModules")},
                 "buildArguments": {"NODE_HTTP_IMAGE": base_image, "ACCESS_CONNECTOR_IMAGE": connector_image, "SOURCE_SHA": record["source_revision"]}, "publish": False, "providerMutations": 0}
        (stage / "image-input.json").write_text(json.dumps(proof, indent=2) + "\n")
        os.rename(stage, output)
        return {**proof, "context": str(output)}
    finally:
        if stage.exists():
            shutil.rmtree(stage)


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--build-result", type=Path, required=True)
    parser.add_argument("--output", type=Path, required=True)
    parser.add_argument("--base-image", required=True)
    parser.add_argument("--connector-image", required=True)
    args = parser.parse_args()
    print(json.dumps(prepare_context(args.build_result, args.output.absolute(), args.base_image, args.connector_image)))


if __name__ == "__main__":
    main()
