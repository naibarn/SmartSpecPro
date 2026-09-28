#!/usr/bin/env bash
set -euo pipefail
cmp -s "$(dirname "$0")/../skill.md" "$(dirname "$0")/../SKILL.md"
test -s "$(dirname "$0")/../input.schema.json"
test -s "$(dirname "$0")/../output.schema.json"
test -s "$(dirname "$0")/../ui.schema.json"
test -s "$(dirname "$0")/../skill.lock.json"
