#!/usr/bin/env bash

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SOURCE_DIR="${CODEX_HOME:-$HOME/.codex}/skills"
MANIFEST_FILE="${ROOT_DIR}/skills/mirrored-codex-skills.txt"

while IFS= read -r skill; do
  [[ -z "${skill}" ]] && continue
  if [[ ! -d "${SOURCE_DIR}/${skill}" ]]; then
    echo "missing source skill: ${SOURCE_DIR}/${skill}" >&2
    exit 1
  fi

  rm -rf "${ROOT_DIR}/skills/${skill}"
  cp -r "${SOURCE_DIR}/${skill}" "${ROOT_DIR}/skills/${skill}"
  echo "synced ${skill}"
done < "${MANIFEST_FILE}"
