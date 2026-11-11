#!/usr/bin/env python3
"""Target-gated handover controller for the Modular Debian development site."""

from __future__ import annotations

import argparse
from datetime import datetime, timezone
import hashlib
import json
import os
from pathlib import Path
import re
import shutil
import subprocess
import sys
import time
from typing import Any

try:
    import yaml
except ImportError as exc:  # pragma: no cover - the host release image provides PyYAML
    raise SystemExit("PyYAML is required to validate the local Tunnel ingress") from exc


DOMAIN = "aimarkethubs.com"
TARGET_ID = "modular-debian-dev"
COMPONENTS = {
    "core": {"service": "smartsihub-core-dev.service", "port": 3200, "health": "/livez", "expected": 200},
    "chat": {"service": "smartsihub-chat-dev.service", "port": 3201, "health": "/api/chat/livez", "expected": 200},
    "shell": {"service": "smartsihub-shell-dev.service", "port": 3202, "health": "/login", "expected": 200},
}
SERVICE_WORKING_DIRECTORIES = {
    "core": "apps/saas-core",
    "chat": "modules/chat",
    "shell": "apps/saas-shell",
}
ACTIVE_TUNNEL_CONFIG = Path("/home/dev/.config/smartspec-dev/cloudflared.yml")
TUNNEL_SERVICE = "smartspec-dev-tunnel.service"


class ReleaseError(RuntimeError):
    pass


def resolve_target(targets: dict[str, Any], target_id: str) -> dict[str, Any]:
    if target_id != TARGET_ID:
        raise ReleaseError("TARGET_NOT_SUPPORTED_BY_MODULAR_DEBIAN_RELEASE")
    target = targets.get("targets", {}).get(target_id)
    expected = {
        "domain": DOMAIN,
        "environment": "development",
        "application": "smartsihub-modular-core",
        "runtime": "debian-systemd-with-local-workerd",
        "service": COMPONENTS["core"]["service"],
        "port": COMPONENTS["core"]["port"],
        "database": "smartspec",
        "deploymentAuthority": "delegated-development",
    }
    if not isinstance(target, dict) or any(target.get(key) != value for key, value in expected.items()):
        raise ReleaseError("MODULAR_DEBIAN_TARGET_REGISTRY_MISMATCH")
    if target.get("status") not in {"prepared", "serving"}:
        raise ReleaseError("MODULAR_DEBIAN_TARGET_NOT_READY")
    handover = target.get("handover", {})
    if (
        handover.get("currentService") != "smartspec-dev-web.service"
        or handover.get("currentPort") != 3100
        or handover.get("preserveUntilCoreHealthy") is not True
    ) and target.get("status") == "prepared":
        raise ReleaseError("LEGACY_ROLLBACK_TARGET_MISMATCH")
    return target


def validate_tunnel_configuration(candidate: dict[str, Any], active: dict[str, Any]) -> None:
    if candidate.get("tunnel") != active.get("tunnel") or candidate.get("credentials-file") != active.get("credentials-file"):
        raise ReleaseError("TUNNEL_IDENTITY_MISMATCH")
    ingress = candidate.get("ingress")
    if not isinstance(ingress, list) or not ingress:
        raise ReleaseError("TUNNEL_INGRESS_MISSING")

    probes = {
        "/v1/core/auth/login": "https://127.0.0.1:3200",
        "/api/chat/livez": "https://127.0.0.1:3201",
        "/modules/chat/current/module.manifest.json": "https://127.0.0.1:3201",
        "/login": "https://127.0.0.1:3202",
        "/": "https://127.0.0.1:3202",
    }
    for path, expected_service in probes.items():
        matched = None
        for rule in ingress:
            if rule.get("hostname") != DOMAIN:
                continue
            pattern = rule.get("path")
            if pattern is None or re.search(pattern, path):
                matched = rule
                break
        if matched is None or matched.get("service") != expected_service:
            raise ReleaseError("TUNNEL_ROUTE_MISMATCH")
        origin = matched.get("originRequest", {})
        if origin.get("httpHostHeader") != DOMAIN or origin.get("noTLSVerify") is not True:
            raise ReleaseError("TUNNEL_ORIGIN_POLICY_MISMATCH")


