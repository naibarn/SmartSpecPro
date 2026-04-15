#!/usr/bin/env python3
from __future__ import annotations

import argparse
import datetime
import hashlib
import json
import os
import platform
import shutil
import stat
import subprocess
import sys
import urllib.request
from pathlib import Path

SCRIPT_DIR = Path(__file__).resolve().parent
APP_ROOT = SCRIPT_DIR.parent
TAURI_ROOT = APP_ROOT / "src-tauri"
RESOURCE_MODELS_DIR = TAURI_ROOT / "resources" / "litert-lm-models"
RUNTIME_METADATA_DIR = TAURI_ROOT / "resources" / "litert-lm-runtime"
RUNTIME_METADATA_PATH = RUNTIME_METADATA_DIR / "bundle-manifest.json"
RUNTIME_VENV_DIR = RUNTIME_METADATA_DIR / "venv"
LITERT_LM_PYPI_SPEC = "litert-lm==0.10.1"

PROFILE_SPECS = {
    "gemma4-e2b-tauri-fast": {
        "repo": "litert-community/gemma-4-E2B-it-litert-lm",
        "file": "gemma-4-E2B-it.litertlm",
        "checksum_sha256": "ab7838cdfc8f77e54d8ca45eadceb20452d9f01e4bfade03e5dce27911b27e42",
    },
    "gemma4-e4b-tauri-balanced": {
        "repo": "litert-community/gemma-4-E4B-it-litert-lm",
        "file": "gemma-4-E4B-it.litertlm",
        "checksum_sha256": "f335f2bfd1b758dc6476db16c0f41854bd6237e2658d604cbe566bcefd00a7bc",
    },
}

BUNDLE_MODE_TO_PROFILES = {
    "on-demand": [],
    "e2b": ["gemma4-e2b-tauri-fast"],
    "e4b": ["gemma4-e4b-tauri-balanced"],
    "all": ["gemma4-e2b-tauri-fast", "gemma4-e4b-tauri-balanced"],
}


def detect_target_triple() -> str:
    machine = platform.machine().lower()
    system = platform.system().lower()

    if system == "darwin":
        if machine in {"arm64", "aarch64"}:
            return "aarch64-apple-darwin"
        if machine in {"x86_64", "amd64"}:
            return "x86_64-apple-darwin"
    if system == "linux":
        if machine in {"x86_64", "amd64"}:
            return "x86_64-unknown-linux-gnu"
        if machine in {"aarch64", "arm64"}:
            return "aarch64-unknown-linux-gnu"
    if system == "windows":
        return "x86_64-pc-windows-msvc"

    raise SystemExit(f"Unsupported platform for LiteRT-LM bundle prep: {system}/{machine}")


def runtime_validation_error(binary_path: Path) -> str | None:
    try:
        result = subprocess.run(
            [str(binary_path), "--help"],
            capture_output=True,
            text=True,
            timeout=20,
            check=False,
        )
    except OSError as exc:
        return f"failed to start: {exc}"
    except subprocess.TimeoutExpired:
        return "validation timed out"

    combined = f"{result.stdout}\n{result.stderr}".strip()
    if result.returncode == 0:
        return None

    if "not found" in combined or "error while loading shared libraries" in combined:
        return combined

    return f"exit code {result.returncode}: {combined}"


def validate_binary_runtime(binary_path: Path) -> None:
    validation_error = runtime_validation_error(binary_path)
    if validation_error is None:
        return
    raise SystemExit(
        f"LiteRT-LM binary {binary_path.name} failed runtime validation: {validation_error}"
    )


def has_command(command: str) -> bool:
    return shutil.which(command) is not None


def resolve_venv_python_path(venv_dir: Path) -> Path:
    candidates = [
        venv_dir / "bin" / "python",
        venv_dir / "bin" / "python3",
        venv_dir / "Scripts" / "python.exe",
    ]
    for candidate in candidates:
        if candidate.is_file():
            return candidate
    raise SystemExit(f"Could not locate Python inside LiteRT-LM runtime venv: {venv_dir}")


def resolve_venv_litert_executable_path(venv_dir: Path) -> Path:
    candidates = [
        venv_dir / "bin" / "litert-lm",
        venv_dir / "Scripts" / "litert-lm.exe",
        venv_dir / "Scripts" / "litert-lm",
    ]
    for candidate in candidates:
        if candidate.is_file():
            return candidate
    raise SystemExit(f"Could not locate litert-lm executable inside runtime venv: {venv_dir}")


