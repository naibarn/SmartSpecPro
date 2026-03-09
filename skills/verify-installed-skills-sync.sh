#!/usr/bin/env bash

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
TARGET_DIR="${SKILLS_HOME:-$HOME/.codex}/skills"
MANIFEST_FILE="${ROOT_DIR}/skills/mirrored-skills.txt"

fail() {
  echo "installed skill sync verification failed: $*" >&2
  exit 1
}

[[ -d "${TARGET_DIR}" ]] || fail "missing installed skill directory: ${TARGET_DIR}"
[[ -f "${TARGET_DIR}/BACKUP-PLAYBOOK.md" ]] || fail "missing installed BACKUP-PLAYBOOK.md"

while IFS= read -r skill; do
  [[ -z "${skill}" ]] && continue
  [[ -d "${ROOT_DIR}/skills/${skill}" ]] || fail "missing repo mirror skill: ${ROOT_DIR}/skills/${skill}"
  [[ -d "${TARGET_DIR}/${skill}" ]] || fail "missing installed skill: ${TARGET_DIR}/${skill}"
  diff -qr "${ROOT_DIR}/skills/${skill}" "${TARGET_DIR}/${skill}" >/dev/null || fail "drift detected for ${skill}"
done < "${MANIFEST_FILE}"

echo "installed skill sync verified"
