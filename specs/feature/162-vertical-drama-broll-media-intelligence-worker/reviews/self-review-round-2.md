# Plan self-review round 2 — security and tenant boundaries

## Findings

- Source manifest labels and local fingerprints could accidentally become
  identifying telemetry if the plan did not explicitly redact them.
- Artifact verification needed to re-check current binding/policy, not only
  trust the job snapshot.

## Fix applied

Added explicit redaction, server-derived identity, current binding/policy
recheck at publication, and rejection of stale/revoked root or Series
contexts to the plan.

Status: fixed.