def resolve_venv_litert_library_dir(venv_dir: Path) -> Path:
    candidates = list(venv_dir.glob("lib/python*/site-packages/litert_lm"))
    candidates.extend(
        [
            venv_dir / "Lib" / "site-packages" / "litert_lm",
            venv_dir / "lib" / "site-packages" / "litert_lm",
        ]
    )
    for candidate in candidates:
        if candidate.is_dir():
            return candidate
    raise SystemExit(f"Could not locate LiteRT-LM shared libraries inside runtime venv: {venv_dir}")


def prepare_runtime_venv() -> tuple[Path, Path]:
    if RUNTIME_VENV_DIR.exists():
        shutil.rmtree(RUNTIME_VENV_DIR)
    RUNTIME_METADATA_DIR.mkdir(parents=True, exist_ok=True)

    if has_command("uv"):
        subprocess.run(
            ["uv", "venv", str(RUNTIME_VENV_DIR)],
            check=True,
        )
    else:
        subprocess.run(
            [sys.executable, "-m", "venv", str(RUNTIME_VENV_DIR)],
            check=True,
        )

    python_path = resolve_venv_python_path(RUNTIME_VENV_DIR)
    if has_command("uv"):
        subprocess.run(
            ["uv", "pip", "install", "--python", str(python_path), LITERT_LM_PYPI_SPEC],
            check=True,
        )
    else:
        subprocess.run(
            [str(python_path), "-m", "pip", "install", "--upgrade", "pip"],
            check=True,
        )
        subprocess.run(
            [str(python_path), "-m", "pip", "install", LITERT_LM_PYPI_SPEC],
            check=True,
        )

    litert_executable = resolve_venv_litert_executable_path(RUNTIME_VENV_DIR)
    current_mode = litert_executable.stat().st_mode
    litert_executable.chmod(current_mode | stat.S_IXUSR | stat.S_IXGRP | stat.S_IXOTH)
    validate_binary_runtime(litert_executable)

    library_dir = resolve_venv_litert_library_dir(RUNTIME_VENV_DIR)
    return litert_executable, library_dir


def huggingface_download_url(repo: str, file_name: str) -> str:
    return f"https://huggingface.co/{repo}/resolve/main/{file_name}?download=1"


def sha256_hex_for_file(path: Path) -> str:
    hasher = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            hasher.update(chunk)
    return hasher.hexdigest()


def download_model(profile_id: str) -> Path:
    spec = PROFILE_SPECS[profile_id]
    target_dir = RESOURCE_MODELS_DIR / profile_id
    target_dir.mkdir(parents=True, exist_ok=True)
    target_path = target_dir / spec["file"]
    if target_path.is_file():
        checksum = sha256_hex_for_file(target_path)
        if checksum.lower() == spec["checksum_sha256"].lower():
            return target_path
        target_path.unlink(missing_ok=True)

    url = huggingface_download_url(spec["repo"], spec["file"])
    partial = target_path.with_suffix(target_path.suffix + ".partial")
    request = urllib.request.Request(
        url,
        headers={"User-Agent": "SmartAIHub-Tauri/0.1"},
    )
    print(f"Downloading {profile_id} from {url}")
    with urllib.request.urlopen(request) as response, partial.open("wb") as output:
        shutil.copyfileobj(response, output)

    if partial.stat().st_size < 1_000_000:
        partial.unlink(missing_ok=True)
        raise SystemExit(f"Downloaded model for {profile_id} is unexpectedly small")

    actual_checksum = sha256_hex_for_file(partial)
    if actual_checksum.lower() != spec["checksum_sha256"].lower():
        partial.unlink(missing_ok=True)
        raise SystemExit(
            f"Checksum mismatch for {profile_id}: expected {spec['checksum_sha256']}, got {actual_checksum}"
        )

    partial.replace(target_path)
    return target_path


def prune_model_resources(selected_profiles: list[str]) -> None:
    RESOURCE_MODELS_DIR.mkdir(parents=True, exist_ok=True)
    for profile_id in PROFILE_SPECS:
        profile_dir = RESOURCE_MODELS_DIR / profile_id
        if profile_id not in selected_profiles and profile_dir.exists():
            shutil.rmtree(profile_dir)
    placeholder = RESOURCE_MODELS_DIR / "README.md"
    placeholder.write_text(
        "# LiteRT-LM bundled models\n\n"
        "This directory may stay empty in `on-demand` mode. SmartAIHub downloads managed Gemma 4 `.litertlm` files here or into the app-managed runtime storage when needed.\n",
        encoding="utf-8",
    )