def digest_tree(directory: Path) -> str:
    digest = hashlib.sha256()
    for file_path in sorted(path for path in directory.rglob("*") if path.is_file()):
        digest.update(file_path.relative_to(directory).as_posix().encode())
        digest.update(b"\0")
        digest.update(hashlib.sha256(file_path.read_bytes()).digest())
    return f"sha256:{digest.hexdigest()}"


def run(command: list[str], *, timeout: int = 20) -> subprocess.CompletedProcess[str]:
    result = subprocess.run(command, capture_output=True, text=True, timeout=timeout)
    if result.returncode != 0:
        raise ReleaseError("RELEASE_COMMAND_FAILED:" + Path(command[0]).name)
    return result


def verify_service_release_directories(artifact_root: Path, *, proc_root: Path = Path("/proc")) -> None:
    expected_root = artifact_root.resolve()
    for name, component in COMPONENTS.items():
        run(["systemctl", "--user", "is-active", component["service"]])
        result = run([
            "systemctl", "--user", "show", component["service"],
            "--property=MainPID", "--value",
        ])
        main_pid = result.stdout.strip()
        if not main_pid.isdigit() or int(main_pid) == 0:
            raise ReleaseError(f"SERVICE_PROCESS_UNAVAILABLE:{name}")
        try:
            actual_directory = Path(os.readlink(proc_root / main_pid / "cwd")).resolve()
        except (OSError, RuntimeError) as exc:
            raise ReleaseError(f"SERVICE_PROCESS_CWD_UNAVAILABLE:{name}") from exc
        expected_directory = (expected_root / SERVICE_WORKING_DIRECTORIES[name]).resolve()
        if actual_directory != expected_directory:
            raise ReleaseError(f"SERVICE_RELEASE_PATH_MISMATCH:{name}")


def capture_service_directories(*, proc_root: Path = Path("/proc")) -> dict[str, Path]:
    directories: dict[str, Path] = {}
    for name, component in COMPONENTS.items():
        run(["systemctl", "--user", "is-active", component["service"]])
        result = run([
            "systemctl", "--user", "show", component["service"],
            "--property=MainPID", "--value",
        ])
        main_pid = result.stdout.strip()
        if not main_pid.isdigit() or int(main_pid) == 0:
            raise ReleaseError(f"SERVICE_PROCESS_UNAVAILABLE:{name}")
        try:
            directories[name] = Path(os.readlink(proc_root / main_pid / "cwd")).resolve()
        except (OSError, RuntimeError) as exc:
            raise ReleaseError(f"SERVICE_PROCESS_CWD_UNAVAILABLE:{name}") from exc
    return directories


def verify_service_directories(expected: dict[str, Path], *, proc_root: Path = Path("/proc")) -> None:
    for name, component in COMPONENTS.items():
        run(["systemctl", "--user", "is-active", component["service"]])
        result = run([
            "systemctl", "--user", "show", component["service"],
            "--property=MainPID", "--value",
        ])
        main_pid = result.stdout.strip()
        if not main_pid.isdigit() or int(main_pid) == 0:
            raise ReleaseError(f"SERVICE_PROCESS_UNAVAILABLE:{name}")
        try:
            actual_directory = Path(os.readlink(proc_root / main_pid / "cwd")).resolve()
        except (OSError, RuntimeError) as exc:
            raise ReleaseError(f"SERVICE_PROCESS_CWD_UNAVAILABLE:{name}") from exc
        if actual_directory != expected[name].resolve():
            raise ReleaseError(f"SERVICE_RELEASE_PATH_MISMATCH:{name}")


def wait_for_service_directories(
    expected: dict[str, Path],
    *,
    proc_root: Path = Path("/proc"),
    attempts: int = 10,
    interval: float = 1,
) -> None:
    last_error: ReleaseError | None = None
    for attempt in range(attempts):
        try:
            verify_service_directories(expected, proc_root=proc_root)
            return
        except ReleaseError as exc:
            last_error = exc
            if attempt + 1 < attempts:
                time.sleep(interval)
    raise last_error or ReleaseError("SERVICE_RELEASE_PATH_UNAVAILABLE")


