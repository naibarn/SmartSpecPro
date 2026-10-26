#!/usr/bin/env python3
"""Prepare and promote a canonical SmartSpec Web release on Linux systemd.

Use `pnpm run build:canonical` first, then prepare its ledger result with:
  python3 apps/web/scripts/linux_backend_release.py prepare --build-result <result.json>
Production activation is the explicit root action:
  sudo python3 apps/web/scripts/linux_backend_release.py promote --artifact <artifact-dir>
"""

from __future__ import annotations

import argparse
import fcntl
import hashlib
import json
import os
import pwd
import re
import shutil
import stat
import subprocess
import sys
import tempfile
import time
import urllib.error
import urllib.request
import uuid
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Callable, Protocol


SERVICE = "smartspec-web.service"
NODE_WORKER_SERVICE = "smartspec-node-worker.service"
PROCEDURE = "infrastructure.getSpec224DatabaseDiagnostics"
ADMIN_REGISTRATION = "getSpec224DatabaseDiagnostics: exactAdminProcedure"
RELEASE_ROOT = Path("/home/dev/production-releases")
RUNTIME_DATA_ROOT = RELEASE_ROOT / "smartspec-web-data"
CURRENT_LINK = RELEASE_ROOT / "smartspec-web-current"
SYSTEMD_DROPIN = Path("/etc/systemd/system/smartspec-web.service.d/96-canonical-release.conf")
NODE_WORKER_SYSTEMD_DROPIN = Path(
    "/etc/systemd/system/smartspec-node-worker.service.d/95-runtime-artifact.conf"
)
WEB_NODE_SECURITY_DROPIN = Path(
    "/etc/systemd/system/smartspec-web.service.d/95-node-runtime-security.conf"
)
NODE_WORKER_SECURITY_DROPIN = Path(
    "/etc/systemd/system/smartspec-node-worker.service.d/94-node-runtime-security.conf"
)
NODE_EXECUTABLE = Path("/home/dev/.nvm/versions/node/v22.23.4/bin/node")
NODE_VERSION_RE = re.compile(r"^v?(\d+)\.(\d+)\.(\d+)$")


class ReleaseError(RuntimeError):
    pass


def _assert_patched_node_version(version: str, subject: str) -> None:
    match = NODE_VERSION_RE.fullmatch(version)
    if not match:
        raise ReleaseError(f"{subject} did not report a valid Node version: {version}")
    major, minor, patch = (int(part) for part in match.groups())
    if major != 22 or (minor, patch) < (23, 4):
        raise ReleaseError(f"{subject} is using Node {version}; require Node 22.23.4 or newer in Node 22")


def node_executable_evidence(executable: Path = NODE_EXECUTABLE) -> dict[str, str]:
    try:
        result = subprocess.run(
            [str(executable), "--version"], capture_output=True, text=True,
            check=False, timeout=3,
        )
    except (OSError, subprocess.TimeoutExpired) as exc:
        raise ReleaseError(f"Cannot inspect patched Node executable {executable}: {exc}") from exc
    version = result.stdout.strip()
    if result.returncode != 0:
        raise ReleaseError(f"Patched Node executable failed: {executable}: {result.stderr.strip()}")
    _assert_patched_node_version(version, str(executable))
    return {"executable": str(executable.resolve()), "version": version}


def node_runtime_evidence(pid: int, proc_root: Path = Path("/proc")) -> dict[str, str]:
    """Read the exact executable used by a running process and enforce the patched Node 22 floor."""
    process_exe = proc_root / str(pid) / "exe"
    try:
        executable = os.readlink(process_exe)
        result = subprocess.run(
            [str(process_exe), "--version"],
            capture_output=True,
            text=True,
            check=False,
            timeout=3,
        )
    except (OSError, subprocess.TimeoutExpired) as exc:
        raise ReleaseError(f"Cannot inspect Node executable for PID {pid}: {exc}") from exc
    version = result.stdout.strip()
    if result.returncode != 0:
        raise ReleaseError(f"PID {pid} did not report a valid Node version: {version or result.stderr.strip()}")
    _assert_patched_node_version(version, f"PID {pid}")
    if executable.endswith(" (deleted)"):
        raise ReleaseError(f"PID {pid} is running a deleted Node executable: {executable}")
    return {"executable": executable, "version": version}


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as stream:
        for block in iter(lambda: stream.read(1024 * 1024), b""):
            digest.update(block)
    return digest.hexdigest()


def artifact_manifest(root: Path, *, excluded: set[str] | None = None) -> dict[str, Any]:
    rows: list[tuple[str, str, int]] = []
    links: list[tuple[str, str]] = []
    excluded = excluded or set()
    for path in sorted(root.rglob("*")):
        relative = path.relative_to(root).as_posix()
        if path.name in excluded:
            continue
        if path.is_symlink():
            resolved = path.resolve(strict=True)
            if not resolved.is_relative_to(root.resolve()):
                raise ReleaseError(f"Artifact symlink escapes release root: {relative}")
            links.append((relative, os.readlink(path)))
        elif path.is_file():
            rows.append((relative, sha256(path), path.stat().st_size))
    canonical = "\n".join(
        [f"F\0{path}\0{digest}\0{size}" for path, digest, size in rows]
        + [f"L\0{path}\0{target}" for path, target in links]
    )
    return {
        "artifact_digest": f"sha256:{hashlib.sha256(canonical.encode()).hexdigest()}",
        "artifact_file_count": len(rows),
        "artifact_symlink_count": len(links),
    }


def build_artifact_manifest(root: Path) -> dict[str, Any]:
    """Match the canonical build ledger's deterministic regular-file digest."""
    rows: list[tuple[str, str, int]] = []
    for path in sorted(root.rglob("*")):
        if path.is_symlink() or not path.is_file():
            continue
        rows.append((path.relative_to(root).as_posix(), sha256(path), path.stat().st_size))
    canonical = "\n".join(f"{path}\0{digest}\0{size}" for path, digest, size in rows)
    return {
        "artifact_digest": f"sha256:{hashlib.sha256(canonical.encode()).hexdigest()}",
        "artifact_file_count": len(rows),
    }


def write_json_atomic(path: Path, value: dict[str, Any], *, mode: int = 0o644) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    fd, name = tempfile.mkstemp(prefix=f".{path.name}.", dir=path.parent)
    try:
        with os.fdopen(fd, "w", encoding="utf-8") as stream:
            json.dump(value, stream, sort_keys=True)
            stream.write("\n")
            stream.flush()
            os.fsync(stream.fileno())
        os.chmod(name, mode)
        os.replace(name, path)
    finally:
        Path(name).unlink(missing_ok=True)


def validate_procedure_pair(public_root: Path, backend_root: Path) -> None:
    client_calls_procedure = any(
        PROCEDURE.encode() in path.read_bytes()
        for path in public_root.rglob("*")
        if path.is_file() and not path.is_symlink()
    )
    router = backend_root / "server/routers/infrastructure.ts"
    if client_calls_procedure and (
        not router.is_file() or ADMIN_REGISTRATION not in router.read_text(encoding="utf-8")
    ):
        raise ReleaseError(f"Frontend procedure is not registered behind exact-admin guard: {PROCEDURE}")


