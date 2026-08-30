# Plan self-review round 3 — lifecycle and failure recovery

## Findings

- The plan described checkpoints but did not enumerate remote/local split-brain
  cases or publication behavior after unbind.
- Long video processing needs bounded work units and resumability between
  probe, analysis, render, upload, and index stages.

## Fix applied

Added monotonic stage transitions, remote execution reconciliation, revoke
drain/quarantine behavior, bounded batch checkpoints, and no partial Ready
state.

Status: fixed.
