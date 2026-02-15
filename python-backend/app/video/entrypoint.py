"""Cloud Run Job entrypoint for video rendering.

Reads the render specification from the RENDER_SPEC environment variable
(JSON-encoded), executes the two-stage FFmpeg pipeline, uploads the result
to R2, updates the database, and exits.

Environment variables:
    RENDER_SPEC: JSON-encoded RenderSpec
    R2_ACCESS_KEY, R2_SECRET_KEY, R2_ACCOUNT_ID: R2 credentials
    R2_BUCKET_NAME: Target bucket name
    DATABASE_URL: Neon Postgres connection string
    REDIS_MEMORYSTORE_URL: For progress reporting via pub/sub
"""
import json
import os
import sys
import tempfile

import structlog

logger = structlog.get_logger()


def main(render_spec_dict: dict | None = None):
    """Main entrypoint for the video-job-runner Cloud Run Job.

    Args:
        render_spec_dict: If provided, use this directly instead of reading
            from the RENDER_SPEC environment variable. Used by the inline
            fallback path to avoid os.environ race conditions.
    """
    if render_spec_dict is not None:
        render_spec = render_spec_dict
    else:
        render_spec_json = os.environ.get("RENDER_SPEC")
        if not render_spec_json:
            logger.error("missing_render_spec", message="RENDER_SPEC env var not set")
            sys.exit(1)

        try:
            render_spec = json.loads(render_spec_json)
        except json.JSONDecodeError as e:
            logger.error("invalid_render_spec", error=str(e))
            sys.exit(1)

    render_hash = render_spec.get("renderHash", "")
    profile_name = render_spec.get("profile", "standard")
    output_key = render_spec.get("outputKey", f"renders/{profile_name}/{render_hash}.mp4")
    job_id = render_spec.get("jobId", render_hash)

    logger.info(
        "render_job_start",
        render_hash=render_hash,
        profile=profile_name,
        output_key=output_key,
        job_id=job_id,
    )

    # Set up Redis for progress reporting
    redis_client = None
    try:
        import redis
        redis_url = os.environ.get("REDIS_MEMORYSTORE_URL", os.environ.get("REDIS_URL", ""))
        if redis_url:
            redis_client = redis.from_url(redis_url)
    except Exception as e:
        logger.warning("redis_unavailable", error=str(e))

    # Progress helper
    def report_progress(progress: float, stage: str, message: str = ""):
        if redis_client:
            from app.video.progress import report_render_progress
            report_render_progress(redis_client, job_id, progress, stage, message)
        logger.info("render_progress", progress=progress, stage=stage, message=message)

    try:
        from app.core.r2_config import get_r2_client
        r2 = get_r2_client()

        # Idempotency check: does this render already exist?
        try:
            if r2.file_exists(output_key):
                url = r2.config.get_public_url(output_key)
                logger.info("render_cached", render_hash=render_hash, url=url)
                report_progress(1.0, "cached", "Render already exists in R2")
                if redis_client:
                    from app.video.progress import report_render_done
                    report_render_done(redis_client, job_id, {
                        "url": url,
                        "outputKey": output_key,
                        "cached": True,
                    })
                sys.exit(0)
        except Exception as e:
            # Fail-open: if R2 check fails, proceed with rendering
            logger.warning("r2_cache_check_failed", error=str(e))

        report_progress(0.05, "downloading", "Downloading input assets")

        # Create work directory
        with tempfile.TemporaryDirectory(prefix=f"render_{render_hash}_") as work_dir:
            # Download input assets from R2
            input_asset_keys = render_spec.get("inputAssetKeys", {})
            for asset_id, r2_key in input_asset_keys.items():
                local_name = os.path.basename(r2_key)
                local_path = os.path.join(work_dir, local_name)
                try:
                    r2.download_file(r2_key, local_path)
                    logger.info("asset_downloaded", asset_id=asset_id, key=r2_key)
                except Exception as e:
                    logger.error("asset_download_failed", asset_id=asset_id, key=r2_key, error=str(e))
                    raise

            report_progress(0.15, "assembly", "Starting assembly stage")

            # Stage 1: Assembly
            from app.video.pipeline import run_assembly_stage, run_final_render

            def assembly_progress(p: float, stage: str):
                # Map 0-1 to 0.15-0.50
                report_progress(0.15 + p * 0.35, stage)

            assembled_path = run_assembly_stage(render_spec, work_dir, assembly_progress)
            logger.info("assembly_complete", assembled_path=assembled_path)

            report_progress(0.50, "rendering", "Starting final render")

            # Stage 2: Final render
            final_output = os.path.join(work_dir, f"{render_hash}_final.mp4")

            def render_progress(p: float, stage: str):
                # Map 0-1 to 0.50-0.90
                report_progress(0.50 + p * 0.40, stage)

            run_final_render(assembled_path, render_spec, profile_name, final_output, render_progress)
            logger.info("render_complete", output=final_output)

            report_progress(0.92, "uploading", "Uploading to R2")

            # Upload to R2
            url = r2.upload_file(
                final_output,
                output_key,
                content_type="video/mp4",
                metadata={"renderHash": render_hash, "profile": profile_name},
            )
            logger.info("upload_complete", url=url, key=output_key)

            # Get file size for metadata
            file_size = os.path.getsize(final_output)

            report_progress(0.95, "finalizing", "Updating database")

            # Report completion
            result = {
                "url": url,
                "outputKey": output_key,
                "cached": False,
                "fileSize": file_size,
                "profile": profile_name,
                "renderHash": render_hash,
            }

            if redis_client:
                from app.video.progress import report_render_done
                report_render_done(redis_client, job_id, result)

            report_progress(1.0, "done", "Render complete")
            logger.info("render_job_complete", render_hash=render_hash, url=url)

    except Exception as e:
        logger.error("render_job_failed", render_hash=render_hash, error=str(e))
        if redis_client:
            from app.video.progress import report_render_error
            report_render_error(redis_client, job_id, str(e))
        sys.exit(1)


if __name__ == "__main__":
    main()