def canonical_tip(workspace: Path, remote: str, ref: str) -> str:
    git_prefix = ["git", "-c", f"safe.directory={workspace.resolve()}", "-C", str(workspace)]
    if os.geteuid() == 0:
        owner = pwd.getpwuid(workspace.stat().st_uid).pw_name
        command = ["runuser", "-u", owner, "--", "git", "-C", str(workspace)]
    else:
        command = git_prefix
    result = subprocess.run(
        [*command, "ls-remote", "--exit-code", remote, ref],
        capture_output=True,
        text=True,
        check=False,
    )
    if result.returncode:
        raise ReleaseError("Cannot verify current canonical source tip")
    rows = [line.split("\t", 1)[0] for line in result.stdout.splitlines() if "\t" in line]
    if len(rows) != 1:
        raise ReleaseError("Canonical source ref returned an invalid result")
    return rows[0]


def source_advance_is_documentation_only(workspace: Path, source_sha: str, current_sha: str) -> bool:
    """Keep immutable build evidence usable across documentation-only main advances.

    Source identity remains pinned to ``source_sha``. Any executable, config,
    dependency, workflow, asset, or unknown path change makes the old candidate
    ineligible and requires a fresh build.
    """
    if source_sha == current_sha:
        return True
    git = ["git", "-c", f"safe.directory={workspace.resolve()}", "-C", str(workspace)]
    ancestor = subprocess.run(
        [*git, "merge-base", "--is-ancestor", source_sha, current_sha],
        capture_output=True,
        check=False,
    )
    if ancestor.returncode != 0:
        return False
    changed = subprocess.run(
        [*git, "diff", "--name-only", "--no-renames", f"{source_sha}..{current_sha}"],
        capture_output=True,
        text=True,
        check=False,
    )
    if changed.returncode != 0:
        return False
    paths = [Path(line) for line in changed.stdout.splitlines() if line]
    if not paths:
        return False
    documentation_roots = {"docs", "specs", "handoff", "orchestra"}
    for path in paths:
        normalized = path.as_posix()
        if path.suffix.lower() not in {".md", ".mdx", ".rst"}:
            return False
        if len(path.parts) == 1 and path.name.lower() in {"readme.md", "contributing.md", "changelog.md", "security.md"}:
            continue
        if path.parts[0] not in documentation_roots:
            return False
        if normalized.startswith("apps/") or normalized.startswith("packages/") or normalized.startswith("scripts/"):
            return False
    return True


def _is_ancestor(workspace: Path, ancestor_sha: str, descendant_sha: str) -> bool:
    if not re.fullmatch(r"[0-9a-f]{40,64}", ancestor_sha) or not re.fullmatch(r"[0-9a-f]{40,64}", descendant_sha):
        return False
    result = subprocess.run(
        ["git", "-c", f"safe.directory={workspace.resolve()}", "-C", str(workspace),
         "merge-base", "--is-ancestor", ancestor_sha, descendant_sha],
        capture_output=True,
        check=False,
    )
    return result.returncode == 0


def source_candidate_is_eligible(
    workspace: Path,
    source_sha: str,
    current_sha: str,
    release_policy: dict[str, Any] | None = None,
) -> bool:
    """Validate an immutable candidate against canonical history and policy floors.

    After the configured execution-authority floor is present, an explicitly
    policy-enabled immutable candidate remains eligible as main advances. The
    caller still requires exact artifact verification and the existing root
    promotion action; this function does not grant deployment authority.
    """
    policy = release_policy or {}
    required = policy.get("required_source_ancestors", [])
    if not isinstance(required, list) or any(not isinstance(value, str) for value in required):
        return False
    if not all(_is_ancestor(workspace, revision, source_sha) for revision in required):
        return False
    if source_sha == current_sha:
        return True
    if not _is_ancestor(workspace, source_sha, current_sha):
        return False
    if policy.get("allow_approved_immutable_candidates") is True:
        return True
    return source_advance_is_documentation_only(workspace, source_sha, current_sha)


def validate_build_result(
    path: Path, *, verify_artifact_contents: bool = True
) -> tuple[dict[str, Any], Path, Path]:
    try:
        record = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, ValueError) as exc:
        raise ReleaseError("Canonical build ledger record is unreadable") from exc
    artifact = record.get("artifact")
    workspace_value = record.get("isolated_workspace")
    if (
        record.get("status") != "BUILD_PASSED"
        or record.get("source_verified") is not True
        or record.get("canonical_ref") != "refs/heads/main"
        or record.get("source_revision") != record.get("canonical_tip_after_build")
        or not isinstance(artifact, dict)
        or not isinstance(workspace_value, str)
        or not isinstance(artifact.get("artifact_path"), str)
    ):
        raise ReleaseError("Release requires a successful pinned origin/main build record")
    workspace = Path(workspace_value).resolve()
    source_sha = str(record["source_revision"])
    if len(source_sha) not in {40, 64} or any(c not in "0123456789abcdef" for c in source_sha):
        raise ReleaseError("Canonical source SHA is invalid")
    if subprocess.run(
        ["git", "-c", f"safe.directory={workspace}", "-C", str(workspace), "rev-parse", "HEAD"],
        capture_output=True,
        text=True,
        check=True,
    ).stdout.strip() != source_sha:
        raise ReleaseError("Build workspace no longer matches its recorded source SHA")
    dirty = subprocess.run(
        ["git", "-c", f"safe.directory={workspace}", "-C", str(workspace), "status", "--porcelain=v1", "--untracked-files=all", "--",
         ".", ":(exclude)apps/web/dist", ":(exclude)apps/web/dist/**",
         ":(exclude)apps/cloudflare/.staging-artifact", ":(exclude)apps/cloudflare/.staging-artifact/**"],
        capture_output=True,
        text=True,
        check=True,
    ).stdout.strip()
    if dirty:
        raise ReleaseError("Build workspace has source changes outside generated dist")
    import tomllib
    policy = tomllib.loads((workspace / ".development-repository.toml").read_text(encoding="utf-8"))["repository"]
    linux_policy = policy.get("platforms", {}).get("linux", {})
    if not isinstance(linux_policy, dict):
        raise ReleaseError("Configured Linux canonical source policy is invalid")
    policy = {**policy, **linux_policy}
    repository_key = hashlib.sha256(str(policy["repository_id"]).encode()).hexdigest()[:20]
    fallback_roots = policy.get("source_fallback_roots", [])
    if not isinstance(fallback_roots, list):
        raise ReleaseError("Configured canonical fallback roots are invalid")
    configured_roots = [policy["source_root"], *fallback_roots]
    if any(not isinstance(value, str) or not value or not Path(value).expanduser().is_absolute() for value in configured_roots):
        raise ReleaseError("Configured canonical source roots must be absolute paths")
    # Match the canonical builder's approved storage roots. The workspace and
    # its ledger must share ONE configured root; mixing two roots is not valid
    # evidence, even when each individual path appears on the allowlist.
    if not any(
        workspace.is_relative_to(source_root) and path.resolve().is_relative_to(
            source_root / ".development-build-results" / repository_key
        )
        for source_root in (Path(value).expanduser().resolve() for value in configured_roots)
    ):
        raise ReleaseError("Build evidence is outside the configured canonical source/artifact authority")
    root = Path(artifact["artifact_path"]).resolve()
    if root != (workspace / "apps/web/dist").resolve() or not root.is_dir():
        raise ReleaseError("Canonical artifact path is outside the pinned source workspace")
    backend = root / "backend-runtime"
    public = root / "public"
    if verify_artifact_contents:
        actual = build_artifact_manifest(root)
        if actual != {key: artifact.get(key) for key in actual}:
            raise ReleaseError("Canonical build artifact digest does not match the ledger")
        if not (backend / "server/_core/index.ts").is_file() or not (public / "index.html").is_file():
            raise ReleaseError("Build artifact is missing frontend or backend runtime files")
        metadata_path = backend / "release-build.json"
        try:
            metadata = json.loads(metadata_path.read_text(encoding="utf-8"))
        except (OSError, ValueError) as exc:
            raise ReleaseError("Backend artifact source metadata is missing") from exc
        if any(metadata.get(key) != source_sha for key in ("sourceSha", "frontendSourceSha", "backendSourceSha")):
            raise ReleaseError("Frontend and backend artifact revisions are incompatible")
        if not (backend / "node_modules/tsx/package.json").is_file():
            raise ReleaseError("Backend artifact does not contain its production TypeScript runtime")
        validate_procedure_pair(public, backend)
    return record, root, workspace


