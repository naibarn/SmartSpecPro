#!/usr/bin/env python3
"""Prepare and promote an exact-SHA Python backend release on Linux systemd.

The existing environment file, virtualenv, service unit, working directory,
database and runtime data stay in place. Only Python source is immutable and
versioned; promotion changes one owned systemd drop-in and verifies both
health and database readiness, with automatic rollback on failure.
"""

from __future__ import annotations

import argparse
import fcntl
import hashlib
import json
import os
import pwd
import re
import shlex
import shutil
import stat
import subprocess
import sys
import time
import urllib.error
import urllib.request
import uuid
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Protocol


SERVICE = "smartspec-backend.service"
RELEASE_ROOT = Path("/home/dev/production-releases/smartspec-python-releases")
DROPIN = Path("/etc/systemd/system/smartspec-backend.service.d/96-canonical-python-release.conf")
READY_URL = "http://127.0.0.1:8000/api/v1/health/ready"
HEALTH_URL = "http://127.0.0.1:8000/health"
SHA_RE = re.compile(r"^[0-9a-f]{40,64}$")
RELEASE_ID_RE = re.compile(r"^smartspec-python-(?P<sha>[0-9a-f]{40,64})-(?P<digest>[0-9a-f]{12})$")
EXCLUDED_DIRS = {".venv", "__pycache__", ".pytest_cache", ".mypy_cache", ".ruff_cache", ".tox", "venv"}
EXCLUDED_FILES = {".env", ".env.local", ".env.production"}


class ReleaseError(RuntimeError):
    pass


def _run(command: list[str], *, cwd: Path | None = None) -> str:
    result = subprocess.run(command, cwd=cwd, text=True, capture_output=True, check=False)
    if result.returncode:
        detail = result.stderr.strip() or result.stdout.strip()
        raise ReleaseError(f"command failed ({command[0]}): {detail[:500]}")
    return result.stdout.strip()


def sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as stream:
        for block in iter(lambda: stream.read(1024 * 1024), b""):
            digest.update(block)
    return digest.hexdigest()


def tree_manifest(root: Path) -> dict[str, Any]:
    rows: list[tuple[str, str, int]] = []
    for directory, dirnames, filenames in os.walk(root, followlinks=False):
        current = Path(directory)
        for name in dirnames:
            path = current / name
            if path.is_symlink() and name not in EXCLUDED_DIRS:
                raise ReleaseError(f"Python release contains a symlinked directory: {path.relative_to(root).as_posix()}")
        dirnames[:] = sorted(name for name in dirnames if name not in EXCLUDED_DIRS and not name.startswith(".env."))
        for name in sorted(filenames):
            if name in EXCLUDED_FILES or name.startswith(".env.") or name.endswith((".pyc", ".pyo")) or name == "release-manifest.json":
                continue
            path = current / name
            relative = path.relative_to(root).as_posix()
            if path.is_symlink():
                raise ReleaseError(f"Python release contains a symlink: {relative}")
            if path.is_file():
                rows.append((relative, sha256_file(path), path.stat().st_size))
    canonical = "\n".join(f"{name}\0{digest}\0{size}" for name, digest, size in rows)
    return {"artifact_digest": f"sha256:{hashlib.sha256(canonical.encode()).hexdigest()}", "file_count": len(rows)}


def _ignore(directory: str, names: list[str]) -> set[str]:
    ignored: set[str] = set()
    for name in names:
        if name in EXCLUDED_DIRS or name in EXCLUDED_FILES or name.startswith(".env."):
            ignored.add(name)
        elif name.endswith((".pyc", ".pyo")):
            ignored.add(name)
    return ignored


def source_candidate_is_eligible(source_root: Path, source_sha: str, canonical_sha: str,
                                release_policy: dict[str, Any]) -> bool:
    required = release_policy.get("required_source_ancestors", [])
    if not isinstance(required, list) or any(not isinstance(item, str) or not SHA_RE.fullmatch(item) for item in required):
        return False
    git = ["git", "-C", str(source_root)]

    def ancestor(older: str, newer: str) -> bool:
        return subprocess.run([*git, "merge-base", "--is-ancestor", older, newer],
                              capture_output=True, check=False).returncode == 0

    if not all(ancestor(required_sha, source_sha) for required_sha in required):
        return False
    if source_sha == canonical_sha:
        return True
    if not ancestor(source_sha, canonical_sha):
        return False
    return release_policy.get("allow_approved_immutable_candidates") is True


