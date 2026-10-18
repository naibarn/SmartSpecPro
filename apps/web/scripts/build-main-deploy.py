#!/usr/bin/env python3
"""Build public web assets from origin/main and publish them to the web service."""

from __future__ import annotations

import hashlib
import fcntl
import json
import os
import shutil
import subprocess
import sys
import tempfile
import tomllib
import uuid
from collections.abc import Callable
from datetime import datetime, timezone
from pathlib import Path


class DeployError(RuntimeError):
    pass


class CanonicalAdvanced(DeployError):
    pass


MAX_CANONICAL_BUILD_ATTEMPTS = 2
REQUIRED_TRPC_PROCEDURES = {
    "infrastructure.getSpec224DatabaseDiagnostics": (
        "infrastructure.ts",
        "getSpec224DatabaseDiagnostics: exactAdminProcedure",
    ),
}


def artifact_manifest(root: Path, *, excluded_names: set[str] | None = None) -> dict[str, object]:
    """Return the same deterministic digest format as canonical_source.py."""
    files: list[tuple[str, str, int]] = []
    excluded_names = excluded_names or set()
    for path in sorted(root.rglob("*")):
        if path.name in excluded_names or path.is_symlink() or not path.is_file():
            continue
        relative = path.relative_to(root).as_posix()
        files.append((relative, sha256(path), path.stat().st_size))
    canonical = "\n".join(f"{path}\0{digest}\0{size}" for path, digest, size in files)
    return {
        "artifact_digest": f"sha256:{hashlib.sha256(canonical.encode()).hexdigest()}",
        "artifact_file_count": len(files),
    }


def validate_build_provenance(build: dict[str, object], expected_ref: str) -> Path:
    artifact = build.get("artifact")
    workspace_value = build.get("isolated_workspace")
    if (
        build.get("status") != "BUILD_PASSED"
        or build.get("source_verified") is not True
        or build.get("canonical_ref") != expected_ref
        or not isinstance(build.get("source_revision"), str)
        or build.get("canonical_tip_after_build") != build.get("source_revision")
        or not isinstance(artifact, dict)
        or not isinstance(workspace_value, str)
    ):
        raise DeployError("Canonical artifact provenance is missing or inconsistent")
    revision = str(build["source_revision"])
    if len(revision) not in {40, 64} or any(character not in "0123456789abcdef" for character in revision.lower()):
        raise DeployError("Canonical artifact source revision is invalid")
    workspace = Path(workspace_value).resolve()
    dirty = run_git(
        workspace, "status", "--porcelain=v1", "--untracked-files=all", "--",
        ".", ":(exclude)apps/web/dist", ":(exclude)apps/web/dist/**",
    )
    if dirty:
        raise DeployError("Canonical artifact source worktree is dirty")
    artifact_path = artifact.get("artifact_path")
    if not isinstance(artifact_path, str):
        raise DeployError("Canonical build did not record its artifact path")
    root = Path(artifact_path).resolve()
    if not root.is_dir() or not root.is_relative_to(workspace):
        raise DeployError("Canonical artifact is outside its isolated source workspace")
    actual = artifact_manifest(root)
    if actual.get("artifact_digest") != artifact.get("artifact_digest") or actual.get("artifact_file_count") != artifact.get("artifact_file_count"):
        raise DeployError("Canonical artifact digest does not match its files")
    return root