def _freeze(root: Path) -> None:
    for path in sorted(root.rglob("*"), reverse=True):
        if path.is_symlink():
            continue
        if path.is_dir() or path.is_file():
            mode = stat.S_IMODE(path.stat().st_mode)
            path.chmod(mode & ~0o222)
    mode = stat.S_IMODE(root.stat().st_mode)
    root.chmod(mode & ~0o222)


def prepare_artifact(build_result_path: Path, artifact_store: Path) -> dict[str, Any]:
    record, source_root, workspace = validate_build_result(build_result_path)
    source_sha = str(record["source_revision"])
    policy_path = workspace / ".development-repository.toml"
    if not policy_path.is_file():
        raise ReleaseError("Pinned build workspace is missing repository release policy")
    import tomllib
    policy = tomllib.loads(policy_path.read_text(encoding="utf-8"))["repository"]
    release_policy = policy.get("release", {})
    current_sha = canonical_tip(workspace, str(policy["remote"]), str(policy["canonical_ref"]))
    if not source_candidate_is_eligible(workspace, source_sha, current_sha, release_policy):
        raise ReleaseError("Release candidate is not eligible: canonical ancestry or required security-floor policy failed")
    source_tree = subprocess.run(
        ["git", "-c", f"safe.directory={workspace.resolve()}", "-C", str(workspace), "rev-parse", f"{source_sha}^{{tree}}"],
        capture_output=True,
        text=True,
        check=True,
    ).stdout.strip()

    release_digest = artifact_manifest(source_root)
    release_id = f"smartspec-web-{source_sha}-{release_digest['artifact_digest'][7:19]}"
    manifest = {
        "schemaVersion": 1,
        "releaseId": release_id,
        "sourceSha": source_sha,
        "frontendSourceSha": source_sha,
        "backendSourceSha": source_sha,
        "canonicalRef": "refs/heads/main",
        "canonicalBuildResult": str(build_result_path.resolve()),
        "canonicalBuildArtifactDigest": record["artifact"]["artifact_digest"],
        "sourceTreeSha": source_tree,
        "sourceDependencyDigest": hashlib.sha256(
            f"{source_tree}\0{record['artifact']['artifact_digest']}".encode("utf-8")
        ).hexdigest(),
        "canonicalTipAtPreparation": current_sha,
        "documentationOnlyAdvance": current_sha != source_sha,
        "immutableCandidateAllowedByPolicy": current_sha != source_sha and release_policy.get("allow_approved_immutable_candidates") is True,
        "requiredSourceAncestors": release_policy.get("required_source_ancestors", []),
        "releaseFreshnessPolicy": "explicit_immutable_candidate_with_required_ancestors" if release_policy.get("allow_approved_immutable_candidates") is True else "documentation_only_advance",
        "releaseArtifactDigest": release_digest["artifact_digest"],
        "releaseArtifactFileCount": release_digest["artifact_file_count"],
        "releaseArtifactSymlinkCount": release_digest["artifact_symlink_count"],
        "publicArtifactDigest": build_artifact_manifest(source_root / "public")["artifact_digest"],
        "createdAt": datetime.now(timezone.utc).isoformat(),
    }
    artifact_store.mkdir(parents=True, exist_ok=True)
    target = artifact_store / release_id
    lock_path = artifact_store / ".artifact-publish.lock"
    with lock_path.open("a+") as lock:
        fcntl.flock(lock, fcntl.LOCK_EX)
        if target.exists():
            existing = validate_published_artifact(target)
            if existing.get("releaseArtifactDigest") != release_digest["artifact_digest"]:
                raise ReleaseError("Immutable artifact ID already exists with different contents")
            return {"status": "ARTIFACT_READY", "release_id": release_id, "artifact_path": str(target), "manifest": existing}
        staging = artifact_store / f".{release_id}.{uuid.uuid4().hex}.tmp"
        try:
            shutil.copytree(source_root, staging, symlinks=True)
            write_json_atomic(staging / "release-manifest.json", manifest, mode=0o444)
            _freeze(staging)
            os.replace(staging, target)
        finally:
            if staging.exists():
                shutil.rmtree(staging)
    return {"status": "ARTIFACT_READY", "release_id": release_id, "artifact_path": str(target), "manifest": manifest}


def validate_published_artifact(artifact_path: Path) -> dict[str, Any]:
    manifest_path = artifact_path / "release-manifest.json"
    try:
        manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
    except (OSError, ValueError) as exc:
        raise ReleaseError("Immutable release artifact manifest is unavailable") from exc
    actual = artifact_manifest(artifact_path, excluded={"release-manifest.json"})
    if actual["artifact_digest"] != manifest.get("releaseArtifactDigest"):
        raise ReleaseError("Immutable release artifact digest mismatch")
    if manifest.get("frontendSourceSha") != manifest.get("backendSourceSha"):
        raise ReleaseError("Frontend/backend release revisions do not match")
    source_sha = manifest.get("sourceSha")
    if not isinstance(source_sha, str) or len(source_sha) not in {40, 64} or any(c not in "0123456789abcdef" for c in source_sha):
        raise ReleaseError("Release source SHA is invalid")
    if manifest.get("canonicalRef") != "refs/heads/main":
        raise ReleaseError("Release is not pinned to origin/main")
    expected_id = f"smartspec-web-{source_sha}-{str(manifest.get('releaseArtifactDigest', ''))[7:19]}"
    if manifest.get("releaseId") != expected_id:
        raise ReleaseError("Release artifact ID is not bound to its source revision and digest")
    backend = artifact_path / "backend-runtime"
    public = artifact_path / "public"
    if not (backend / "server/_core/index.ts").is_file() or not (public / "index.html").is_file():
        raise ReleaseError("Published artifact is missing frontend or backend runtime files")
    try:
        metadata = json.loads((backend / "release-build.json").read_text(encoding="utf-8"))
    except (OSError, ValueError) as exc:
        raise ReleaseError("Published backend source metadata is missing") from exc
    if any(metadata.get(key) != source_sha for key in ("sourceSha", "frontendSourceSha", "backendSourceSha")):
        raise ReleaseError("Published frontend and backend revisions do not match")
    if not (backend / "node_modules/tsx/package.json").is_file():
        raise ReleaseError("Published backend is missing its production TypeScript runtime")
    validate_procedure_pair(public, backend)
    return manifest


