#!/usr/bin/env bash

lifecycle_load_repository_policy() {
  local repository_root="$1"
  local policy_path="${CODEX_SOURCE_POLICY:-}"
  local policy_json
  local -a policy_args=(policy --repository "$repository_root")
  [[ -z "$policy_path" ]] || policy_args+=(--policy "$policy_path")
  policy_json="$(python3 "$repository_root/scripts/development-lifecycle/canonical_source.py" "${policy_args[@]}")" || return
  LIFECYCLE_REPOSITORY_ID="$(POLICY_JSON="$policy_json" python3 -c 'import json,os; print(json.loads(os.environ["POLICY_JSON"])["repository_id"])')"
  LIFECYCLE_REMOTE="$(POLICY_JSON="$policy_json" python3 -c 'import json,os; print(json.loads(os.environ["POLICY_JSON"])["remote"])')"
  LIFECYCLE_CANONICAL_REF="$(POLICY_JSON="$policy_json" python3 -c 'import json,os; print(json.loads(os.environ["POLICY_JSON"])["canonical_ref"])')"
}