def write_json_atomic(path: Path, payload: dict[str, object]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    descriptor, temporary_name = tempfile.mkstemp(prefix=f".{path.name}.", dir=path.parent)
    try:
        with os.fdopen(descriptor, "w", encoding="utf-8") as stream:
            json.dump(payload, stream, sort_keys=True)
            stream.write("\n")
            stream.flush()
            os.fsync(stream.fileno())
        os.replace(temporary_name, path)
    finally:
        Path(temporary_name).unlink(missing_ok=True)


def release_status(path: Path, target: Path | None, canonical_revision: str) -> dict[str, object]:
    status: dict[str, object] = {
        "canonical_revision": canonical_revision,
        "backend_runtime_revision": None,
        "release": None,
        "target_matches_release": None if target is None else False,
    }
    if target is not None:
        try:
            status["backend_runtime_revision"] = active_backend_revision(target.parent.parent)
        except DeployError as exc:
            status["backend_runtime_error"] = str(exc)
    try:
        release = json.loads(path.read_text(encoding="utf-8"))
        target_manifest = (
            json.loads((target / "release-manifest.json").read_text(encoding="utf-8"))
            if target is not None else None
        )
    except (OSError, json.JSONDecodeError):
        return status
    status["release"] = release
    if target is not None:
        status["target_matches_release"] = (
            release == target_manifest
            and target.joinpath("index.html").is_file()
            and sha256(target / "index.html") == release.get("index_sha256")
            and artifact_manifest(target, excluded_names={"release-manifest.json"}).get("artifact_digest")
            == release.get("public_artifact_digest")
            and release.get("frontend_source_revision") == release.get("backend_source_revision")
            and release.get("backend_source_revision") == status.get("backend_runtime_revision")
        )
    status["is_current_canonical"] = release.get("source_revision") == canonical_revision
    return status


def active_backend_revision(service_root: Path) -> str:
    """Resolve the source revision backing the active Node service checkout."""
    release_manifest = service_root / "release-manifest.json"
    if release_manifest.is_file():
        try:
            manifest = json.loads(release_manifest.read_text(encoding="utf-8"))
        except (OSError, json.JSONDecodeError) as exc:
            raise DeployError("Active backend release manifest is unreadable") from exc
        revision = manifest.get("backend_source_revision")
        if isinstance(revision, str) and len(revision) in {40, 64}:
            return revision
    revision = run_git(service_root.parent.parent, "rev-parse", "HEAD")
    if len(revision) not in {40, 64} or any(character not in "0123456789abcdef" for character in revision.lower()):
        raise DeployError("Active backend checkout does not resolve to a full source revision")
    return revision


def require_compatible_release(service_root: Path, frontend_revision: str) -> str:
    backend_revision = active_backend_revision(service_root)
    if backend_revision != frontend_revision:
        raise DeployError(
            "Frontend publication blocked: the active backend revision "
            f"({backend_revision}) does not match the canonical frontend revision ({frontend_revision}); "
            "promote a compatible backend through the authorized runtime release workflow first"
        )
    return backend_revision


def reject_static_publish_for_fullstack_release(service_root: Path) -> None:
    manifest_path = service_root / "release-manifest.json"
    if not manifest_path.is_file():
        return
    try:
        manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as exc:
        raise DeployError("Active backend release manifest is unreadable") from exc
    if manifest.get("release_mode") == "linux_systemd_fullstack":
        raise DeployError(
            "Frontend-only publication is disabled for an immutable full-stack release; "
            "build and promote a compatible frontend/backend artifact together"
        )


def validate_trpc_compatibility(public_root: Path, service_root: Path) -> None:
    """Fail closed when the published client calls a procedure absent from its backend."""
    public_files = [path for path in public_root.rglob("*") if path.is_file() and not path.is_symlink()]
    router_root = service_root / "server/routers"
    for procedure, (router_name, registration) in REQUIRED_TRPC_PROCEDURES.items():
        if not any(procedure.encode() in path.read_bytes() for path in public_files):
            continue
        router_path = router_root / router_name
        if not router_path.is_file() or registration not in router_path.read_text(encoding="utf-8"):
            raise DeployError(
                f"Frontend calls {procedure}, but the active backend router does not register it"
            )


def acquire_production_deploy_lock(path: Path):
    """Acquire the host-wide production writer lock; caller owns its lifetime."""
    path.parent.mkdir(parents=True, exist_ok=True)
    handle = path.open("a+")
    fcntl.flock(handle, fcntl.LOCK_EX)
    return handle


def validate_deploy_checkout(repo: Path, canonical_workspace: Path, canonical_tip: str) -> None:
    repo = repo.resolve()
    canonical_workspace = canonical_workspace.expanduser().resolve()
    if repo != canonical_workspace:
        raise DeployError("Production publication is allowed only from the configured canonical checkout")
    if run_git(repo, "branch", "--show-current") != "main":
        raise DeployError("Production publication requires the canonical main branch")
    if run_git(repo, "rev-parse", "HEAD") != canonical_tip:
        raise DeployError("Production publication checkout is not at the current origin/main revision")
    if run_git(repo, "status", "--porcelain=v1", "--untracked-files=all"):
        raise DeployError("Production publication checkout is dirty")


def restore_previous_public_tree(backup: Path, destination: Path) -> None:
    """Restore overwritten assets and remove newly copied files before index."""
    if not backup.is_dir():
        raise DeployError(f"Cannot restore previous published tree from {backup}")

    def files_by_relative_path(root: Path) -> dict[Path, Path]:
        files: dict[Path, Path] = {}
        for current, directory_names, file_names in os.walk(root, followlinks=False):
            current_path = Path(current)
            directory_names[:] = [
                name for name in directory_names if not (current_path / name).is_symlink()
            ]
            for name in file_names:
                source_file = current_path / name
                files[source_file.relative_to(root)] = source_file
        return files

    previous_files = files_by_relative_path(backup)
    current_files = files_by_relative_path(destination)
    for relative in current_files.keys() - previous_files.keys():
        (destination / relative).unlink(missing_ok=True)

    # Keep the old index visible until every file it may reference is restored.
    restore_order = sorted(
        previous_files,
        key=lambda relative: relative.as_posix() == "index.html",
    )
    for relative in restore_order:
        source_file = previous_files[relative]
        destination_file = destination / relative
        destination_file.parent.mkdir(parents=True, exist_ok=True)
        if source_file.is_symlink():
            destination_file.unlink(missing_ok=True)
            destination_file.symlink_to(os.readlink(source_file))
        else:
            if destination_file.is_symlink():
                destination_file.unlink()
            shutil.copy2(source_file, destination_file)


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


def bootstrap_controller(repo: Path, temporary: Path) -> tuple[Path, Path, str, str]:
    """Load policy and builder from fetched main so stale checkouts can run this."""
    bootstrap_ref = f"refs/codex/build-deploy/bootstrap/{uuid.uuid4().hex}"
    fetch = subprocess.run(
        [
            "git",
            "-C",
            str(repo),
            "fetch",
            "--no-tags",
            "origin",
            f"refs/heads/main:{bootstrap_ref}",
        ],
        text=True,
        capture_output=True,
        check=False,
    )
    if fetch.returncode:
        raise DeployError(f"Unable to fetch origin/main: {fetch.stderr.strip()}")
    source_sha = run_git(repo, "rev-parse", f"{bootstrap_ref}^{{commit}}")
    try:
        policy_text = run_git(repo, "show", f"{source_sha}:.development-repository.toml")
        controller_text = run_git(
            repo, "show", f"{source_sha}:scripts/development-lifecycle/canonical_source.py"
        )
    finally:
        subprocess.run(
            ["git", "-C", str(repo), "update-ref", "-d", bootstrap_ref],
            text=True,
            capture_output=True,
            check=False,
        )
    policy_path = temporary / "repository.toml"
    controller_path = temporary / "canonical_source.py"
    policy_path.write_text(policy_text + "\n", encoding="utf-8")
    controller_path.write_text(controller_text, encoding="utf-8")
    policy = tomllib.loads(policy_text)["repository"]
    if policy.get("remote") != "origin" or policy.get("canonical_ref") != "refs/heads/main":
        raise DeployError("origin/main differs from the repository's configured canonical ref")
    return policy_path, controller_path, policy["remote"], policy["canonical_ref"]


def remote_canonical_tip(repo: Path, remote: str, canonical_ref: str) -> str:
    output = run_git(repo, "ls-remote", "--exit-code", remote, canonical_ref)
    revisions = [line.split("\t", 1)[0] for line in output.splitlines() if "\t" in line]
    if len(revisions) != 1 or len(revisions[0]) not in {40, 64}:
        raise DeployError("Canonical ref resolution returned an invalid result")
    return revisions[0]


def ensure_canonical_tip(
    repo: Path, remote: str, canonical_ref: str, expected_revision: str
) -> None:
    actual_revision = remote_canonical_tip(repo, remote, canonical_ref)
    if actual_revision != expected_revision:
        raise CanonicalAdvanced(
            "Canonical source advanced before publication; "
            f"built={expected_revision}, current={actual_revision}"
        )


def controller_matches_source(
    repo: Path, controller_path: Path, policy_path: Path, source_revision: str
) -> bool:
    source_controller = run_git(
        repo, "show", f"{source_revision}:scripts/development-lifecycle/canonical_source.py"
    )
    source_policy = run_git(repo, "show", f"{source_revision}:.development-repository.toml")
    return (
        controller_path.read_text(encoding="utf-8").strip() == source_controller
        and policy_path.read_text(encoding="utf-8").strip() == source_policy
    )


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


def publish_public_tree(
    source: Path,
    destination: Path,
    backup: Path,
    before_index_swap: Callable[[], None] | None = None,
) -> tuple[int, str]:
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
            relative = source_file.relative_to(source)
            if (
                source_file.is_symlink()
                or source_file == source_index
                or relative.as_posix() == "release-manifest.json"
            ):
                continue
            target_file = destination / relative
            target_file.parent.mkdir(parents=True, exist_ok=True)
            if (
                not target_file.parent.resolve().is_relative_to(destination_root)
                or target_file.is_symlink()
            ):
                raise DeployError(f"Asset path escapes the publish directory: {relative}")
            source_hash = sha256(source_file)
            if target_file.is_file():
                if sha256(target_file) != source_hash:
                    raise DeployError(
                        f"Published asset path is already bound to different immutable content: {relative}"
                    )
                copied += 1
                continue
            descriptor, temporary_name = tempfile.mkstemp(
                prefix=f".{target_file.name}.release-", dir=target_file.parent
            )
            os.close(descriptor)
            temporary_asset = Path(temporary_name)
            try:
                shutil.copy2(source_file, temporary_asset)
                if source_hash != sha256(temporary_asset):
                    raise DeployError(f"Published asset hash mismatch: {relative}")
                os.replace(temporary_asset, target_file)
            finally:
                temporary_asset.unlink(missing_ok=True)
            copied += 1

    descriptor, temporary_name = tempfile.mkstemp(
        prefix=".index.html.codex-", dir=destination
    )
    os.close(descriptor)
    temporary_index = Path(temporary_name)
    try:
        shutil.copy2(source_index, temporary_index)
        if before_index_swap is not None:
            before_index_swap()
        os.replace(temporary_index, destination_index)
    finally:
        temporary_index.unlink(missing_ok=True)

    index_hash = sha256(destination_index)
    if index_hash != sha256(source_index):
        shutil.copy2(backup / "index.html", temporary_index)
        os.replace(temporary_index, destination_index)
        raise DeployError("Published index hash mismatch; previous index was restored")
    return copied, index_hash


def verify_published_revision(
    repo: Path, remote: str, canonical_ref: str, source_revision: str,
    published_index: Path, expected_index_sha256: str,
) -> None:
    """Confirm that the visible index matches the published canonical revision.

    The caller uses this after the swap, not only before it, to catch a
    concurrent main advance between the last pre-swap guard and publication.
    """
    if sha256(published_index) != expected_index_sha256:
        raise DeployError("Published index no longer matches the verified build")
    ensure_canonical_tip(repo, remote, canonical_ref, source_revision)


def main() -> int:
    repo = Path(__file__).resolve().parents[3]
    arguments = sys.argv[1:]
    if arguments == ["--help"]:
        print("Build latest origin/main and publish public assets under the shared production deploy lock.")
        print("Usage: npm run build:deploy [--plan | --status | atomic swap]")
        return 0
    if arguments not in ([], ["--plan"], ["--status"], ["atomic", "swap"]):
        raise DeployError("Usage: npm run build:deploy [--plan | --status | atomic swap]")
    plan_only = arguments == ["--plan"]
    status_only = arguments == ["--status"]
    if arguments == ["atomic", "swap"]:
        print("Note: 'atomic swap' is accepted for compatibility; publication is atomic by default.")

    with tempfile.TemporaryDirectory(prefix="sspro-main-builder-") as temporary_dir:
        temporary = Path(temporary_dir)
        policy_path, _, remote, canonical_ref = bootstrap_controller(repo, temporary)
        policy = tomllib.loads(policy_path.read_text(encoding="utf-8"))["repository"]
        repository_key = hashlib.sha256(policy["repository_id"].encode("utf-8")).hexdigest()[:20]
        shared_state = Path(policy["lease_root"]).expanduser() / repository_key
        release_status_path = shared_state / "production-release.json"
        if plan_only:
            print(f"SOURCE_REVISION={remote_canonical_tip(repo, remote, canonical_ref)}")
            print(f"PUBLISH_TARGET={service_web_root() / 'dist/public'}")
            print("MODE=plan; no build or publication performed")
            return 0
        if status_only:
            target = None
            try:
                target = service_web_root() / "dist/public"
            except DeployError:
                pass
            current_status = release_status(
                release_status_path, target, remote_canonical_tip(repo, remote, canonical_ref)
            )
            current_status["runtime_target_available"] = target is not None
            print(json.dumps(
                current_status,
                sort_keys=True,
            ))
            return 0

        service_root = service_web_root()
        destination = service_root / "dist/public"
        reject_static_publish_for_fullstack_release(service_root)
        require_compatible_release(
            service_root, remote_canonical_tip(repo, remote, canonical_ref)
        )

        # Serialize the complete build-to-publish transaction across every
        # checkout/session on this host. The lock lives beside Task Control's
        # canonical build lease state, not in a worktree.
        deploy_lock = acquire_production_deploy_lock(shared_state / "production-deploy.lock")
        validate_deploy_checkout(
            repo,
            Path(policy["canonical_user_workspace"]),
            remote_canonical_tip(repo, remote, canonical_ref),
        )

        required_revision = os.environ.get("SSP_REQUIRED_INTEGRATED_REVISION")
        for attempt in range(1, MAX_CANONICAL_BUILD_ATTEMPTS + 1):
            if attempt > 1:
                print(
                    f"[build:deploy] Retrying once from the latest canonical source "
                    f"(attempt {attempt}/{MAX_CANONICAL_BUILD_ATTEMPTS}).",
                    file=sys.stderr,
                )
            policy_path, controller_path, remote, canonical_ref = bootstrap_controller(
                repo, temporary
            )
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
            if required_revision:
                command.extend(["--required-integrated-revision", required_revision])
            result = subprocess.run(command, text=True, stdout=subprocess.PIPE, check=False)
            try:
                build = json.loads(result.stdout.strip().splitlines()[-1])
            except (IndexError, json.JSONDecodeError) as exc:
                raise DeployError("Canonical builder did not return a result record") from exc

            if build.get("status") == "RESOURCE_BLOCKED":
                raise DeployError(
                    "Canonical build was resource-blocked "
                    f"(exit {build.get('exit_code')}); nothing was published. "
                    "Wait for memory pressure to clear before retrying."
                )
            if result.returncode not in (0, 75):
                raise DeployError(f"Canonical build failed with exit code {result.returncode}")

            if result.returncode == 75 or build.get("status") == "STALE_CANONICAL_ADVANCED":
                if attempt < MAX_CANONICAL_BUILD_ATTEMPTS:
                    print(
                        "[build:deploy] Canonical source changed during build; "
                        "discarding that result and retrying once from the latest tip.",
                        file=sys.stderr,
                    )
                    continue
                raise CanonicalAdvanced("Canonical source advanced during both build attempts; nothing was published")
            if result.returncode != 0 or build.get("status") != "BUILD_PASSED":
                raise DeployError(
                    f"Canonical build status is {build.get('status')!r}; nothing was published"
                )

            built_root = validate_build_provenance(build, canonical_ref)
            source_revision = str(build["source_revision"])
            stale_reason = None
            if build.get("canonical_tip_after_build") != source_revision:
                stale_reason = "canonical source advanced while the build was running"
            elif not controller_matches_source(repo, controller_path, policy_path, source_revision):
                stale_reason = "canonical build controller changed after bootstrap"
            elif remote_canonical_tip(repo, remote, canonical_ref) != source_revision:
                stale_reason = "canonical source advanced after the build completed"
            if stale_reason:
                if attempt < MAX_CANONICAL_BUILD_ATTEMPTS:
                    print(
                        f"[build:deploy] {stale_reason}; retrying once from the latest tip.",
                        file=sys.stderr,
                    )
                    continue
                raise CanonicalAdvanced(f"{stale_reason}; nothing was published after both attempts")

            source = built_root / "public"
            artifact = build["artifact"]
            if not source.is_dir():
                raise DeployError("Canonical artifact is missing public assets")
            validate_trpc_compatibility(source, service_root)
            backend_revision = require_compatible_release(service_root, source_revision)
            backup_root = Path.home() / ".cache/codex/deploy-backups"
            stamp = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%S.%fZ")
            backup = backup_root / f"smartspec-web-main-{stamp}"
            try:
                ensure_canonical_tip(repo, remote, canonical_ref, source_revision)
                copied, index_hash = publish_public_tree(
                    source,
                    destination,
                    backup,
                    before_index_swap=lambda: ensure_canonical_tip(
                        repo, remote, canonical_ref, source_revision
                    ),
                )
            except CanonicalAdvanced:
                if backup.exists():
                    restore_previous_public_tree(backup, destination)
                if attempt < MAX_CANONICAL_BUILD_ATTEMPTS:
                    continue
                raise
            except Exception:
                if backup.exists():
                    restore_previous_public_tree(backup, destination)
                raise

            try:
                verify_published_revision(
                    repo, remote, canonical_ref, source_revision,
                    destination / "index.html", index_hash,
                )
            except CanonicalAdvanced as exc:
                restore_previous_public_tree(backup, destination)
                if attempt < MAX_CANONICAL_BUILD_ATTEMPTS:
                    print(
                        "[build:deploy] main advanced after publish; building "
                        "and publishing the new tip.",
                        file=sys.stderr,
                    )
                    continue
                raise CanonicalAdvanced(
                    "main advanced after publication; artifact was published "
                    "but is not claimed as latest. No further automatic "
                    f"retries remain: {exc}"
                ) from exc

            previous_release: dict[str, object] = {}
            try:
                previous_release = json.loads(release_status_path.read_text(encoding="utf-8"))
            except (OSError, json.JSONDecodeError):
                pass
            built_public_artifact = artifact_manifest(source)
            deployed_public_artifact = artifact_manifest(
                destination, excluded_names={"release-manifest.json"}
            )
            release = {
                "release_id": f"{source_revision}:{artifact['artifact_digest']}",
                "source_revision": source_revision,
                "frontend_source_revision": source_revision,
                "backend_source_revision": backend_revision,
                "canonical_ref": canonical_ref,
                "artifact_digest": artifact["artifact_digest"],
                "artifact_file_count": artifact["artifact_file_count"],
                "build_public_artifact_digest": built_public_artifact["artifact_digest"],
                "public_artifact_digest": deployed_public_artifact["artifact_digest"],
                "public_file_count": deployed_public_artifact["artifact_file_count"],
                "index_sha256": index_hash,
                "generation": int(previous_release.get("generation", 0)) + 1,
                "deployed_at": datetime.now(timezone.utc).isoformat(),
            }
            try:
                write_json_atomic(destination / "release-manifest.json", release)
                write_json_atomic(release_status_path, release)
            except OSError:
                restore_previous_public_tree(backup, destination)
                raise

            print(f"SOURCE_REVISION={source_revision}")
            print(f"RELEASE_ID={release['release_id']}")
            print(f"ARTIFACT_DIGEST={release['artifact_digest']}")
            print(f"DEPLOY_GENERATION={release['generation']}")
            print(f"PUBLISH_TARGET={destination}")
            print(f"BACKUP={backup}")
            print(f"PUBLISHED_ASSETS={copied}")
            print(f"INDEX_SHA256={index_hash}")
            print("SERVICE_RESTART=not-required-for-static-assets")
            break
    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except DeployError as exc:
        print(f"build:deploy stopped: {exc}", file=sys.stderr)
        raise SystemExit(2)
