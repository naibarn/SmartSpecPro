# Chat execution status recovery

Date: 2026-10-29 (Asia/Bangkok)
Integrated source SHA: `92950351bf2f978aa1258d3afa436838694e9c1a`.

## Change

When the authorized work-status or detail query fails, Chat now shows an
accessible alert and a direct retry action. The action refetches both existing
queries and indicates when the retry is in progress. It preserves the error
state and does not convert a failed request into an empty-success state or
change task authorization.

## Verification

- Focused Chat/Task Control regressions: **5 files, 60 tests passed**. This
  includes status-query retry, Thread activity ordering, existing Task Control
  draft recovery, model selection, and Task Observability links.
- `git diff --check` passed before integration.
- Commit `92950351bf2f978aa1258d3afa436838694e9c1a` is reachable from
  `origin/main`.
- Hosted authenticated verification remains separate and is not claimed here.
