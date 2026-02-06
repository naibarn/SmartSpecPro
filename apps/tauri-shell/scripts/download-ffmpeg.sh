#!/usr/bin/env bash
set -euo pipefail

# Downloads FFmpeg/FFprobe static builds for the current platform.
# Run this before `cargo tauri build`.
#
# Usage:
#   ./scripts/download-ffmpeg.sh                   # auto-detect platform
#   ./scripts/download-ffmpeg.sh aarch64-apple-darwin  # explicit target
#
# The binaries are placed in ../binaries/ with Tauri's naming convention:
#   ffmpeg-{target_triple}[.exe]
#   ffprobe-{target_triple}[.exe]

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BIN_DIR="${SCRIPT_DIR}/../binaries"

mkdir -p "$BIN_DIR"

# Detect target triple
if [ $# -ge 1 ]; then
    TARGET="$1"
else
    ARCH="$(uname -m)"
    OS="$(uname -s)"
    case "$OS" in
        Darwin)
            case "$ARCH" in
                arm64) TARGET="aarch64-apple-darwin" ;;
                x86_64) TARGET="x86_64-apple-darwin" ;;
                *) echo "Unsupported macOS arch: $ARCH"; exit 1 ;;
            esac
            ;;
        Linux)
            case "$ARCH" in
                x86_64) TARGET="x86_64-unknown-linux-gnu" ;;
                aarch64) TARGET="aarch64-unknown-linux-gnu" ;;
                *) echo "Unsupported Linux arch: $ARCH"; exit 1 ;;
            esac
            ;;
        MINGW*|MSYS*|CYGWIN*)
            TARGET="x86_64-pc-windows-msvc"
            ;;
        *)
            echo "Unsupported OS: $OS"
            exit 1
            ;;
    esac
fi

echo "Target: $TARGET"
echo "Output: $BIN_DIR"

# Check if binaries already exist
FFMPEG_BIN="$BIN_DIR/ffmpeg-${TARGET}"
FFPROBE_BIN="$BIN_DIR/ffprobe-${TARGET}"

if [[ "$TARGET" == *"windows"* ]]; then
    FFMPEG_BIN="${FFMPEG_BIN}.exe"
    FFPROBE_BIN="${FFPROBE_BIN}.exe"
fi

if [ -f "$FFMPEG_BIN" ] && [ -f "$FFPROBE_BIN" ]; then
    echo "Binaries already exist:"
    echo "  $FFMPEG_BIN"
    echo "  $FFPROBE_BIN"
    echo "Delete them first to re-download."
    exit 0
fi

echo ""
echo "=== FFmpeg Download Instructions ==="
echo ""
echo "Download static FFmpeg and FFprobe builds for your platform and place them at:"
echo "  $FFMPEG_BIN"
echo "  $FFPROBE_BIN"
echo ""
echo "Recommended sources:"
echo "  macOS:   https://evermeet.cx/ffmpeg/"
echo "  Windows: https://github.com/BtbN/FFmpeg-Builds/releases"
echo "  Linux:   https://johnvansickle.com/ffmpeg/"
echo ""
echo "After downloading, rename the binaries to match the Tauri naming convention:"
echo "  ffmpeg  -> ffmpeg-${TARGET}"
echo "  ffprobe -> ffprobe-${TARGET}"
echo ""
echo "Then make them executable (macOS/Linux):"
echo "  chmod +x $FFMPEG_BIN $FFPROBE_BIN"
echo ""

# TODO: Automate download for CI/CD
# For now this script serves as documentation and placeholder.
# Automated download can be added later with curl/wget + checksums.
