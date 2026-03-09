#!/usr/bin/env bash

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
TARGET_DIR="${SKILLS_HOME:-$HOME/.codex}/skills"
MANIFEST_FILE="${ROOT_DIR}/skills/mirrored-skills.txt"

mkdir -p "${TARGET_DIR}"
cp "${ROOT_DIR}/skills/BACKUP-PLAYBOOK.md" "${TARGET_DIR}/BACKUP-PLAYBOOK.md"

while IFS= read -r skill; do
  [[ -z "${skill}" ]] && continue
  if [[ ! -d "${ROOT_DIR}/skills/${skill}" ]]; then
    echo "missing repo skill: ${ROOT_DIR}/skills/${skill}" >&2
    exit 1
  fi

  rm -rf "${TARGET_DIR:?}/${skill}"
  cp -r "${ROOT_DIR}/skills/${skill}" "${TARGET_DIR}/${skill}"
  echo "published ${skill}"
done < "${MANIFEST_FILE}"
