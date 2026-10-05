#!/usr/bin/env python3
"""Build public web assets from origin/main and publish them to the web service."""

from __future__ import annotations

import hashlib
import json
import os
import shutil
import subprocess
import sys
import tempfile
import tomllib
from datetime import datetime, timezone
from pathlib import Path


class DeployError(RuntimeError):
    pass


def run_git(repo: Path, *args: str) -> str:
    result = subprocess.run(
        ["git", "-C", str(repo), *args],
        text=True,
        capture_output=True,
        check=False,
    )
    if result.returncode:
        raise DeployError(result.stderr.strip() or f"git {' '.join(args)} failed")
    return result.stdout.strip()


def bootstrap_controller(repo: Path, temporary: Path) -> tuple[Path, Path, str]:
    """Load policy and builder from fetched main so stale checkouts can run this."""
    fetch = subprocess.run(
        ["git", "-C", str(repo), "fetch", "--no-tags", "origin", "main"],
        text=True,
        capture_output=True,
        check=False,
    )
    if fetch.returncode:
        raise DeployError(f"Unable to fetch origin/main: {fetch.stderr.strip()}")
    source_sha = run_git(repo, "rev-parse", "FETCH_HEAD^{commit}")
    policy_text = run_git(repo, "show", f"{source_sha}:.development-repository.toml")
    controller_text = run_git(
        repo, "show", f"{source_sha}:scripts/development-lifecycle/canonical_source.py"
    )
    policy_path = temporary / "repository.toml"
    controller_path = temporary / "canonical_source.py"
    policy_path.write_text(policy_text + "\n", encoding="utf-8")
    controller_path.write_text(controller_text, encoding="utf-8")
    policy = tomllib.loads(policy_text)["repository"]
    if policy.get("remote") != "origin" or policy.get("canonical_ref") != "refs/heads/main":
        raise DeployError("origin/main differs from the repository's configured canonical ref")
    return policy_path, controller_path, source_sha