def validate_source(source_root: Path, source_sha: str, canonical_ref: str = "refs/heads/main") -> dict[str, Any]:
    if not SHA_RE.fullmatch(source_sha):
        raise ReleaseError("Python source revision is invalid")
    if canonical_ref != "refs/heads/main":
        raise ReleaseError("Python release is not pinned to origin/main")
    if _run(["git", "rev-parse", "HEAD"], cwd=source_root) != source_sha:
        raise ReleaseError("Python source workspace does not match the requested revision")
    dirty = _run(["git", "status", "--porcelain=v1", "--untracked-files=all"], cwd=source_root)
    if dirty:
        raise ReleaseError("Python release requires a clean canonical source workspace")
    policy = source_root / ".development-repository.toml"
    if not policy.is_file():
        raise ReleaseError("Canonical repository policy is missing")
    import tomllib
    config = tomllib.loads(policy.read_text(encoding="utf-8"))["repository"]
    release_policy = config.get("release", {})
    remote = str(config.get("remote", "origin"))
    ref = str(config.get("canonical_ref", "refs/heads/main"))
    tip = _run(["git", "ls-remote", "--exit-code", remote, ref], cwd=source_root)
    rows = [line.split("\t", 1)[0] for line in tip.splitlines() if "\t" in line]
    if len(rows) != 1 or not source_candidate_is_eligible(source_root, source_sha, rows[0], release_policy):
        raise ReleaseError("Python release candidate rejected: canonical ancestry or required security-floor policy failed")
    backend = source_root / "python-backend"
    if not (backend / "app/main.py").is_file() or not any((backend / name).is_file() for name in ("requirements.txt", "pyproject.toml")):
        raise ReleaseError("Canonical source is missing the Python application or dependency manifest")
    return {"canonical_tip_at_preparation": rows[0], "immutable_candidate_allowed_by_policy": rows[0] != source_sha,
            "required_source_ancestors": release_policy.get("required_source_ancestors", [])}


def prepare_artifact(source_root: Path, artifact_store: Path = RELEASE_ROOT, *, source_sha: str | None = None) -> dict[str, Any]:
    source_root = source_root.resolve(strict=True)
    source_sha = source_sha or _run(["git", "rev-parse", "HEAD"], cwd=source_root)
    freshness = validate_source(source_root, source_sha)
    source_backend = source_root / "python-backend"
    slip_parser_root = source_root / "apps/web/skills/unified-payin-slip-parser"
    slip_parser_source = slip_parser_root / "src/unified_slip_parser"
    if not slip_parser_source.is_dir() or not (slip_parser_source / "router.py").is_file():
        raise ReleaseError("Canonical source is missing the Python pay-in-slip parser runtime package")
    if not all((slip_parser_root / f"configs/{name}").is_file() for name in ("issuer-detection.rules.json", "transaction-type.rules.json")):
        raise ReleaseError("Canonical source is missing the Python pay-in-slip parser runtime configuration")
    tree_manifest(source_backend)
    tree_manifest(slip_parser_source)
    tree_manifest(slip_parser_root / "configs")
    artifact_store.mkdir(parents=True, exist_ok=True)
    staging = artifact_store / f".smartspec-python-{source_sha}-{uuid.uuid4().hex}.tmp"
    try:
        shutil.copytree(source_backend, staging, ignore=_ignore, symlinks=False)
        vendor_package = staging / "vendor/unified-payin-slip-parser/src/unified_slip_parser"
        vendor_package.parent.mkdir(parents=True)
        shutil.copytree(slip_parser_source, vendor_package, ignore=_ignore, symlinks=False)
        shutil.copytree(slip_parser_root / "configs", staging / "vendor/unified-payin-slip-parser/configs", ignore=_ignore, symlinks=False)
        for path in staging.rglob("*"):
            if path.name == ".env" or path.name.startswith(".env.") or path.name in {".venv", "venv"}:
                raise ReleaseError("Secret or virtual environment entered Python release artifact")
        copied = tree_manifest(staging)
        release_id = f"smartspec-python-{source_sha}-{copied['artifact_digest'][7:19]}"
        manifest = {
            "schema_version": 1,
            "release_id": release_id,
            "source_sha": source_sha,
            "canonical_ref": "refs/heads/main",
            "source_workspace": str(source_root),
            "canonical_tip_at_preparation": freshness["canonical_tip_at_preparation"],
            "immutable_candidate_allowed_by_policy": freshness["immutable_candidate_allowed_by_policy"],
            "required_source_ancestors": freshness["required_source_ancestors"],
            "artifact_digest": copied["artifact_digest"],
            "artifact_file_count": copied["file_count"],
            "runtime_paths": [".", "vendor/unified-payin-slip-parser/src"],
            "created_at": datetime.now(timezone.utc).isoformat(),
        }
        target = artifact_store / release_id
        if target.exists():
            existing = validate_artifact(target)
            if existing["artifact_digest"] != manifest["artifact_digest"]:
                raise ReleaseError("Immutable Python release ID already exists with different contents")
            return {"status": "ARTIFACT_READY", "release_id": release_id, "artifact_path": str(target), "manifest": existing}
        write_json_atomic(staging / "release-manifest.json", manifest, mode=0o444)
        _freeze(staging)
        os.replace(staging, target)
    finally:
        if staging.exists():
            shutil.rmtree(staging)
    return {"status": "ARTIFACT_READY", "release_id": release_id, "artifact_path": str(target), "manifest": manifest}


