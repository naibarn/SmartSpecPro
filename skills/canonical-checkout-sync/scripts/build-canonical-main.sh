#!/usr/bin/env bash
set -euo pipefail

REPO="${1:-$PWD}"
shift || true
REPO="$(git -C "$REPO" rev-parse --show-toplevel)"
POLICY_PATH="$REPO/.development-repository.toml"
if [[ ! -f "$POLICY_PATH" ]]; then
  echo "STATUS=REPOSITORY_POLICY_MISSING PATH=$POLICY_PATH" >&2
  exit 20
fi

mapfile -t POLICY_VALUES < <(python3 - "$POLICY_PATH" <<'PY'
import sys
import tomllib
from pathlib import Path

data = tomllib.loads(Path(sys.argv[1]).read_text(encoding="utf-8"))
repository = data.get("repository", {})
for key in ("remote", "canonical_ref"):
    value = str(repository.get(key, "")).strip()
    if not value:
        raise SystemExit(f"repository.{key} is required")
    print(value)
PY
)
REMOTE="${POLICY_VALUES[0]}"
CANONICAL_REF="${POLICY_VALUES[1]}"

# Load the build controller itself from canonical history so a stale session
# branch cannot run an older builder implementation.
git -C "$REPO" fetch --no-tags "$REMOTE" "$CANONICAL_REF" >/dev/null
CANONICAL_SHA="$(git -C "$REPO" rev-parse 'FETCH_HEAD^{commit}')"
TEMP_DIR="$(mktemp -d "${TMPDIR:-/tmp}/canonical-main-build.XXXXXX")"
trap 'rm -rf -- "$TEMP_DIR"' EXIT
git -C "$REPO" show "$CANONICAL_SHA:scripts/development-lifecycle/canonical_source.py" > "$TEMP_DIR/canonical_source.py"
git -C "$REPO" show "$CANONICAL_SHA:.development-repository.toml" > "$TEMP_DIR/repository.toml"

echo "[central-build] builder_revision=$CANONICAL_SHA canonical_ref=$CANONICAL_REF" >&2
python3 "$TEMP_DIR/canonical_source.py" build \
  --repository "$REPO" \
  --policy "$TEMP_DIR/repository.toml" \
  "$@"