def service_web_root() -> Path:
    configured = os.environ.get("SSP_WEB_PUBLISH_ROOT")
    if configured:
        root = Path(configured).expanduser().resolve()
    else:
        state = subprocess.run(
            ["systemctl", "show", "smartspec-web.service", "--property=ActiveState", "--value"],
            text=True,
            capture_output=True,
            check=False,
        )
        working = subprocess.run(
            ["systemctl", "show", "smartspec-web.service", "--property=WorkingDirectory", "--value"],
            text=True,
            capture_output=True,
            check=False,
        )
        if state.returncode or working.returncode or state.stdout.strip() != "active":
            raise DeployError(
                "smartspec-web.service is not active; set SSP_WEB_PUBLISH_ROOT to the intended apps/web directory"
            )
        root = Path(working.stdout.strip()).resolve()

    package_json = root / "package.json"
    if not root.is_dir() or not package_json.is_file() or not (root / "dist/public/index.html").is_file():
        raise DeployError(f"Publish target is not an initialized web service: {root}")
    try:
        package = json.loads(package_json.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as exc:
        raise DeployError(f"Cannot validate publish target package: {exc}") from exc
    if package.get("name") != "@smartspec/web":
        raise DeployError(f"Publish target package name is unexpected: {root}")
    return root


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as stream:
        for block in iter(lambda: stream.read(1024 * 1024), b""):
            digest.update(block)
    return digest.hexdigest()


def publish_public_tree(source: Path, destination: Path, backup: Path) -> tuple[int, str]:
    source_index = source / "index.html"
    destination_index = destination / "index.html"
    if not source_index.is_file() or not destination_index.is_file():
        raise DeployError("Build output or service target is missing index.html")
    if backup.exists():
        raise DeployError(f"Backup destination already exists: {backup}")

    backup.parent.mkdir(parents=True, exist_ok=True)
    shutil.copytree(destination, backup, symlinks=True, copy_function=shutil.copy2)

    destination_root = destination.resolve()
    copied = 0
    for current, directory_names, file_names in os.walk(source, followlinks=False):
        current_path = Path(current)
        directory_names[:] = [
            name for name in directory_names if not (current_path / name).is_symlink()
        ]
        for name in file_names:
            source_file = current_path / name
            if source_file.is_symlink() or source_file == source_index:
                continue
            relative = source_file.relative_to(source)
            target_file = destination / relative
            target_file.parent.mkdir(parents=True, exist_ok=True)
            if (
                not target_file.parent.resolve().is_relative_to(destination_root)
                or target_file.is_symlink()
            ):
                raise DeployError(f"Asset path escapes the publish directory: {relative}")
            shutil.copy2(source_file, target_file)
            if sha256(source_file) != sha256(target_file):
                raise DeployError(f"Published asset hash mismatch: {relative}")
            copied += 1

    descriptor, temporary_name = tempfile.mkstemp(
        prefix=".index.html.codex-", dir=destination
    )
    os.close(descriptor)
    temporary_index = Path(temporary_name)
    try:
        shutil.copy2(source_index, temporary_index)
        os.replace(temporary_index, destination_index)
    finally:
        temporary_index.unlink(missing_ok=True)

    index_hash = sha256(destination_index)
    if index_hash != sha256(source_index):
        shutil.copy2(backup / "index.html", temporary_index)
        os.replace(temporary_index, destination_index)
        raise DeployError("Published index hash mismatch; previous index was restored")
    return copied, index_hash


def main() -> int:
    repo = Path(__file__).resolve().parents[3]
    arguments = sys.argv[1:]
    if arguments == ["--help"]:
        print("Build latest origin/main and publish public assets to smartspec-web.service.")
        print("Usage: npm run build:deploy [--plan | atomic swap]")
        return 0
    if arguments not in ([], ["--plan"], ["atomic", "swap"]):
        raise DeployError("Usage: npm run build:deploy [--plan | atomic swap]")
    plan_only = arguments == ["--plan"]
    if arguments == ["atomic", "swap"]:
        print("Note: 'atomic swap' is accepted for compatibility; publication is atomic by default.")

    with tempfile.TemporaryDirectory(prefix="sspro-main-builder-") as temporary_dir:
        temporary = Path(temporary_dir)
        policy_path, controller_path, fetched_sha = bootstrap_controller(repo, temporary)
        service_root = service_web_root()
        destination = service_root / "dist/public"
        if plan_only:
            print(f"SOURCE_REVISION={fetched_sha}")
            print(f"PUBLISH_TARGET={destination}")
            print("MODE=plan; no build or publication performed")
            return 0

        command = [
            sys.executable,
            str(controller_path),
            "build",
            "--repository",
            str(repo),
            "--policy",
            str(policy_path),
            "--build-target",
            "smartspec-web",
        ]
        required_revision = os.environ.get("SSP_REQUIRED_INTEGRATED_REVISION")
        if required_revision:
            command.extend(["--required-integrated-revision", required_revision])
        result = subprocess.run(command, text=True, stdout=subprocess.PIPE, check=False)
        if result.returncode:
            raise DeployError(f"Canonical build failed with exit code {result.returncode}")
        try:
            build = json.loads(result.stdout.strip().splitlines()[-1])
        except (IndexError, json.JSONDecodeError) as exc:
            raise DeployError("Canonical builder did not return a result record") from exc
        if build.get("status") != "BUILD_PASSED":
            raise DeployError(f"Canonical build status is {build.get('status')!r}; nothing was published")
        if build.get("source_revision") != fetched_sha:
            raise DeployError("The canonical source advanced during bootstrap; rerun the command")

        source = Path(build["isolated_workspace"]) / "apps/web/dist/public"
        backup_root = Path.home() / ".cache/codex/deploy-backups"
        stamp = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%S.%fZ")
        backup = backup_root / f"smartspec-web-main-{stamp}"
        copied, index_hash = publish_public_tree(source, destination, backup)
        print(f"SOURCE_REVISION={build['source_revision']}")
        print(f"PUBLISH_TARGET={destination}")
        print(f"BACKUP={backup}")
        print(f"PUBLISHED_ASSETS={copied}")
        print(f"INDEX_SHA256={index_hash}")
        print("SERVICE_RESTART=not-required-for-static-assets")
    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except DeployError as exc:
        print(f"build:deploy stopped: {exc}", file=sys.stderr)
        raise SystemExit(2)