def write_json_atomic(path: Path, value: dict[str, Any], *, mode: int = 0o644) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    temporary = path.with_name(f".{path.name}.{uuid.uuid4().hex}.tmp")
    try:
        with temporary.open("x", encoding="utf-8") as stream:
            json.dump(value, stream, sort_keys=True)
            stream.write("\n")
            stream.flush()
            os.fsync(stream.fileno())
        os.chmod(temporary, mode)
        os.replace(temporary, path)
    finally:
        temporary.unlink(missing_ok=True)


def _freeze(root: Path) -> None:
    for path in sorted(root.rglob("*"), reverse=True):
        if path.is_dir():
            path.chmod(0o555)
        elif path.is_file():
            path.chmod(0o444)
    root.chmod(0o555)


def validate_artifact(artifact_path: Path) -> dict[str, Any]:
    artifact_path = artifact_path.resolve(strict=True)
    try:
        manifest = json.loads((artifact_path / "release-manifest.json").read_text(encoding="utf-8"))
    except (OSError, ValueError) as exc:
        raise ReleaseError("Python release manifest is unavailable") from exc
    match = RELEASE_ID_RE.fullmatch(str(manifest.get("release_id", "")))
    if (manifest.get("schema_version") != 1 or not match or artifact_path.name != manifest["release_id"] or
            manifest.get("source_sha") != match.group("sha") or manifest.get("canonical_ref") != "refs/heads/main" or
            not (artifact_path / "app/main.py").is_file() or
            not (artifact_path / "vendor/unified-payin-slip-parser/src/unified_slip_parser/router.py").is_file()):
        raise ReleaseError("Python release manifest or application identity is invalid")
    actual = tree_manifest(artifact_path)
    if actual["artifact_digest"] != manifest.get("artifact_digest") or actual["file_count"] != manifest.get("artifact_file_count"):
        raise ReleaseError("Immutable Python release artifact digest mismatch")
    if match.group("digest") != actual["artifact_digest"][7:19]:
        raise ReleaseError("Python release ID is not bound to its artifact digest")
    return manifest


def parse_exec_start(value: str) -> list[str]:
    match = re.search(r"argv\[\]=(.*?)(?:\s+;\s+ignore_errors=|\s+;\s+start_time=|$)", value)
    if not match:
        raise ReleaseError("Cannot parse smartspec-backend.service ExecStart")
    try:
        argv = shlex.split(match.group(1))
    except ValueError as exc:
        raise ReleaseError("Python service ExecStart is malformed") from exc
    if (not argv or not argv[0].endswith("/python-backend/.venv/bin/uvicorn") or
            "app.main:app" not in argv or "--host" not in argv or "0.0.0.0" not in argv or
            "--port" not in argv or "8000" not in argv):
        raise ReleaseError("smartspec-backend.service differs from the approved Uvicorn runtime")
    if "--app-dir" in argv:
        index = argv.index("--app-dir")
        if index + 1 >= len(argv):
            raise ReleaseError("Python service app directory is missing")
        app_dir = Path(argv[index + 1]).resolve(strict=True)
        try:
            if app_dir.parent != RELEASE_ROOT.resolve(strict=True):
                raise ReleaseError("Python service app directory is outside the approved immutable release root")
        except OSError as exc:
            raise ReleaseError("Approved immutable Python release root is unavailable") from exc
        validate_artifact(app_dir)
    return argv


def base_exec_start(argv: list[str]) -> list[str]:
    if "--app-dir" not in argv:
        return list(argv)
    index = argv.index("--app-dir")
    return [*argv[:index], *argv[index + 2:]]


