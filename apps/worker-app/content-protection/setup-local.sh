#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$ROOT/../../.." && pwd)"
PYTHON="${CONTENT_PROTECTION_PYTHON:-$REPO_ROOT/python-backend/.venv/bin/python}"
VIDEOSEAL_COMMIT="870ca7fb33578b90f14c602016b6c2788096226e"
PROVIDER_VENV="$ROOT/.venv"

if [[ ! -x "$PYTHON" ]]; then
  echo "Set CONTENT_PROTECTION_PYTHON to the Python runtime containing torch: $PYTHON" >&2
  exit 1
fi

if [[ ! -x "$PROVIDER_VENV/bin/python" ]]; then
  python3 -m venv --system-site-packages "$PROVIDER_VENV"
fi

PIP="$PROVIDER_VENV/bin/pip"
"$PIP" install --disable-pip-version-check --upgrade pip
"$PIP" install --disable-pip-version-check --no-deps \
  "torchvision==0.25.0" \
  "git+https://github.com/facebookresearch/videoseal.git@$VIDEOSEAL_COMMIT" \
  PyWavelets av calflops decord einops lpips omegaconf opencv-python pandas requests \
  pycocotools pytorch_msssim scikit-image tensorboard "timm==0.9.16" \
  antlr4-python3-runtime==4.9 lazy_loader future ffmpeg-python

PROVIDER_SITE="$(find "$PROVIDER_VENV/lib" -type d -name site-packages -print -quit)"
CONFIG_TMP="$(mktemp -d)"
trap 'rm -rf "$CONFIG_TMP"' EXIT
git init --quiet "$CONFIG_TMP/videoseal"
git -C "$CONFIG_TMP/videoseal" remote add origin https://github.com/facebookresearch/videoseal.git
git -C "$CONFIG_TMP/videoseal" fetch --quiet --depth 1 origin "$VIDEOSEAL_COMMIT"
git -C "$CONFIG_TMP/videoseal" checkout --quiet FETCH_HEAD
mkdir -p "$PROVIDER_SITE/videoseal/configs"
cp -R "$CONFIG_TMP/videoseal/configs/." "$PROVIDER_SITE/videoseal/configs/"

PROVIDER_SITE="$PROVIDER_SITE" PYTHONPATH="$PROVIDER_SITE" CONTENT_PROTECTION_MODEL_DIR="$REPO_ROOT/ckpts" "$PYTHON" - <<'PY'
import torch
import videoseal

model = videoseal.load("videoseal")
model.eval()
print(f"VideoSeal ready: torch={torch.__version__}, device={next(model.parameters()).device}")
PY

echo "Local Content Protection provider is ready."
echo "Start Worker App with: $ROOT/run-worker-local.sh"