def wait_for_service_release_directories(
    artifact_root: Path,
    *,
    proc_root: Path = Path("/proc"),
    attempts: int = 10,
    interval: float = 1,
) -> None:
    expected_root = artifact_root.resolve()
    expected = {
        name: expected_root / relative
        for name, relative in SERVICE_WORKING_DIRECTORIES.items()
    }
    wait_for_service_directories(expected, proc_root=proc_root, attempts=attempts, interval=interval)


def write_service_release_dropins(
    artifact_root: Path,
    rollback_directory: Path,
    *,
    unit_dir: Path | None = None,
) -> None:
    unit_directory = unit_dir or Path.home() / ".config/systemd/user"
    rollback_directory.mkdir(mode=0o700, parents=True, exist_ok=True)
    entries = []
    for name, component in COMPONENTS.items():
        service = component["service"]
        dropin = unit_directory / f"{service}.d" / "modular-release.conf"
        backup = rollback_directory / f"{service}.modular-release.conf"
        absent = rollback_directory / f"{service}.modular-release.conf.absent"
        if backup.exists() or absent.exists():
            raise ReleaseError("SYSTEMD_ROLLBACK_BACKUP_ALREADY_EXISTS")
        entries.append((name, dropin, backup, absent))

    created_backups: list[Path] = []
    try:
        for _, dropin, backup, absent in entries:
            if dropin.exists():
                shutil.copy2(dropin, backup)
                created_backups.append(backup)
            else:
                absent.touch(mode=0o600)
                created_backups.append(absent)
    except Exception:
        for path in created_backups:
            path.unlink(missing_ok=True)
        raise

    try:
        for name, dropin, _, _ in entries:
            working_directory = (artifact_root / SERVICE_WORKING_DIRECTORIES[name]).resolve()
            dropin.parent.mkdir(mode=0o700, parents=True, exist_ok=True)
            atomic_write(dropin, f"[Service]\nWorkingDirectory={working_directory}\n")
    except Exception:
        restore_service_release_dropins(rollback_directory, unit_dir=unit_directory)
        raise


def restore_service_release_dropins(
    rollback_directory: Path,
    *,
    unit_dir: Path | None = None,
) -> None:
    unit_directory = unit_dir or Path.home() / ".config/systemd/user"
    for component in COMPONENTS.values():
        service = component["service"]
        dropin = unit_directory / f"{service}.d" / "modular-release.conf"
        backup = rollback_directory / f"{service}.modular-release.conf"
        absent = rollback_directory / f"{service}.modular-release.conf.absent"
        if backup.is_file() and not absent.exists():
            atomic_write(dropin, backup.read_text(encoding="utf-8"), backup.stat().st_mode & 0o777)
        elif absent.is_file() and not backup.exists():
            dropin.unlink(missing_ok=True)
        else:
            raise ReleaseError("SYSTEMD_ROLLBACK_BACKUP_INVALID")


def restart_modular_services() -> None:
    run(["systemctl", "--user", "daemon-reload"], timeout=30)
    for component in COMPONENTS.values():
        run(["systemctl", "--user", "restart", component["service"]], timeout=45)


def http_status(url: str, *, host: str | None = None, max_time: int = 8) -> tuple[int, str]:
    command = ["curl", "--silent", "--show-error", "--max-time", str(max_time), "--output", "/tmp/modular-release-response"]
    if host:
        parsed = re.match(r"https://aimarkethubs\.com:(\d+)(/.*)$", url)
        if not parsed:
            raise ReleaseError("LOCAL_SMOKE_URL_INVALID")
        port, _ = parsed.groups()
        command.extend(["--resolve", f"{DOMAIN}:{port}:127.0.0.1", "--insecure"])
    command.extend(["--write-out", "%{http_code}", url])
    result = subprocess.run(command, capture_output=True, text=True, timeout=max_time + 2)
    if result.returncode != 0:
        raise ReleaseError("HTTP_SMOKE_REQUEST_FAILED")
    try:
        return int(result.stdout.strip()), Path("/tmp/modular-release-response").read_text(errors="replace")
    except (ValueError, OSError) as exc:
        raise ReleaseError("HTTP_SMOKE_RESPONSE_INVALID") from exc


