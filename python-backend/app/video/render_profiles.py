"""Render profile definitions for the video rendering pipeline.

Each profile maps to a set of FFmpeg encoding parameters that control
output quality, file size, and encoding speed.
"""
from dataclasses import dataclass


@dataclass(frozen=True)
class RenderProfile:
    """FFmpeg encoding parameters for a render quality level."""

    name: str
    video_codec: str
    preset: str
    crf: int
    scale: str  # FFmpeg scale filter value, e.g., "640:-2" or "original"
    audio_codec: str
    audio_bitrate: str
    approx_video_bitrate: str  # For documentation/estimation only


PROFILES: dict[str, RenderProfile] = {
    "preview": RenderProfile(
        name="preview",
        video_codec="libx264",
        preset="ultrafast",
        crf=28,
        scale="640:-2",
        audio_codec="aac",
        audio_bitrate="128k",
        approx_video_bitrate="1M",
    ),
    "standard": RenderProfile(
        name="standard",
        video_codec="libx264",
        preset="medium",
        crf=23,
        scale="original",
        audio_codec="aac",
        audio_bitrate="192k",
        approx_video_bitrate="5M",
    ),
    "high": RenderProfile(
        name="high",
        video_codec="libx264",
        preset="slow",
        crf=18,
        scale="original",
        audio_codec="aac",
        audio_bitrate="256k",
        approx_video_bitrate="10M",
    ),
}


def get_ffmpeg_output_args(profile: RenderProfile) -> list[str]:
    """Build FFmpeg output arguments from a render profile.

    Always includes -movflags +faststart and -pix_fmt yuv420p.
    """
    args = [
        "-c:v", profile.video_codec,
        "-preset", profile.preset,
        "-crf", str(profile.crf),
        "-pix_fmt", "yuv420p",
        "-movflags", "+faststart",
        "-c:a", profile.audio_codec,
        "-b:a", profile.audio_bitrate,
        "-ar", "48000",
    ]
    if profile.scale != "original":
        args = ["-vf", f"scale={profile.scale}"] + args
    return args
