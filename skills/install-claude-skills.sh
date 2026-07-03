#!/usr/bin/env bash

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
python3 "${ROOT_DIR}/skills/portable_install.py" install-claude-skills "$@"