def resolve_bundle_mode(args: argparse.Namespace) -> tuple[str, list[str]]:
    if args.bundle_mode:
        return args.bundle_mode, list(BUNDLE_MODE_TO_PROFILES[args.bundle_mode])

    if args.skip_model_download:
        return "on-demand", []

    if args.profiles:
        selected_profiles = list(dict.fromkeys(args.profiles))
        inferred = next(
            (
                bundle_mode
                for bundle_mode, bundle_profiles in BUNDLE_MODE_TO_PROFILES.items()
                if bundle_profiles == selected_profiles
            ),
            "custom",
        )
        return inferred, selected_profiles

    return "e2b", ["gemma4-e2b-tauri-fast"]


def write_runtime_manifest(
    runtime_executable: Path | None,
    runtime_library_dir: Path | None,
    target: str,
    bundle_mode: str,
    profiles: list[str],
    runtime_kind: str,
    skipped_reason: str | None = None,
) -> None:
    RUNTIME_METADATA_DIR.mkdir(parents=True, exist_ok=True)
    payload = {
        "runtimeKind": runtime_kind,
        "runtimePackageSpec": LITERT_LM_PYPI_SPEC if runtime_executable else None,
        "relativeExecutablePath": (
            str(runtime_executable.relative_to(RUNTIME_METADATA_DIR))
            if runtime_executable else None
        ),
        "relativeLibraryDir": (
            str(runtime_library_dir.relative_to(RUNTIME_METADATA_DIR))
            if runtime_library_dir else None
        ),
        "binaryTarget": target,
        "binarySourceName": runtime_executable.name if runtime_executable else None,
        "bundleMode": bundle_mode,
        "bundledProfiles": profiles,
        "preparedAt": datetime.datetime.now(datetime.UTC).isoformat().replace("+00:00", "Z"),
        "skippedReason": skipped_reason,
    }
    RUNTIME_METADATA_PATH.write_text(
        json.dumps(payload, indent=2, sort_keys=True) + "\n",
        encoding="utf-8",
    )


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Prepare bundled LiteRT-LM runtime resources and optional Gemma 4 models for Tauri."
    )
    parser.add_argument(
        "--binary",
        help="Deprecated. Bundling now uses a self-contained uv-managed LiteRT-LM runtime.",
    )
    parser.add_argument("--target", help="Explicit Rust target triple for sidecar naming")
    parser.add_argument(
        "--profile",
        action="append",
        dest="profiles",
        choices=sorted(PROFILE_SPECS.keys()),
        help="Gemma 4 profile to bundle as a resource (repeatable)",
    )
    parser.add_argument(
        "--bundle-mode",
        choices=sorted(BUNDLE_MODE_TO_PROFILES.keys()),
        help="Release packaging mode: on-demand ships only LiteRT-LM, while e2b/e4b/all pre-bundle Gemma 4 model files.",
    )
    parser.add_argument(
        "--skip-model-download",
        action="store_true",
        help="Prepare only the LiteRT-LM binary sidecar and skip model downloads",
    )
    args = parser.parse_args()

    target = args.target or detect_target_triple()
    if args.binary:
        print(
            "--binary is deprecated for Tauri Gemma 4 bundling; preparing a self-contained uv runtime instead."
        )
    bundle_mode, profiles = resolve_bundle_mode(args)
    if "windows" in target:
        prune_model_resources([])
        print(
            "Skipping bundled LiteRT-LM runtime on Windows. "
            "This desktop build will rely on cloud-backed features instead of a bundled Gemma runtime."
        )
        if profiles:
            print(
                f"Requested bundle mode {bundle_mode}, but no Gemma model files will be embedded for target {target}."
            )
        write_runtime_manifest(
            None,
            None,
            target,
            bundle_mode,
            [],
            runtime_kind="unsupported_host",
            skipped_reason="windows_litert_runtime_unavailable",
        )
        return

    runtime_executable, runtime_library_dir = prepare_runtime_venv()
    print(f"Bundled LiteRT-LM runtime executable: {runtime_executable}")
    print(f"Bundled LiteRT-LM runtime libraries: {runtime_library_dir}")

    prune_model_resources(profiles)

    if profiles:
        for profile_id in profiles:
            model_path = download_model(profile_id)
            print(f"Bundled Gemma model: {model_path}")
    else:
        print("Bundle mode is on-demand; no Gemma model files are embedded in this build.")

    write_runtime_manifest(
        runtime_executable,
        runtime_library_dir,
        target,
        bundle_mode,
        profiles,
        runtime_kind="uv_venv",
    )


if __name__ == "__main__":
    main()
