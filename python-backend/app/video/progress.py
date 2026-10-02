"""FFmpeg progress parsing helpers for container log reporting."""


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