def _verify_local_components_once() -> dict[str, int]:
    outcomes: dict[str, int] = {}
    for name, component in COMPONENTS.items():
        run(["systemctl", "--user", "is-active", component["service"]])
        url = f"https://{DOMAIN}:{component['port']}{component['health']}"
        status, _ = http_status(url, host=DOMAIN)
        if status != component["expected"]:
            raise ReleaseError(f"LOCAL_COMPONENT_UNHEALTHY:{name}")
        outcomes[name] = status

    status, _ = http_status(f"https://{DOMAIN}:3201/api/chat/v1/session", host=DOMAIN)
    if status != 401:
        raise ReleaseError("LOCAL_CHAT_AUTH_BOUNDARY_FAILED")
    outcomes["chat_session_without_cookie"] = status

    status, manifest_text = http_status(
        f"https://{DOMAIN}:3201/modules/chat/current/module.manifest.json", host=DOMAIN,
    )
    if status != 200:
        raise ReleaseError("LOCAL_CHAT_MANIFEST_UNAVAILABLE")
    manifest = json.loads(manifest_text)
    asset_url = manifest.get("assets", {}).get("manifest")
    prefix = manifest.get("assetPrefix")
    if not isinstance(asset_url, str) or not isinstance(prefix, str):
        raise ReleaseError("LOCAL_CHAT_MANIFEST_INVALID")
    status, asset_manifest_text = http_status(f"https://{DOMAIN}:3201{asset_url}", host=DOMAIN)
    if status != 200:
        raise ReleaseError("LOCAL_CHAT_ASSET_MANIFEST_UNAVAILABLE")
    entries = json.loads(asset_manifest_text)
    entry = next((item for item in entries.values() if item.get("isEntry") is True), None)
    if not isinstance(entry, dict) or not isinstance(entry.get("file"), str):
        raise ReleaseError("LOCAL_CHAT_ENTRY_MISSING")
    status, _ = http_status(f"https://{DOMAIN}:3201{prefix}{entry['file']}", host=DOMAIN)
    if status != 200:
        raise ReleaseError("LOCAL_CHAT_ENTRY_UNAVAILABLE")
    outcomes["chat_manifest"] = 200
    outcomes["chat_entry"] = 200
    return outcomes


def verify_local_components(*, attempts: int = 6, interval: float = 1) -> dict[str, int]:
    last_error: ReleaseError | None = None
    for attempt in range(attempts):
        try:
            return _verify_local_components_once()
        except ReleaseError as exc:
            last_error = exc
            if attempt + 1 < attempts:
                time.sleep(interval)
    raise last_error or ReleaseError("LOCAL_COMPONENTS_UNAVAILABLE")


def _verify_public_site_once() -> dict[str, int]:
    outcomes = {}
    for name, path, expected in (
        ("shell_root", "/", 200),
        ("shell_login", "/login", 200),
        ("chat_health", "/api/chat/livez", 200),
        ("chat_session_without_cookie", "/api/chat/v1/session", 401),
        ("chat_module_manifest", "/modules/chat/current/module.manifest.json", 200),
    ):
        status, body = http_status(f"https://{DOMAIN}{path}", max_time=4)
        if status != expected:
            raise ReleaseError(f"PUBLIC_SMOKE_FAILED:{name}")
        if name in {"shell_root", "shell_login"} and ("/assets/" not in body or "dashboard" in body.lower()):
            raise ReleaseError("PUBLIC_SHELL_CONTENT_MISMATCH")
        outcomes[name] = status
    return outcomes


def verify_public_site() -> dict[str, int]:
    last_error: ReleaseError | None = None
    for attempt in range(6):
        try:
            return _verify_public_site_once()
        except ReleaseError as exc:
            last_error = exc
            if attempt < 5:
                time.sleep(2)
    raise last_error or ReleaseError("PUBLIC_SMOKE_FAILED")


