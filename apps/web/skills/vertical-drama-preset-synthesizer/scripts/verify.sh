#!/usr/bin/env bash
# App-safe `vdflow validate` equivalent. NO paid provider calls.
set -euo pipefail
BUNDLE="$(cd "$(dirname "$0")/.." && pwd)"
echo "[vdflow-validate] bundle=${BUNDLE}"
python3 - "$BUNDLE" <<'PY'
import json, os, sys, glob
bundle = sys.argv[1]
errors = []

for f in glob.glob(os.path.join(bundle, "**", "*.json"), recursive=True):
    try:
        with open(f, "r", encoding="utf-8") as fh:
            json.load(fh)
    except Exception as e:
        errors.append(f"invalid JSON: {os.path.relpath(f, bundle)}: {e}")

tests_path = os.path.join(bundle, "tests", "tests.json")
with open(tests_path, encoding="utf-8") as fh:
    tests = json.load(fh)

def load(rel):
    with open(os.path.join(bundle, rel), encoding="utf-8") as fh:
        return json.load(fh)

def dig(obj, path):
    cur = obj
    for part in path.split("."):
        if isinstance(cur, dict) and part in cur:
            cur = cur[part]
        else:
            return (False, None)
    return (True, cur)

pass_out = load(tests["fixtures"]["pass_output"])
for field in tests.get("required_top_level_output_fields", []):
    if field not in pass_out:
        errors.append(f"pass output missing required top-level field: {field}")

for path, expected in tests.get("pinned_literals", {}).items():
    ok, val = dig(pass_out, path)
    if not ok or val != expected:
        errors.append(f"pinned literal mismatch {path}: expected {expected!r} got {val!r}")

fail_out = load(tests["fixtures"]["fail_output"])
violated = any(field not in fail_out for field in tests.get("required_top_level_output_fields", []))
for path, expected in tests.get("pinned_literals", {}).items():
    ok, val = dig(fail_out, path)
    if not ok or val != expected:
        violated = True
if not violated:
    errors.append("fail_output fixture does not violate any declared constraint")

md = tests.get("pinned_metadata", {})
for k, v in {
    "category": "video_prompt_generation",
    "execution_mode": "llm-only",
    "auto_trigger": False,
    "enabled_by_default": False,
    "credit_multiplier": 1,
    "strict_provider_pin": False,
    "contract_version": 1,
}.items():
    if md.get(k) != v:
        errors.append(f"pinned_metadata.{k} expected {v!r} got {md.get(k)!r}")

if errors:
    print("[vdflow-validate] FAIL")
    print("\n".join(errors))
    sys.exit(1)
print("[vdflow-validate] OK (no provider calls made)")
PY