class Runtime(Protocol):
    def assert_supported_target(self) -> list[str]: ...
    def dropin_bytes(self) -> bytes | None: ...
    def set_dropin(self, content: bytes | None) -> None: ...
    def daemon_reload(self) -> None: ...
    def restart(self) -> None: ...
    def verify(self, release_path: Path, source_sha: str, original_cwd: str) -> dict[str, Any]: ...
    def verify_rollback(self, prior_exec: list[str], prior_release: str | None, original_cwd: str) -> dict[str, Any]: ...
    def working_directory(self) -> str: ...


class SystemdRuntime:
    def __init__(self, timeout: int = 75):
        self.timeout = timeout

    def _systemctl(self, *args: str) -> str:
        return _run(["systemctl", *args])

    def assert_supported_target(self) -> list[str]:
        if os.geteuid() != 0:
            raise ReleaseError("Python production promotion must run through the approved sudo release command")
        if self._systemctl("is-active", SERVICE) != "active":
            raise ReleaseError("smartspec-backend.service must be active before promotion")
        if self._systemctl("show", SERVICE, "--property=User", "--value") != "dev":
            raise ReleaseError("Python backend service owner differs from the approved runtime")
        if self._systemctl("show", SERVICE, "--property=EnvironmentFiles", "--value") != "/home/dev/projects/SmartSpecPro/python-backend/.env (ignore_errors=yes)":
            raise ReleaseError("Python backend environment file differs from the preserved production environment")
        return parse_exec_start(self._systemctl("show", SERVICE, "--property=ExecStart", "--value"))

    def dropin_bytes(self) -> bytes | None:
        return DROPIN.read_bytes() if DROPIN.exists() else None

    def set_dropin(self, content: bytes | None) -> None:
        if content is None:
            DROPIN.unlink(missing_ok=True)
            return
        DROPIN.parent.mkdir(parents=True, exist_ok=True)
        temporary = DROPIN.with_name(f".{DROPIN.name}.{uuid.uuid4().hex}.tmp")
        try:
            with temporary.open("xb") as stream:
                stream.write(content)
                stream.flush()
                os.fsync(stream.fileno())
            os.chmod(temporary, 0o644)
            os.replace(temporary, DROPIN)
        finally:
            temporary.unlink(missing_ok=True)

    def daemon_reload(self) -> None:
        self._systemctl("daemon-reload")

    def restart(self) -> None:
        self._systemctl("restart", SERVICE)

    def working_directory(self) -> str:
        return self._systemctl("show", SERVICE, "--property=WorkingDirectory", "--value")

    @staticmethod
    def _request(url: str, expected: set[int]) -> tuple[int, dict[str, Any] | None]:
        try:
            with urllib.request.urlopen(url, timeout=4) as response:
                status = response.status
                body = response.read(1024 * 1024)
        except urllib.error.HTTPError as exc:
            status, body = exc.code, exc.read(1024 * 1024)
        if status not in expected:
            raise ReleaseError(f"Python health probe {url.rsplit('/', 1)[-1]} returned HTTP {status}")
        try:
            parsed = json.loads(body)
        except (ValueError, UnicodeDecodeError):
            parsed = None
        return status, parsed if isinstance(parsed, dict) else None

    def _process_evidence(self, release_path: Path, source_sha: str, original_cwd: str) -> dict[str, Any]:
        if self._systemctl("is-active", SERVICE) != "active":
            raise ReleaseError("Python systemd service is not active")
        pid = int(self._systemctl("show", SERVICE, "--property=MainPID", "--value"))
        if pid <= 1:
            raise ReleaseError("Python service has no main PID")
        process_cwd = str(Path(f"/proc/{pid}/cwd").resolve(strict=True))
        if process_cwd != str(Path(original_cwd).resolve(strict=True)):
            raise ReleaseError("Python backend working directory changed during immutable-source promotion")
        argv = [item.decode("utf-8", "replace") for item in Path(f"/proc/{pid}/cmdline").read_bytes().split(b"\0") if item]
        try:
            app_dir = Path(argv[argv.index("--app-dir") + 1]).resolve(strict=True)
        except (ValueError, IndexError, OSError) as exc:
            raise ReleaseError("Serving process is not bound to an immutable Python app directory") from exc
        if app_dir != release_path.resolve(strict=True):
            raise ReleaseError("Serving Python app directory does not match promoted immutable release")
        process_env: dict[str, str] = {}
        for item in Path(f"/proc/{pid}/environ").read_bytes().split(b"\0"):
            if b"=" in item:
                key, value = item.split(b"=", 1)
                process_env[key.decode("utf-8", "replace")] = value.decode("utf-8", "replace")
        expected_vendor_path = str(release_path.resolve(strict=True) / "vendor/unified-payin-slip-parser/src")
        python_path = process_env.get("PYTHONPATH", "")
        if expected_vendor_path not in python_path.split(os.pathsep):
            raise ReleaseError("Serving Python process is missing the immutable pay-in-slip parser runtime path")
        release_match = RELEASE_ID_RE.fullmatch(release_path.name)
        if not release_match or release_match.group("sha") != source_sha:
            raise ReleaseError("Serving app directory is not bound to the promoted source revision")
        health_status, _ = self._request(HEALTH_URL, {200})
        ready_status, ready_payload = self._request(READY_URL, {200})
        if not ready_payload or ready_payload.get("status") != "ready":
            raise ReleaseError("Python database readiness payload did not confirm ready")
        return {"status": "HEALTHY", "service": SERVICE, "pid": pid, "working_directory": process_cwd,
                "app_directory": str(app_dir), "runtime_revision": source_sha,
                "vendor_python_path": expected_vendor_path,
                "health_http": health_status, "database_readiness_http": ready_status,
                "readiness_payload_status": (ready_payload or {}).get("status")}

    def verify(self, release_path: Path, source_sha: str, original_cwd: str) -> dict[str, Any]:
        deadline, last_error = time.monotonic() + self.timeout, "service_not_ready"
        while time.monotonic() < deadline:
            try:
                return self._process_evidence(release_path, source_sha, original_cwd)
            except (OSError, ValueError, urllib.error.URLError, ReleaseError) as exc:
                last_error = str(exc)
                time.sleep(1)
        raise ReleaseError(f"Python promotion readiness timed out: {last_error}")

    def verify_rollback(self, prior_exec: list[str], prior_release: str | None, original_cwd: str) -> dict[str, Any]:
        deadline, last_error = time.monotonic() + self.timeout, "service_not_ready"
        while time.monotonic() < deadline:
            try:
                if self._systemctl("is-active", SERVICE) != "active":
                    raise ReleaseError("rollback Python service is not active")
                pid = int(self._systemctl("show", SERVICE, "--property=MainPID", "--value"))
                cwd = str(Path(f"/proc/{pid}/cwd").resolve(strict=True))
                if cwd != str(Path(original_cwd).resolve(strict=True)):
                    raise ReleaseError("rollback working directory differs from the original service")
                argv = [item.decode("utf-8", "replace") for item in Path(f"/proc/{pid}/cmdline").read_bytes().split(b"\0") if item]
                restored_exec = parse_exec_start(self._systemctl("show", SERVICE, "--property=ExecStart", "--value"))
                if restored_exec != prior_exec or argv[1:] != prior_exec:
                    raise ReleaseError("rollback executable/arguments differ from the original service")
                health, _ = self._request(HEALTH_URL, {200})
                readiness, payload = self._request(READY_URL, {200, 503})
                return {"status": "ROLLED_BACK_SERVICE_HEALTHY", "service": SERVICE, "pid": pid,
                        "working_directory": cwd, "runtime_revision": prior_release,
                        "health_http": health, "database_readiness_http": readiness,
                        "readiness_payload_status": (payload or {}).get("status")}
            except (OSError, ValueError, urllib.error.URLError, ReleaseError) as exc:
                last_error = str(exc)
                time.sleep(1)
        raise ReleaseError(f"Python rollback verification timed out: {last_error}")