class Runtime(Protocol):
    def assert_supported_target(self) -> None: ...
    def daemon_reload(self) -> None: ...
    def restart(self) -> None: ...
    def verify(self, release_path: Path, source_sha: str) -> dict[str, Any]: ...
    def verify_rollback(self, previous_working_directory: str, previous_node_worker_directory: str) -> dict[str, Any]: ...
    def working_directory(self) -> str: ...
    def node_worker_working_directory(self) -> str: ...


class SystemdRuntime:
    def __init__(self, service: str = SERVICE, *, timeout: int = 60):
        if service != SERVICE:
            raise ReleaseError("Only the approved smartspec-web.service target is supported")
        self.service, self.timeout = service, timeout

    def _run(self, *args: str) -> str:
        result = subprocess.run(["systemctl", *args], capture_output=True, text=True, check=False)
        if result.returncode:
            raise ReleaseError(f"systemctl {' '.join(args)} failed: {result.stderr.strip()}")
        return result.stdout.strip()

    def daemon_reload(self) -> None:
        self._run("daemon-reload")

    def assert_supported_target(self) -> None:
        if self._run("show", self.service, "--property=ActiveState", "--value") != "active":
            raise ReleaseError("smartspec-web.service must be active before promotion")
        if self._run("show", self.service, "--property=User", "--value") != "dev":
            raise ReleaseError("smartspec-web.service owner differs from the approved Linux runtime")
        node_executable_evidence()
        exec_start = self._run("show", self.service, "--property=ExecStart", "--value")
        if "--import tsx" not in exec_start or "server/_core/index.ts" not in exec_start:
            raise ReleaseError("smartspec-web.service entrypoint differs from the approved Node runtime")
        if self._run("show", NODE_WORKER_SERVICE, "--property=ActiveState", "--value") != "active":
            raise ReleaseError(f"{NODE_WORKER_SERVICE} must be active before promotion")
        if self._run("show", NODE_WORKER_SERVICE, "--property=User", "--value") != "dev":
            raise ReleaseError(f"{NODE_WORKER_SERVICE} owner differs from the approved Linux runtime")
        worker_exec = self._run("show", NODE_WORKER_SERVICE, "--property=ExecStart", "--value")
        if "--import tsx" not in worker_exec or "server/jobs/postgresNodeJobWorker.ts" not in worker_exec:
            raise ReleaseError(f"{NODE_WORKER_SERVICE} entrypoint differs from the approved Node runtime")
        service_cgroup = self._run("show", self.service, "--property=ControlGroup", "--value")
        listeners = subprocess.run(
            ["ss", "-H", "-ltnp", "sport = :3000"],
            capture_output=True,
            text=True,
            check=False,
        )
        if listeners.returncode:
            raise ReleaseError("Cannot verify port 3000 ownership before service restart")
        validate_listener_ownership(
            listeners.stdout,
            service_cgroup,
            lambda pid: Path(f"/proc/{pid}/cgroup").read_text(encoding="utf-8"),
        )

    def restart(self) -> None:
        self._run("restart", self.service, NODE_WORKER_SERVICE)

    def working_directory(self) -> str:
        return self._run("show", self.service, "--property=WorkingDirectory", "--value")

    def node_worker_working_directory(self) -> str:
        return self._run("show", NODE_WORKER_SERVICE, "--property=WorkingDirectory", "--value")

    def _main_pid(self) -> int:
        return int(self._run("show", self.service, "--property=MainPID", "--value"))

    def verify(self, release_path: Path, source_sha: str) -> dict[str, Any]:
        deadline = time.monotonic() + self.timeout
        last_error = "service_not_ready"
        while time.monotonic() < deadline:
            try:
                if self._run("is-active", self.service) != "active":
                    raise ReleaseError("systemd service is not active")
                pid = self._main_pid()
                node_runtime = node_runtime_evidence(pid)
                process_cwd = Path(f"/proc/{pid}/cwd").resolve(strict=True)
                if process_cwd != release_path.resolve():
                    raise ReleaseError("serving process cwd does not match promoted release")
                environ = Path(f"/proc/{pid}/environ").read_bytes().split(b"\0")
                runtime_release = next((item.split(b"=", 1)[1].decode() for item in environ if item.startswith(b"RELEASE=")), None)
                if runtime_release != source_sha:
                    raise ReleaseError("serving process RELEASE value does not match promoted revision")
                with urllib.request.urlopen("http://127.0.0.1:3000/healthz", timeout=2) as response:
                    if response.status != 200:
                        raise ReleaseError("health endpoint did not return HTTP 200")
                request = urllib.request.Request(
                    "http://127.0.0.1:3000/trpc/" + PROCEDURE + "?input=%7B%22json%22%3Anull%7D"
                )
                try:
                    with urllib.request.urlopen(request, timeout=3) as response:
                        route_status = response.status
                except urllib.error.HTTPError as exc:
                    route_status = exc.code
                if route_status not in {401, 403}:
                    raise ReleaseError(f"Admin diagnostics route did not deny anonymous access (HTTP {route_status})")
                worker = self._verify_node_worker(release_path, source_sha)
                return {
                    "status": "HEALTHY",
                    "service": self.service,
                    "pid": pid,
                    "nodeRuntime": node_runtime,
                    "workingDirectory": str(process_cwd),
                    "runtimeRevision": runtime_release,
                    "healthHttp": 200,
                    "anonymousDiagnosticsHttp": route_status,
                    "nodeWorker": worker,
                }
            except (OSError, ValueError, urllib.error.URLError, ReleaseError) as exc:
                last_error = str(exc)
                time.sleep(1)
        raise ReleaseError(f"Promotion health check timed out: {last_error}")

    def _verify_node_worker(self, release_path: Path, source_sha: str) -> dict[str, Any]:
        if self._run("is-active", NODE_WORKER_SERVICE) != "active":
            raise ReleaseError(f"{NODE_WORKER_SERVICE} is not active")
        pid = int(self._run("show", NODE_WORKER_SERVICE, "--property=MainPID", "--value"))
        node_runtime = node_runtime_evidence(pid)
        process_cwd = Path(f"/proc/{pid}/cwd").resolve(strict=True)
        if process_cwd != release_path.resolve():
            raise ReleaseError(f"{NODE_WORKER_SERVICE} cwd does not match promoted release")
        environ = Path(f"/proc/{pid}/environ").read_bytes().split(b"\0")
        values = {
            item.split(b"=", 1)[0].decode(): item.split(b"=", 1)[1].decode()
            for item in environ
            if b"=" in item
        }
        if values.get("RELEASE") != source_sha:
            raise ReleaseError(f"{NODE_WORKER_SERVICE} revision does not match promoted release")
        heartbeat = Path(values.get("FEATURE_186_NODE_WORKER_HEARTBEAT_FILE", ""))
        if not heartbeat.is_file():
            raise ReleaseError(f"{NODE_WORKER_SERVICE} heartbeat is missing")
        fields = heartbeat.read_text(encoding="utf-8").strip().split("\t")
        if len(fields) != 3 or fields[2] != str(pid):
            raise ReleaseError(f"{NODE_WORKER_SERVICE} heartbeat does not match its process")
        if time.time() - int(fields[0]) / 1000 > 30:
            raise ReleaseError(f"{NODE_WORKER_SERVICE} heartbeat is stale")
        return {"service": NODE_WORKER_SERVICE, "pid": pid, "nodeRuntime": node_runtime, "workingDirectory": str(process_cwd), "runtimeRevision": source_sha}

    def verify_rollback(
        self,
        previous_working_directory: str,
        previous_node_worker_directory: str,
    ) -> dict[str, Any]:
        deadline = time.monotonic() + self.timeout
        while time.monotonic() < deadline:
            try:
                if self._run("is-active", self.service) == "active":
                    pid = self._main_pid()
                    node_runtime = node_runtime_evidence(pid)
                    process_cwd = Path(f"/proc/{pid}/cwd").resolve(strict=True)
                    expected_cwd = Path(previous_working_directory).resolve(strict=False)
                    if process_cwd != expected_cwd:
                        raise ReleaseError("rollback process cwd does not match the previous runtime")
                    worker_pid = int(self._run("show", NODE_WORKER_SERVICE, "--property=MainPID", "--value"))
                    worker_node_runtime = node_runtime_evidence(worker_pid)
                    worker_cwd = Path(f"/proc/{worker_pid}/cwd").resolve(strict=True)
                    expected_worker_cwd = Path(previous_node_worker_directory).resolve(strict=False)
                    if worker_cwd != expected_worker_cwd:
                        raise ReleaseError("rollback Node worker cwd does not match the previous runtime")
                    with urllib.request.urlopen("http://127.0.0.1:3000/healthz", timeout=2) as response:
                        if response.status == 200:
                            return {
                                "status": "ROLLED_BACK_HEALTHY",
                                "nodeRuntime": node_runtime,
                                "workingDirectory": str(process_cwd),
                                "nodeWorkerRuntime": worker_node_runtime,
                                "nodeWorkerWorkingDirectory": str(worker_cwd),
                            }
            except (OSError, ValueError, urllib.error.URLError, ReleaseError):
                pass
            time.sleep(1)
        raise ReleaseError("Rollback service health check failed")


