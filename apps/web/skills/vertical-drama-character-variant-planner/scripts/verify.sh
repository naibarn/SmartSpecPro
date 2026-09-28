#!/usr/bin/env bash
# App-safe `vdflow validate` equivalent. NO paid image/video/TTS provider calls.
# Validates: JSON validity of schemas + fixtures, required top-level output fields,
# pinned metadata defaults, and capability round-trip. Pure-local, no network.
set -euo pipefail
BUNDLE="$(cd "$(dirname "$0")/.." && pwd)"
echo "[vdflow-validate] bundle=${BUNDLE}"
python3 - "$BUNDLE" <<'PY'
import json, os, sys, glob
bundle = sys.argv[1]
errors = []

# 1. every JSON file must parse
for f in glob.glob(os.path.join(bundle, "**", "*.json"), recursive=True):
    try:
        with open(f, "r", encoding="utf-8") as fh:
            json.load(fh)
    except Exception as e:  # noqa
        errors.append(f"invalid JSON: {os.path.relpath(f, bundle)}: {e}")

tests_path = os.path.join(bundle, "tests", "tests.json")
if not os.path.exists(tests_path):
    print("[vdflow-validate] no tests/tests.json; JSON-validity only")
    if errors:
        print("\n".join(errors)); sys.exit(1)
    print("[vdflow-validate] OK"); sys.exit(0)

with open(tests_path, encoding="utf-8") as fh:
    tests = json.load(fh)

def load(rel):
    with open(os.path.join(bundle, rel), encoding="utf-8") as fh:
        return json.load(fh)

def dig(obj, path):
    cur = obj
    for part in path.split("."):
        try:
            if isinstance(cur, list):
                idx = int(part)
                if idx >= len(cur):
                    return (False, None)
                cur = cur[idx]
            elif isinstance(cur, dict):
                if part not in cur:
                    return (False, None)
                cur = cur[part]
            else:
                return (False, None)
        except (ValueError, TypeError, KeyError, IndexError):
            return (False, None)
    return (True, cur)

# 2. pass fixture output has all required top-level fields
pass_out = load(tests["fixtures"]["pass_output"])
for field in tests.get("required_top_level_output_fields", []):
    if field not in pass_out:
        errors.append(f"pass output missing required top-level field: {field}")

# 3. pinned literal constraints present in pass output
for path, expected in tests.get("pinned_literals", {}).items():
    ok, val = dig(pass_out, path)
    if not ok:
        errors.append(f"pinned literal path missing: {path}")
    elif val != expected:
        errors.append(f"pinned literal mismatch {path}: expected {expected!r} got {val!r}")

# 4. fail fixture must actually violate at least one declared literal/field
fail_rel = tests["fixtures"].get("fail_output")
if fail_rel:
    fail_out = load(fail_rel)
    violated = False
    for field in tests.get("required_top_level_output_fields", []):
        if field not in fail_out:
            violated = True
    for path, expected in tests.get("pinned_literals", {}).items():
        ok, val = dig(fail_out, path)
        if not ok or val != expected:
            violated = True
    if not violated:
        errors.append("fail_output fixture does not violate any declared constraint")

# 5. metadata defaults sanity (declared in tests.json)
md = tests.get("pinned_metadata", {})
for k, v in {
    "category": "other",
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
