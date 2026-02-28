"""File staging between S3/R2 and sandbox."""
import hashlib
import shlex
from typing import Any

import structlog

from .client import OpenSandboxClient

logger = structlog.get_logger(__name__)


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
        except Exception:
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
            content = await client.read_file(sandbox_id, sandbox_path)
            sha256 = hashlib.sha256(content).hexdigest()

            # Determine object key from job_id, index, and filename
            idx = len(collected)
            filename = sandbox_path.rsplit("/", 1)[-1]
            object_key = f"sandbox-artifacts/{job_id}/{idx:03d}-{filename}"

            await storage_service.upload_object(
                object_key, content, bucket=artifact_bucket
            )

            collected.append(
                {
                    "sandbox_path": sandbox_path,
                    "object_key": object_key,
                    "size_bytes": len(content),
                    "sha256": sha256,
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
