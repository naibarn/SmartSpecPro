# Section 01 — Safe worker projection

## Objective

Extend the existing monitor projection without exposing raw job JSON or
changing canonical execution behavior.

## Implementation

1. Add `waiting_external` to `USER_WORKER_JOB_STATUSES`.
2. Add bounded safe orchestration/progress types to `UserWorkerJobSummary`.
3. Select `progressJson` in list/detail reads and implement the same
   tenant/requester predicates for `listUserJobsByIds`.
4. Extract only bounded plan/step/ordinal/total/dependency fields from
   `inputJson.orchestration`; accept only valid job ID shapes and cap the
   dependency list.
5. Extract/clamp progress percent and phase from `progressJson`; let the latest
   safe event remain the freshest event display.

## Tests before code

- Valid metadata is returned; malformed values become null/empty and cannot
  join unrelated groups.
- Progress is finite and clamped; credentials/provider payloads are absent.
- Dependency lookup preserves tenant and requester predicates.
- Existing list/detail tests and cancellation behavior remain green.

## Completion evidence

Run focused monitor service tests and `git diff --check`. Do not run whole-repo
typecheck.