def atomic_symlink(target: Path, link: Path) -> None:
    link.parent.mkdir(parents=True, exist_ok=True)
    temporary = link.with_name(f".{link.name}.{uuid.uuid4().hex}.tmp")
    try:
        temporary.symlink_to(target, target_is_directory=True)
        os.replace(temporary, link)
    finally:
        temporary.unlink(missing_ok=True)


def _atomic_write_text(path: Path, content: str, *, mode: int = 0o644) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    fd, name = tempfile.mkstemp(prefix=f".{path.name}.", dir=path.parent)
    try:
        with os.fdopen(fd, "w", encoding="utf-8") as stream:
            stream.write(content)
            stream.flush()
            os.fsync(stream.fileno())
        os.chmod(name, mode)
        os.replace(name, path)
    finally:
        Path(name).unlink(missing_ok=True)


def _make_readonly(root: Path) -> None:
    # Promotion runs as root, while the services run as dev. A caller's private
    # umask must not produce root-only code after copytree preserves its modes.
    # Only validated immutable code is normalized; mutable data symlinks stay as-is.
    for path in sorted(root.rglob("*"), reverse=True):
        if path.is_symlink():
            continue
        if path.is_dir() or path.is_file():
            mode = stat.S_IMODE(path.stat().st_mode)
            path.chmod(0o555 if path.is_dir() or mode & 0o111 else 0o444)
    root.chmod(0o555)


def _prepare_runtime_data(
    staging: Path,
    previous_working_directory: str,
    runtime_data_root: Path,
) -> dict[str, str]:
    """Keep runtime writes outside immutable versioned code directories.

    Existing writable paths remain the source of truth. New paths use the
    release authority's stable data directory, so later promotions reuse them.
    """
    previous = Path(previous_working_directory).resolve(strict=False)
    runtime_data_root.mkdir(parents=True, exist_ok=True)
    mappings: dict[str, str] = {}
    for name in ("data", "logs", "media_storage", "tmp", "uploads", "workspace"):
        packaged_path = staging / name
        if packaged_path.exists() or packaged_path.is_symlink():
            raise ReleaseError(f"Backend artifact unexpectedly contains mutable runtime path: {name}")

        stable_path = runtime_data_root / name
        previous_path = previous / name
        if stable_path.is_symlink():
            raise ReleaseError(f"Persistent runtime data path must not be a symlink: {stable_path}")
        if previous_path.is_dir():
            data_target = previous_path.resolve()
        else:
            if not stable_path.exists():
                stable_path.mkdir(parents=True, exist_ok=True, mode=0o750)
                try:
                    account = pwd.getpwnam("dev")
                    os.chown(stable_path, account.pw_uid, account.pw_gid)
                except KeyError:
                    pass
            data_target = stable_path
        if not data_target.is_dir():
            raise ReleaseError(f"Persistent runtime data path is not a directory: {stable_path}")
        packaged_path.symlink_to(data_target, target_is_directory=True)
        mappings[name] = str(data_target.resolve())

    logs = runtime_data_root / "logs"
    for filename in ("server-debug.log", "automation-start-trace.log"):
        target = staging / filename
        if target.exists() or target.is_symlink():
            raise ReleaseError(f"Backend artifact unexpectedly contains mutable runtime file: {filename}")
        target_path = logs / filename
        if not logs.exists():
            logs.mkdir(parents=True, exist_ok=True)
        target.symlink_to(target_path)
        mappings[filename] = str(target_path.resolve(strict=False))
    return mappings


def _make_writable(root: Path) -> None:
    if not root.exists():
        return
    for path in root.rglob("*"):
        if path.is_symlink():
            continue
        if path.is_dir():
            path.chmod(path.stat().st_mode | 0o700)
        elif path.is_file():
            path.chmod(path.stat().st_mode | 0o200)
    root.chmod(root.stat().st_mode | 0o700)


def _restore_link(link: Path, prior_target: str | None) -> None:
    if prior_target is None:
        link.unlink(missing_ok=True)
    else:
        atomic_symlink(Path(prior_target), link)


def _next_generation(
    receipt_root: Path,
    service: str,
    additional_roots: tuple[Path, ...] = (),
    *,
    release_root: Path | None = None,
) -> int:
    values = []
    for root in {receipt_root, *additional_roots}:
        for path in (root / "production-deployments").glob("*.json"):
            try:
                item = json.loads(path.read_text(encoding="utf-8"))
                if item.get("service") == service:
                    values.append(int(item.get("generation", 0)))
            except (OSError, ValueError, TypeError):
                continue
    # Installed releases survive removal or relocation of the build ledgers.
    # Keep their verified directory/manifest generations as a durable floor.
    if service == SERVICE and release_root is not None:
        for path in release_root.iterdir():
            if path.is_symlink() or not path.is_dir() or os.path.ismount(path):
                continue
            match = re.fullmatch(r"(?P<release_id>smartspec-web-.+)-g(?P<generation>\d+)", path.name)
            manifest_path = path / "release-manifest.json"
            if match is None or manifest_path.is_symlink():
                continue
            try:
                item = json.loads(manifest_path.read_text(encoding="utf-8"))
                generation = int(item["generation"])
                if (
                    item.get("release_mode") == "linux_systemd_fullstack"
                    and item.get("release_id") == match.group("release_id")
                    and generation == int(match.group("generation"))
                ):
                    values.append(generation)
            except (OSError, ValueError, KeyError, TypeError):
                continue
    return max(values, default=0) + 1