def atomic_write(path: Path, content: str, mode: int = 0o600) -> None:
    temporary = path.with_name(path.name + ".tmp")
    temporary.write_text(content)
    os.chmod(temporary, mode)
    os.replace(temporary, path)


def deploy(args: argparse.Namespace) -> dict[str, Any]:
    target_file = args.targets.resolve()
    target_map = json.loads(target_file.read_text())
    target = resolve_target(target_map, args.target)
    if args.active_config.resolve() != ACTIVE_TUNNEL_CONFIG:
        raise ReleaseError("ACTIVE_TUNNEL_CONFIG_NOT_AUTHORIZED")

    artifact_root = args.artifact_root.resolve()
    release_root = Path(target["releaseRoot"]).resolve()
    manifest_file = artifact_root / "release-manifest.json"
    if artifact_root.parent != release_root or not manifest_file.is_file():
        raise ReleaseError("RELEASE_ARTIFACT_PATH_MISMATCH")
    manifest = json.loads(manifest_file.read_text())
    revision = manifest.get("sourceRevision")
    if (
        manifest.get("target") != TARGET_ID or manifest.get("domain") != DOMAIN
        or manifest.get("database") != "smartspec" or not re.fullmatch(r"[0-9a-f]{40}", str(revision))
    ):
        raise ReleaseError("RELEASE_ARTIFACT_TARGET_MISMATCH")
    for name, relative in (("core", "apps/saas-core/dist"), ("shell", "apps/saas-shell/dist"), ("chat", "modules/chat/dist/ui")):
        built = manifest.get("builds", {}).get(name, {})
        if built.get("artifactDigest") != digest_tree(artifact_root / relative):
            raise ReleaseError(f"RELEASE_ARTIFACT_DIGEST_MISMATCH:{name}")

    if args.active_config.resolve() != ACTIVE_TUNNEL_CONFIG or not args.active_config.is_file():
        raise ReleaseError("ACTIVE_TUNNEL_CONFIG_MISSING")
    if args.candidate_config.resolve() == args.active_config.resolve() or not args.candidate_config.is_file():
        raise ReleaseError("CANDIDATE_TUNNEL_CONFIG_INVALID")
    active_document = yaml.safe_load(args.active_config.read_text())
    candidate_document = yaml.safe_load(args.candidate_config.read_text())
    validate_tunnel_configuration(candidate_document, active_document)

    run(["systemctl", "--user", "is-active", target["handover"]["currentService"]])
    old_status, _ = http_status("http://127.0.0.1:3100/")
    if old_status != 200:
        raise ReleaseError("LEGACY_ROLLBACK_SERVICE_UNHEALTHY")

    previous_service_directories = capture_service_directories()
    local_smoke = verify_local_components()
    run(["cloudflared", "tunnel", "--config", str(args.candidate_config), "ingress", "validate"])
    for route in ("/v1/core/auth/login", "/api/chat/livez", "/modules/chat/current/module.manifest.json", "/login", "/"):
        run(["cloudflared", "tunnel", "--config", str(args.candidate_config), "ingress", "rule", f"https://{DOMAIN}{route}"])

    backup = artifact_root / "rollback" / "cloudflared.pre-modular.yml"
    backup.parent.mkdir(mode=0o700, parents=True, exist_ok=True)
    if backup.exists():
        raise ReleaseError("ROLLBACK_BACKUP_ALREADY_EXISTS")
    shutil.copy2(args.active_config, backup)
    os.chmod(backup, 0o600)
    systemd_rollback = artifact_root / "rollback" / "systemd"
    tunnel_changed = False
    services_prepared = False
    stage = "write_service_dropins"
    try:
        write_service_release_dropins(artifact_root, systemd_rollback)
        services_prepared = True
        stage = "restart_candidate_services"
        restart_modular_services()
        stage = "verify_candidate_service_directories"
        wait_for_service_release_directories(artifact_root)
        stage = "verify_candidate_health"
        local_smoke = verify_local_components()

        stage = "switch_tunnel"
        candidate_text = args.candidate_config.read_text()
        atomic_write(args.active_config, candidate_text)
        tunnel_changed = True
        run(["systemctl", "--user", "restart", TUNNEL_SERVICE], timeout=30)
        time.sleep(3)
        stage = "verify_public_site"
        public_smoke = verify_public_site()
    except Exception as exc:
        rollback_stage = "begin"
        try:
            if tunnel_changed:
                rollback_stage = "restore_tunnel_config"
                atomic_write(args.active_config, backup.read_text())
                run(["systemctl", "--user", "restart", TUNNEL_SERVICE], timeout=30)
            if services_prepared:
                rollback_stage = "restore_service_dropins"
                restore_service_release_dropins(systemd_rollback)
                rollback_stage = "restart_previous_services"
                restart_modular_services()
                rollback_stage = "verify_previous_service_directories"
                wait_for_service_directories(previous_service_directories)
                rollback_stage = "verify_previous_health"
                verify_local_components()
            if tunnel_changed:
                rollback_stage = "verify_public_recovery"
                recovered_status, _ = http_status("https://aimarkethubs.com/")
                if recovered_status != 200:
                    raise ReleaseError("PUBLIC_ROLLBACK_UNHEALTHY")
        except Exception as rollback_error:
            original = str(exc) if isinstance(exc, ReleaseError) else type(exc).__name__
            rollback = str(rollback_error) if isinstance(rollback_error, ReleaseError) else type(rollback_error).__name__
            raise ReleaseError(
                f"HANDOVER_FAILED_AND_ROLLBACK_FAILED:stage={stage};cause={original};rollback_stage={rollback_stage};rollback={rollback}"
            ) from rollback_error
        original = str(exc) if isinstance(exc, ReleaseError) else type(exc).__name__
        raise ReleaseError(f"HANDOVER_FAILED_ROLLED_BACK:stage={stage};cause={original}") from exc

    now = datetime.now(timezone.utc).isoformat()
    target.update({
        "controller": "modular-debian-dev-release",
        "currentRelease": manifest["releaseId"],
        "releaseReceipt": str(manifest_file),
        "status": "serving",
        "applicationAvailable": True,
        "deployable": True,
        "components": COMPONENTS,
        "handover": {
            **target["handover"],
            "preserveUntilCoreHealthy": False,
            "preservedForRollback": True,
            "activeService": COMPONENTS["shell"]["service"],
            "activePort": COMPONENTS["shell"]["port"],
            "tunnelService": TUNNEL_SERVICE,
            "rollbackConfig": str(backup),
        },
    })
    manifest.update({
        "deployedAtUtc": now,
        "publicSmoke": public_smoke,
        "localSmoke": local_smoke,
        "rollbackConfig": str(backup),
        "previousService": "smartspec-dev-web.service",
        "previousPort": 3100,
    })
    atomic_write(manifest_file, json.dumps(manifest, indent=2) + "\n", 0o644)
    atomic_write(target_file, json.dumps(target_map, indent=2) + "\n", 0o644)
    return {
        "status": "DEPLOYED_AND_VERIFIED",
        "target": TARGET_ID,
        "domain": DOMAIN,
        "sourceRevision": revision,
        "localSmoke": local_smoke,
        "publicSmoke": public_smoke,
        "rollbackService": "smartspec-dev-web.service:3100",
        "rollbackConfig": str(backup),
        "rollbackSystemdDirectory": str(systemd_rollback),
        "deployedAtUtc": now,
    }


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--target", required=True)
    parser.add_argument("--artifact-root", type=Path, required=True)
    parser.add_argument("--candidate-config", type=Path, required=True)
    parser.add_argument("--active-config", type=Path, required=True)
    parser.add_argument(
        "--targets", type=Path,
        default=Path(__file__).with_name("deployment-targets.json"),
    )
    args = parser.parse_args()
    try:
        print(json.dumps(deploy(args), ensure_ascii=False))
        return 0
    except (ReleaseError, OSError, ValueError, subprocess.TimeoutExpired) as exc:
        print(json.dumps({"status": "DEPLOY_FAILED", "reason": str(exc)}, ensure_ascii=False), file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
