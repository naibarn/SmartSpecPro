"""File staging between S3/R2 and sandbox."""
import base64
import hashlib
import shlex
from typing import Any

import structlog

from .client import OpenSandboxClient
from .docker_command_bridge import (
    is_lifecycle_only_error,
    read_file_via_docker_bridge,
    write_file_via_docker_bridge,
)

logger = structlog.get_logger(__name__)
MAX_INLINE_FILE_BYTES = 2 * 1024 * 1024  # 2MB


async def stage_inputs(
    client: OpenSandboxClient,
    sandbox_id: str,
    manifest: list[dict[str, Any]],
    storage_service: Any,
) -> list[dict[str, Any]]:
    """Download files from S3/R2 and upload into sandbox.

    manifest entries: [{"object_key": "...", "sandbox_path": "/workspace/input.mp4", "mime_type": "..."}]
    Returns list of successfully staged entries.
    Logs warning and skips missing objects.
    """
    staged = []
    if storage_service is None:
        logger.warning(
            "sandbox_stage_inputs_storage_missing",
            sandbox_id=sandbox_id,
            manifest_count=len(manifest),
        )
        return staged

    for entry in manifest:
        object_key = entry["object_key"]
        sandbox_path = entry["sandbox_path"]
        try:
            content = await storage_service.download_object(object_key)
            await client.write_file(sandbox_id, sandbox_path, content)
            staged.append(entry)
            logger.info(
                "sandbox_file_staged",
                sandbox_id=sandbox_id,
                object_key=object_key,
                sandbox_path=sandbox_path,
                size_bytes=len(content),
            )
        except Exception as exc:
            if is_lifecycle_only_error(exc):
                try:
                    content = await storage_service.download_object(object_key)
                    await write_file_via_docker_bridge(sandbox_id, sandbox_path, content)
                    staged.append(entry)
                    logger.info(
                        "sandbox_file_staged_via_docker_bridge",
                        sandbox_id=sandbox_id,
                        object_key=object_key,
                        sandbox_path=sandbox_path,
                        size_bytes=len(content),
                    )
                    continue
                except Exception:
                    logger.warning(
                        "sandbox_file_stage_failed_via_docker_bridge",
                        sandbox_id=sandbox_id,
                        object_key=object_key,
                        sandbox_path=sandbox_path,
                        exc_info=True,
                    )
                    continue
            logger.warning(
                "sandbox_file_stage_failed",
                sandbox_id=sandbox_id,
                object_key=object_key,
                sandbox_path=sandbox_path,
                exc_info=True,
            )
    return staged


async def collect_outputs(
    client: OpenSandboxClient,
    sandbox_id: str,
    output_paths: list[str],
    storage_service: Any,
    artifact_bucket: str,
    job_id: str,
) -> list[dict[str, Any]]:
    """Download output files from sandbox and upload to S3/R2.

    Returns list of dicts: [{"sandbox_path": "...", "object_key": "...", "size_bytes": N, "sha256": "..."}]
    Computes SHA-256 checksum for each file.
    """
    collected = []
    for sandbox_path in output_paths:
        try:
            try:
                content = await client.read_file(sandbox_id, sandbox_path)
            except Exception as exc:
                if not is_lifecycle_only_error(exc):
                    raise
                content = await read_file_via_docker_bridge(sandbox_id, sandbox_path)

            sha256 = hashlib.sha256(content).hexdigest()

            idx = len(collected)
            filename = sandbox_path.rsplit("/", 1)[-1]
            object_key = f"sandbox-artifacts/{job_id}/{idx:03d}-{filename}"

            if storage_service is not None:
                await storage_service.upload_object(
                    object_key, content, bucket=artifact_bucket
                )

            collected.append(
                {
                    "sandbox_path": sandbox_path,
                    "object_key": object_key,
                    "size_bytes": len(content),
                    "sha256": sha256,
                    "stored": storage_service is not None,
                }
            )
            logger.info(
                "sandbox_output_collected",
                sandbox_id=sandbox_id,
                sandbox_path=sandbox_path,
                object_key=object_key,
                size_bytes=len(content),
            )
        except Exception:
            logger.warning(
                "sandbox_output_collect_failed",
                sandbox_id=sandbox_id,
                sandbox_path=sandbox_path,
                exc_info=True,
            )
    return collected


async def stage_inline_files(
    client: OpenSandboxClient,
    sandbox_id: str,
    inline_files: list[dict[str, Any]],
) -> list[dict[str, Any]]:
    """Write inline base64-encoded files into sandbox filesystem."""
    staged = []
    for entry in inline_files:
        sandbox_path = entry.get("path")
        content_b64 = entry.get("content_base64")
        if not isinstance(sandbox_path, str) or not isinstance(content_b64, str):
            logger.warning(
                "sandbox_inline_file_invalid_entry",
                sandbox_id=sandbox_id,
                entry=str(entry)[:200],
            )
            continue
        try:
            content = base64.b64decode(content_b64, validate=True)
        except Exception:
            logger.warning(
                "sandbox_inline_file_decode_failed",
                sandbox_id=sandbox_id,
                sandbox_path=sandbox_path,
            )
            continue

        if len(content) > MAX_INLINE_FILE_BYTES:
            logger.warning(
                "sandbox_inline_file_too_large",
                sandbox_id=sandbox_id,
                sandbox_path=sandbox_path,
                size_bytes=len(content),
            )
            continue

        try:
            await client.write_file(sandbox_id, sandbox_path, content)
        except Exception as exc:
            if not is_lifecycle_only_error(exc):
                logger.warning(
                    "sandbox_inline_file_stage_failed",
                    sandbox_id=sandbox_id,
                    sandbox_path=sandbox_path,
                    exc_info=True,
                )
                continue
            try:
                await write_file_via_docker_bridge(sandbox_id, sandbox_path, content)
            except Exception:
                logger.warning(
                    "sandbox_inline_file_stage_failed_via_docker_bridge",
                    sandbox_id=sandbox_id,
                    sandbox_path=sandbox_path,
                    exc_info=True,
                )
                continue

        staged.append({"path": sandbox_path, "size_bytes": len(content)})
        logger.info(
            "sandbox_inline_file_staged",
            sandbox_id=sandbox_id,
            sandbox_path=sandbox_path,
            size_bytes=len(content),
        )

    return staged


async def cleanup_sandbox_files(
    client: OpenSandboxClient,
    sandbox_id: str,
    paths: list[str],
) -> None:
    """Remove specific files from sandbox."""
    if not paths:
        return
    paths_str = " ".join(shlex.quote(p) for p in paths)
    await client.run_command(sandbox_id, f"rm -f {paths_str}", timeout=10)
    logger.info(
        "sandbox_files_cleaned",
        sandbox_id=sandbox_id,
        file_count=len(paths),
    )