def prune_old_releases(
    release_root: Path,
    current_link: Path,
    *,
    keep_previous: int = 2,
) -> dict[str, Any]:
    """Keep the active release and two newest verified predecessors."""
    if keep_previous < 0:
        raise ValueError("keep_previous cannot be negative")

    root = release_root.resolve()
    try:
        current = current_link.resolve(strict=True)
    except OSError:
        return {"status": "SKIPPED_CURRENT_UNAVAILABLE", "removed": [], "kept": []}
    if current.parent != root:
        return {"status": "SKIPPED_CURRENT_OUTSIDE_RELEASE_ROOT", "removed": [], "kept": []}

    verified: list[tuple[int, Path]] = []
    skipped: list[dict[str, str]] = []
    for path in root.iterdir():
        if path.is_symlink() or not path.is_dir() or os.path.ismount(path):
            continue
        match = re.fullmatch(r"(?P<release_id>.+)-g(?P<generation>\d+)", path.name)
        if match is None:
            continue
        try:
            manifest = json.loads((path / "release-manifest.json").read_text(encoding="utf-8"))
            generation = int(manifest["generation"])
            if (
                manifest.get("release_id") != match.group("release_id")
                or generation != int(match.group("generation"))
            ):
                raise ValueError("release manifest does not match its directory name")
        except (OSError, ValueError, KeyError, TypeError) as exc:
            skipped.append({"release": path.name, "reason": f"invalid_manifest: {exc}"})
            continue
        verified.append((generation, path))

    if current not in {path for _, path in verified}:
        return {
            "status": "SKIPPED_CURRENT_UNVERIFIED",
            "removed": [],
            "kept": [],
            "skipped": skipped,
        }

    previous = sorted(
        ((generation, path) for generation, path in verified if path != current),
        key=lambda item: item[0],
        reverse=True,
    )
    keep = {current, *(path for _, path in previous[:keep_previous])}
    remove = [path for _, path in verified if path not in keep]

    for path in remove:
        for proc in Path("/proc").glob("[0-9]*/cwd"):
            try:
                cwd = Path(os.path.realpath(proc))
            except OSError:
                continue
            if cwd == path or path in cwd.parents:
                return {
                    "status": "SKIPPED_RELEASE_IN_USE",
                    "removed": [],
                    "kept": sorted(p.name for p in keep | set(remove)),
                    "skipped": [*skipped, {"release": path.name, "reason": "process_working_directory"}],
                }

    removed: list[str] = []
    for path in remove:
        try:
            shutil.rmtree(path)
            removed.append(path.name)
        except OSError as exc:
            skipped.append({"release": path.name, "reason": f"remove_failed: {exc}"})

    return {
        "status": "PRUNED" if not skipped else "PARTIAL",
        "keep_previous": keep_previous,
        "kept": sorted(p.name for p in keep),
        "removed": removed,
        "skipped": skipped,
    }


def _release_retention_result(release_root: Path, current_link: Path) -> dict[str, Any]:
    try:
        return prune_old_releases(release_root, current_link)
    except Exception as exc:
        return {"status": "FAILED", "removed": [], "kept": [], "error": str(exc)}


def _record_stale_release_attempt(
    receipt_root: Path,
    manifest: dict[str, Any],
    observed_tip: str,
) -> Path:
    """Persist why a pinned release could not be promoted after main advanced."""
    attempts = receipt_root / "production-release-attempts"
    stamp = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%S.%fZ")
    source_sha = str(manifest.get("sourceSha", "unknown"))
    path = attempts / f"{stamp}-{source_sha[:12]}-stale-{uuid.uuid4().hex[:8]}.json"
    write_json_atomic(path, {
        "status": "BLOCKED_STALE_SOURCE",
        "service": SERVICE,
        "release_id": manifest.get("releaseId"),
        "source_revision": source_sha,
        "observed_canonical_revision": observed_tip,
        "artifact_digest": manifest.get("releaseArtifactDigest"),
        "artifact_path": str(manifest.get("artifactPath", "")),
        "canonical_ref": manifest.get("canonicalRef"),
        "created_at": datetime.now(timezone.utc).isoformat(),
        "next_action": "Rebuild from the current origin/main tip and prepare a new immutable artifact.",
    })
    return path


def validate_listener_ownership(
    ss_output: str,
    service_cgroup: str,
    read_cgroup: Callable[[int], str],
) -> None:
    pids = {int(value) for value in re.findall(r"pid=(\d+)", ss_output)}
    if not pids:
        raise ReleaseError("smartspec-web.service has no identifiable listener on port 3000")
    for pid in pids:
        groups = read_cgroup(pid).splitlines()
        if not any(
            line.rsplit(":", 1)[-1] == service_cgroup
            or line.rsplit(":", 1)[-1].startswith(service_cgroup.rstrip("/") + "/")
            for line in groups
        ):
            raise ReleaseError(f"Port 3000 is also owned by a process outside {SERVICE}: pid={pid}")


