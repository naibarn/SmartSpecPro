"""Progress reporting for video rendering jobs.

Publishes structured JSON messages to Redis pub/sub channel
media-job-progress:{jobId}. The Node.js SSE endpoint subscribes
to this channel and forwards updates to the browser client.
"""
import json
import re


def report_render_progress(
    redis_client,
    job_id: str,
    progress: float,
    stage: str,
    message: str = "",
) -> None:
    """Publish a progress update to the Redis channel."""
    status_data = {
        "jobId": job_id,
        "status": "running",
        "progress": min(max(progress, 0.0), 1.0),
        "stage": stage,
        "message": message,
    }
    redis_client.set(f"media-job:{job_id}:status", json.dumps(status_data), ex=86400)
    redis_client.publish(f"media-job-progress:{job_id}", json.dumps(status_data))


def report_render_done(redis_client, job_id: str, result: dict) -> None:
    """Report render job completion."""
    done_status = {"jobId": job_id, "status": "done", "progress": 1.0, "result": result}
    redis_client.set(f"media-job:{job_id}:result", json.dumps(result), ex=86400)
    redis_client.set(f"media-job:{job_id}:status", json.dumps(done_status), ex=86400)
    redis_client.publish(f"media-job-progress:{job_id}", json.dumps(done_status))


def report_render_error(redis_client, job_id: str, message: str) -> None:
    """Report render job failure."""
    error_data = {"code": "RENDER_ERROR", "message": message}
    error_status = {"jobId": job_id, "status": "error", "progress": 0, "message": message}
    redis_client.set(f"media-job:{job_id}:error", json.dumps(error_data), ex=86400)
    redis_client.set(f"media-job:{job_id}:status", json.dumps(error_status), ex=86400)
    redis_client.publish(f"media-job-progress:{job_id}", json.dumps(error_status))


def parse_ffmpeg_stderr_progress(line: str, total_duration_us: int) -> float | None:
    """Parse FFmpeg progress from stderr output.

    Looks for 'out_time_us=' in FFmpeg -progress pipe:1 output.
    Returns a float 0.0-1.0 or None if line is not a progress line.
    """
    if line.startswith("out_time_us="):
        try:
            out_us = int(line.split("=", 1)[1])
            if total_duration_us > 0:
                return min(out_us / total_duration_us, 1.0)
        except ValueError:
            pass
    return None
