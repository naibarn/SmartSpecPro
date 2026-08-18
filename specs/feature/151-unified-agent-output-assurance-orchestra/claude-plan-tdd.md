# TDD plan

Each section follows red → minimal implementation → focused verification → review. Tests are written before production code where a new contract or pure validator is introduced.

## Contract foundation

- Red: reject unknown task kinds, unsupported versions, non-canonical hashes, negative budgets, invalid evidence policies, and missing tenant/user/attempt identifiers.
- Green: implement shared schemas and canonical hash utilities in Node/Python.
- Refactor: align field names and error codes; add current/current-minus-one fixtures.

## Deterministic assurance

- Red: ambiguous/blurred references, extra people, missing face visibility, contradictory custom/position cues, oversized Kie prompts, expired/reused/mismatched side-effect tokens, cycles and budget overflow.
- Green: pure validators and a stable finding taxonomy.
- Refactor: ensure validators are side-effect free and deterministic.

## SDK seam and Node gate

- Red: mismatched envelope hash, unverified manifest, over-budget runner, Agency origin, provider profile mismatch, and provider submission without authorization.
- Green: adapter/orchestrator and final-gate integration using existing traces/checkpoints.
- Refactor: preserve old clients through optional additive fields and clear terminal states.

## Replay and migration

- Red: duplicate event cursor, stale resume, provider-result-unknown retry, user correction replacing an artifact, Agency active invocation.
- Green: event replay/correction state and read-only migration guard.
- Refactor: redact untrusted content and make reconciliation idempotent.

## Review checklist

- Contract parity is tested in both languages.
- No paid/provider/connector side effect happens before final authorization.
- No silent truncation or reference dropping occurs at provider boundaries.
- Every blocked state has a stable code and user action.
- Existing runtime tests remain green; unrelated dirty files are not staged.