def promote_artifact(
    artifact_path: Path,
    *,
    release_root: Path,
    dropin_path: Path,
    current_link: Path,
    lock_path: Path,
    receipt_root: Path,
    runtime_data_root: Path,
    runtime: Runtime,
    current_tip: Callable[[dict[str, Any]], str],
    node_worker_dropin_path: Path = NODE_WORKER_SYSTEMD_DROPIN,
    node_security_dropin_path: Path = WEB_NODE_SECURITY_DROPIN,
    node_worker_security_dropin_path: Path = NODE_WORKER_SECURITY_DROPIN,
    require_root: bool = True,
) -> dict[str, Any]:
    if require_root and os.geteuid() != 0:
        raise ReleaseError("Production promotion requires explicit root authorization via sudo")
    if current_link.exists() and not current_link.is_symlink():
        raise ReleaseError("Current release pointer exists but is not a symlink")
    runtime.assert_supported_target()
    manifest = validate_published_artifact(artifact_path)
    source_sha = manifest["sourceSha"]
    build_path = Path(manifest["canonicalBuildResult"])
    build, _, workspace = validate_build_result(
        build_path, verify_artifact_contents=False
    )
    import tomllib
    source_policy = tomllib.loads((workspace / ".development-repository.toml").read_text(encoding="utf-8"))["repository"]
    release_policy = source_policy.get("release", {})
    observed_tip = current_tip(manifest)
    if not source_candidate_is_eligible(workspace, source_sha, observed_tip, release_policy):
        _record_stale_release_attempt(receipt_root, {**manifest, "artifactPath": str(artifact_path)}, observed_tip)
        raise ReleaseError("Release candidate rejected: canonical ancestry or required security-floor policy failed")
    if build.get("source_revision") != source_sha:
        raise ReleaseError("Release manifest does not match canonical build evidence")
    if build["artifact"].get("artifact_digest") != manifest.get("canonicalBuildArtifactDigest"):
        raise ReleaseError("Release manifest does not match the canonical artifact ledger digest")
    # `prepare_artifact` validated the complete canonical build tree and bound
    # its digest into this immutable artifact's release manifest before the
    # copy was published. The build workspace can later lose temporary pnpm
    # virtual-store targets, so promotion verifies the published artifact's
    # own digest plus the pinned build receipt above instead of re-reading that
    # mutable workspace tree here.

    release_id = manifest["releaseId"]
    release_root.mkdir(parents=True, exist_ok=True)
    lock_path.parent.mkdir(parents=True, exist_ok=True)
    with lock_path.open("a+") as lock:
        fcntl.flock(lock, fcntl.LOCK_EX)
        observed_tip = current_tip(manifest)
        if not source_candidate_is_eligible(workspace, source_sha, observed_tip, release_policy):
            _record_stale_release_attempt(receipt_root, {**manifest, "artifactPath": str(artifact_path)}, observed_tip)
            raise ReleaseError("Release candidate rejected while waiting for deployment fence")
        if current_link.is_symlink():
            active_target = current_link.resolve()
            try:
                active_manifest = json.loads((active_target / "release-manifest.json").read_text(encoding="utf-8"))
                if active_manifest.get("release_id") == release_id and active_manifest.get("source_revision") == source_sha:
                    runtime_result = runtime.verify(active_target, source_sha)
                    retention = _release_retention_result(release_root, current_link)
                    return {
                        "status": "ALREADY_PROMOTED",
                        "release_id": release_id,
                        "source_sha": source_sha,
                        "runtime": runtime_result,
                        "release_retention": retention,
                    }
            except (OSError, ValueError, ReleaseError):
                pass
        # The promotion lock remains in the shared lease root. Storage failover
        # must also preserve the service's monotonically increasing fence by
        # reading receipts from every policy-approved source ledger.
        import tomllib
        policy = tomllib.loads((workspace / ".development-repository.toml").read_text(encoding="utf-8"))["repository"]
        policy = {**policy, **policy.get("platforms", {}).get("linux", {})}
        repository_key = hashlib.sha256(str(policy["repository_id"]).encode()).hexdigest()[:20]
        approved_ledgers = tuple(
            Path(root).expanduser().resolve() / ".development-build-results" / repository_key
            for root in [policy["source_root"], *policy.get("source_fallback_roots", [])]
        )
        generation = _next_generation(receipt_root, SERVICE, approved_ledgers, release_root=release_root)
        target = release_root / f"{release_id}-g{generation}"
        if not target.exists():
            staging = release_root / f".{release_id}-g{generation}.{uuid.uuid4().hex}.tmp"
            try:
                shutil.copytree(artifact_path / "backend-runtime", staging, symlinks=True)
                _make_writable(staging)
                previous_working_directory = runtime.working_directory()
                runtime_data_mappings = _prepare_runtime_data(
                    staging, previous_working_directory, runtime_data_root
                )
                index_path = staging / "dist/public/index.html"
                public_digest = build_artifact_manifest(staging / "dist/public")
                release_status = {
                    "release_id": release_id,
                    "source_revision": source_sha,
                    "frontend_source_revision": manifest["frontendSourceSha"],
                    "backend_source_revision": manifest["backendSourceSha"],
                    "canonical_ref": manifest["canonicalRef"],
                    "artifact_digest": manifest["canonicalBuildArtifactDigest"],
                    "artifact_file_count": build["artifact"]["artifact_file_count"],
                    "build_public_artifact_digest": manifest["publicArtifactDigest"],
                    "public_artifact_digest": public_digest["artifact_digest"],
                    "public_file_count": public_digest["artifact_file_count"],
                    "index_sha256": sha256(index_path),
                    "generation": generation,
                    "deployed_at": datetime.now(timezone.utc).isoformat(),
                    "release_mode": "linux_systemd_fullstack",
                    "runtime_data_paths": runtime_data_mappings,
                }
                write_json_atomic(staging / "release-manifest.json", release_status, mode=0o444)
                write_json_atomic(staging / "dist/public/release-manifest.json", release_status, mode=0o444)
                _make_readonly(staging)
                os.replace(staging, target)
            finally:
                if staging.exists():
                    _make_writable(staging)
                    shutil.rmtree(staging)
        else:
            installed_manifest = json.loads((target / "release-manifest.json").read_text(encoding="utf-8"))
            if installed_manifest.get("artifact_digest") != manifest["canonicalBuildArtifactDigest"]:
                raise ReleaseError("Versioned runtime path already contains a different artifact")

        previous_link = os.readlink(current_link) if current_link.is_symlink() else None
        previous_working_directory = runtime.working_directory()
        previous_dropin = dropin_path.read_text(encoding="utf-8") if dropin_path.exists() else None
        previous_node_worker_directory = runtime.node_worker_working_directory()
        previous_node_worker_dropin = (
            node_worker_dropin_path.read_text(encoding="utf-8")
            if node_worker_dropin_path.exists()
            else None
        )
        policy_path = workspace / ".development-repository.toml"
        import tomllib
        config = tomllib.loads(policy_path.read_text(encoding="utf-8"))["repository"]
        repository_key = hashlib.sha256(config["repository_id"].encode()).hexdigest()[:20]
        shared_state = Path(config["lease_root"]).expanduser() / repository_key
        current_status_path = shared_state / "production-release.json"
        previous_status = current_status_path.read_bytes() if current_status_path.exists() else None
        receipt_path = receipt_root / "production-deployments" / f"{release_id}-{generation}.json"
        dropin = (
            "[Service]\n"
            f"WorkingDirectory={current_link}\n"
            f"Environment=RELEASE={source_sha}\n"
        )
        node_worker_dropin = (
            "[Service]\n"
            f"WorkingDirectory={current_link}\n"
            f"Environment=RELEASE={source_sha}\n"
        )
        node_executable = str(NODE_EXECUTABLE)
        web_node_security_dropin = (
            "[Service]\n"
            f"Environment=PATH={NODE_EXECUTABLE.parent}:/usr/local/bin:/usr/bin:/bin\n"
            "ExecStartPre=\n"
            "ExecStartPre=/bin/bash -lc 'pids=$(ss -H -ltnp \"sport = :3000\" 2>/dev/null | sed -n \"s/.*pid=\\\\([0-9]\\\\+\\\\).*/\\\\1/p\" | sort -u); if [ -n \"$pids\" ]; then echo \"Stopping stale process(es) on port 3000: $pids\"; kill $pids 2>/dev/null || true; sleep 2; for pid in $pids; do kill -0 $pid 2>/dev/null && kill -9 $pid 2>/dev/null || true; done; fi'\n"
            "ExecStartPre=/bin/bash -lc 'for i in $(seq 1 20); do ss -H -ltn \"sport = :3000\" 2>/dev/null | grep -q . || exit 0; sleep 0.5; done; echo \"FATAL: port 3000 still in use after 10s\"; exit 1'\n"
            f"ExecStartPre={node_executable} /home/dev/projects/SmartSpecPro/scripts/check-node-version.mjs\n"
            "ExecStart=\n"
            f"ExecStart={node_executable} --import tsx server/_core/index.ts\n"
        )
        node_worker_security_dropin = (
            "[Service]\n"
            f"Environment=PATH={NODE_EXECUTABLE.parent}:/usr/local/bin:/usr/bin:/bin\n"
            "ExecStartPre=\n"
            f"ExecStartPre={node_executable} /home/dev/projects/SmartSpecPro/scripts/check-node-version.mjs\n"
            "ExecStart=\n"
            f"ExecStart={node_executable} --import tsx server/jobs/postgresNodeJobWorker.ts\n"
        )
        activation_started = False
        try:
            _atomic_write_text(dropin_path, dropin)
            _atomic_write_text(node_worker_dropin_path, node_worker_dropin)
            # Keep the Node security overrides through application rollback: the
            # app artifact can roll back while the runtime patch remains active.
            _atomic_write_text(node_security_dropin_path, web_node_security_dropin)
            _atomic_write_text(node_worker_security_dropin_path, node_worker_security_dropin)
            runtime.daemon_reload()
            atomic_symlink(target, current_link)
            activation_started = True
            runtime.restart()
            health = runtime.verify(target, source_sha)
            activation_tip = current_tip(manifest)
            if not source_candidate_is_eligible(workspace, source_sha, activation_tip, release_policy):
                raise ReleaseError("Release candidate rejected because canonical ancestry or security floor changed during activation")
            release_status = json.loads((target / "release-manifest.json").read_text(encoding="utf-8"))
            receipt = {
                **release_status,
                "status": "DEPLOYED_VERIFIED",
                "service": SERVICE,
                "release_path": str(target),
                "deployment_receipt": str(receipt_path),
                "fencing_generation": generation,
                "authorization": "explicit root invocation for pinned origin/main SHA",
                "runtime_verification": health,
            }
            write_json_atomic(current_status_path, release_status)
            write_json_atomic(receipt_path, receipt)
            receipt["release_retention"] = _release_retention_result(release_root, current_link)
            return receipt
        except Exception as exc:
            rollback_errors: list[str] = []
            try:
                _restore_link(current_link, previous_link)
                if previous_dropin is None:
                    dropin_path.unlink(missing_ok=True)
                else:
                    _atomic_write_text(dropin_path, previous_dropin)
                if previous_node_worker_dropin is None:
                    node_worker_dropin_path.unlink(missing_ok=True)
                else:
                    _atomic_write_text(node_worker_dropin_path, previous_node_worker_dropin)
                runtime.daemon_reload()
                if activation_started:
                    runtime.restart()
                rollback = runtime.verify_rollback(
                    previous_working_directory,
                    previous_node_worker_directory,
                )
            except Exception as rollback_exc:
                rollback_errors.append(str(rollback_exc))
                rollback = {"status": "ROLLBACK_FAILED"}
            if previous_status is None:
                current_status_path.unlink(missing_ok=True)
            else:
                current_status_path.parent.mkdir(parents=True, exist_ok=True)
                fd, name = tempfile.mkstemp(prefix=".production-release.", dir=current_status_path.parent)
                try:
                    with os.fdopen(fd, "wb") as stream:
                        stream.write(previous_status)
                        stream.flush()
                        os.fsync(stream.fileno())
                    os.replace(name, current_status_path)
                finally:
                    Path(name).unlink(missing_ok=True)
            write_json_atomic(receipt_path, {
                "status": "ROLLED_BACK" if rollback.get("status") == "ROLLED_BACK_HEALTHY" else "ROLLBACK_FAILED",
                "service": SERVICE,
                "release_id": release_id,
                "source_revision": source_sha,
                "generation": generation,
                "fencing_generation": generation,
                "authorization": "explicit root invocation for pinned origin/main SHA",
                "failure_class": "activation_or_health_check_failed",
                "rollback": rollback,
            })
            raise ReleaseError(
                f"Promotion failed and rollback={rollback.get('status')}: {exc}; "
                + ("; ".join(rollback_errors) if rollback_errors else "")
            ) from exc


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    commands = parser.add_subparsers(dest="action", required=True)
    prepare = commands.add_parser("prepare", help="publish a verified build into the canonical artifact store")
    prepare.add_argument("--build-result", required=True, type=Path)
    promote = commands.add_parser("promote", help="promote one immutable artifact to smartspec-web.service")
    promote.add_argument("--artifact", required=True, type=Path)
    prepare_python = commands.add_parser("prepare-python", help="prepare exact-SHA Python source from a clean origin/main checkout")
    prepare_python.add_argument("--source", required=True, type=Path)
    prepare_python.add_argument("--source-sha")
    prepare_python.add_argument("--artifact-store", type=Path)
    promote_python = commands.add_parser("promote-python", help="promote one immutable artifact to smartspec-backend.service")
    promote_python.add_argument("--artifact", required=True, type=Path)
    args = parser.parse_args(argv)
    try:
        if args.action == "prepare":
            default_store = Path(args.build_result).parent / "artifacts"
            result = prepare_artifact(args.build_result, default_store)
            print(json.dumps(result, sort_keys=True))
            return 0
        if args.action == "prepare-python":
            from linux_python_backend_release import prepare_artifact as prepare_python_artifact
            result = prepare_python_artifact(args.source, args.artifact_store or Path("/home/dev/production-releases/smartspec-python-releases"), source_sha=args.source_sha)
            print(json.dumps(result, sort_keys=True))
            return 0
        if args.action == "promote-python":
            from linux_python_backend_release import promote_artifact as promote_python_artifact
            result = promote_python_artifact(args.artifact)
            print(json.dumps(result, sort_keys=True))
            return 0
        manifest = validate_published_artifact(args.artifact)
        build = json.loads(Path(manifest["canonicalBuildResult"]).read_text(encoding="utf-8"))
        workspace = Path(build["isolated_workspace"])
        policy_path = workspace / ".development-repository.toml"
        import tomllib
        policy = tomllib.loads(policy_path.read_text(encoding="utf-8"))["repository"]
        receipt_root = Path(args.artifact).parent.parent
        key = hashlib.sha256(policy["repository_id"].encode()).hexdigest()[:20]
        lock_path = Path(policy["lease_root"]).expanduser() / key / "production-release.lock"
        runtime = SystemdRuntime()
        result = promote_artifact(
            args.artifact,
            release_root=RELEASE_ROOT,
            dropin_path=SYSTEMD_DROPIN,
            current_link=CURRENT_LINK,
            lock_path=lock_path,
            receipt_root=receipt_root,
            runtime_data_root=RUNTIME_DATA_ROOT,
            runtime=runtime,
            current_tip=lambda item: canonical_tip(workspace, str(policy["remote"]), str(policy["canonical_ref"])),
        )
        print(json.dumps(result, sort_keys=True))
        return 0
    except (ReleaseError, OSError, ValueError, KeyError, subprocess.SubprocessError) as exc:
        print(f"linux backend release stopped: {exc}", file=sys.stderr)
        return 2


if __name__ == "__main__":
    raise SystemExit(main())
