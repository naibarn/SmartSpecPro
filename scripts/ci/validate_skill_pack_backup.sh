#!/usr/bin/env bash

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "${ROOT_DIR}"

MANIFEST="skills/mirrored-skills.txt"

if [[ ! -f "${MANIFEST}" ]]; then
  echo "missing manifest: ${MANIFEST}" >&2
  exit 1
fi

fail() {
  echo "skill-pack validation failed: $*" >&2
  exit 1
}

while IFS= read -r skill; do
  [[ -z "${skill}" ]] && continue
  [[ -d "skills/${skill}" ]] || fail "missing mirrored skill directory skills/${skill}"
  if [[ -f "skills/${skill}/SKILL.md" || -f "skills/${skill}/skill.md" || -f "skills/${skill}/README.md" ]]; then
    continue
  fi
  if [[ -f "skills/${skill}/skills/${skill}/SKILL.md" ]]; then
    continue
  fi
  if find "skills/${skill}" -maxdepth 2 -type f -name '*.md' | rg . >/dev/null; then
    continue
  fi
  fail "missing skill entrypoint or support markdown for skills/${skill}"
done < "${MANIFEST}"

[[ -f "skills/BACKUP-PLAYBOOK.md" ]] || fail "missing skills/BACKUP-PLAYBOOK.md"
[[ -f "skills/README.md" ]] || fail "missing skills/README.md"
[[ -x "skills/sync-installed-skills.sh" ]] || fail "sync script is missing or not executable"
[[ -x "skills/publish-to-installed-skills.sh" ]] || fail "publish script is missing or not executable"
[[ -x "skills/verify-installed-skills-sync.sh" ]] || fail "verify script is missing or not executable"
[[ -x "skills/clean-runtime-artifacts.sh" ]] || fail "clean script is missing or not executable"
[[ -x "skills/audit-skills.sh" ]] || fail "audit script is missing or not executable"

if find skills \( -path '*/.venv' -o -path '*/.pytest_cache' -o -path '*/__pycache__' \) -type d -prune | rg . >/dev/null; then
  fail "runtime artifacts found under skills; run skills/clean-runtime-artifacts.sh before packaging"
fi

mapfile -t markdown_files < <(find skills -type f -name '*.md' | sort)

for file in "${markdown_files[@]}"; do
  while IFS= read -r rel; do
    [[ -z "${rel}" ]] && continue
    case "${rel}" in
      *NAME.md|*NNN-*|*section-*.md)
        continue
        ;;
    esac
    target="$(realpath -m "$(dirname "${file}")/${rel}")"
    [[ -f "${target}" ]] || fail "broken markdown reference in ${file}: ${rel}"
  done < <(rg -No '`((?:\.\.?/)+[^`]+\.md)`' "${file}" -r '$1' || true)
done

echo "skill-pack backup validation passed"