def systemd_dropin(exec_start: list[str], release_path: Path, source_sha: str) -> bytes:
    manifest = validate_artifact(release_path)
    if manifest["source_sha"] != source_sha:
        raise ReleaseError("Python service command source does not match the immutable release")
    argv = [exec_start[0], "--app-dir", str(release_path), *exec_start[1:]]
    quoted = " ".join(shlex.quote(part) for part in argv)
    python_path = release_path / "vendor/unified-payin-slip-parser/src"
    return ("[Service]\n" f"Environment=PYTHONPATH={python_path}\n" "ExecStart=\n" f"ExecStart={quoted}\n").encode()


def promote_artifact(artifact_path: Path, *, runtime: Runtime | None = None, receipt_root: Path = RELEASE_ROOT / "production-deployments",
                     release_root: Path = RELEASE_ROOT) -> dict[str, Any]:
    release_root.mkdir(parents=True, exist_ok=True)
    lock_path = release_root / ".python-promotion.lock"
    with lock_path.open("a+") as lock:
        fcntl.flock(lock, fcntl.LOCK_EX)
        return _promote_artifact_locked(artifact_path, runtime=runtime, receipt_root=receipt_root, release_root=release_root)


def _promote_artifact_locked(artifact_path: Path, *, runtime: Runtime | None = None, receipt_root: Path = RELEASE_ROOT / "production-deployments",
                             release_root: Path = RELEASE_ROOT) -> dict[str, Any]:
    runtime = runtime or SystemdRuntime()
    manifest = validate_artifact(artifact_path)
    artifact_path = artifact_path.resolve(strict=True)
    if artifact_path.parent != release_root.resolve(strict=True):
        raise ReleaseError("Python production promotion accepts only artifacts in the approved immutable release root")
    original_exec = runtime.assert_supported_target()
    launch_exec = base_exec_start(original_exec)
    original_cwd = runtime.working_directory()
    if not original_cwd:
        raise ReleaseError("Python backend service has no working directory")
    prior_dropin = runtime.dropin_bytes()
    prior_release = None
    if prior_dropin:
        match = re.search(rb'Environment="RELEASE=([0-9a-f]{40,64})"', prior_dropin)
        prior_release = match.group(1).decode() if match else None
    receipt_id = f"python-{manifest['source_sha']}-{uuid.uuid4().hex[:12]}"
    receipt: dict[str, Any] = {"schema_version": 1, "receipt_id": receipt_id, "service": SERVICE,
        "source_sha": manifest["source_sha"], "release_id": manifest["release_id"],
        "artifact_digest": manifest["artifact_digest"], "original_working_directory": original_cwd,
        "original_exec_start": original_exec, "original_release": prior_release,
        "dropin_path": str(DROPIN), "dropin_before_sha256": hashlib.sha256(prior_dropin).hexdigest() if prior_dropin is not None else None,
        "started_at": datetime.now(timezone.utc).isoformat()}
    try:
        runtime.set_dropin(systemd_dropin(launch_exec, artifact_path, manifest["source_sha"]))
        runtime.daemon_reload()
        runtime.restart()
        verification = runtime.verify(artifact_path, manifest["source_sha"], original_cwd)
        receipt.update({"status": "DEPLOYED_VERIFIED", "runtime_verification": verification,
                       "completed_at": datetime.now(timezone.utc).isoformat()})
    except Exception as exc:
        receipt["promotion_error"] = f"{type(exc).__name__}: {str(exc)[:1000]}"
        try:
            runtime.set_dropin(prior_dropin)
            runtime.daemon_reload()
            runtime.restart()
            receipt["rollback_verification"] = runtime.verify_rollback(original_exec, prior_release, original_cwd)
            receipt["status"] = "ROLLED_BACK"
        except Exception as rollback_exc:
            receipt["status"] = "ROLLBACK_FAILED"
            receipt["rollback_error"] = f"{type(rollback_exc).__name__}: {str(rollback_exc)[:1000]}"
        receipt["completed_at"] = datetime.now(timezone.utc).isoformat()
        receipt_root.mkdir(parents=True, exist_ok=True)
        write_json_atomic(receipt_root / f"{receipt_id}.json", receipt)
        raise ReleaseError(json.dumps(receipt, sort_keys=True)) from exc
    receipt_root.mkdir(parents=True, exist_ok=True)
    write_json_atomic(receipt_root / f"{receipt_id}.json", receipt)
    return receipt


def _cli() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    subparsers = parser.add_subparsers(dest="command", required=True)
    prepare = subparsers.add_parser("prepare", help="prepare an immutable Python release from a clean canonical checkout")
    prepare.add_argument("--source", type=Path, required=True)
    prepare.add_argument("--source-sha")
    prepare.add_argument("--artifact-store", type=Path, default=RELEASE_ROOT)
    promote = subparsers.add_parser("promote", help="promote one immutable Python release to the approved systemd service")
    promote.add_argument("--artifact", type=Path, required=True)
    args = parser.parse_args()
    try:
        if args.command == "prepare":
            result = prepare_artifact(args.source, args.artifact_store, source_sha=args.source_sha)
        else:
            result = promote_artifact(args.artifact)
        print(json.dumps(result, sort_keys=True))
        return 0
    except (ReleaseError, OSError, ValueError) as exc:
        print(str(exc), file=sys.stderr)
        return 20


if __name__ == "__main__":
    raise SystemExit(_cli())
