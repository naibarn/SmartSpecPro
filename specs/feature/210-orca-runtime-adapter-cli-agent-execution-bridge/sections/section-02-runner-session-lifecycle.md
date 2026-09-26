# Section 02 — Runner Session Lifecycle

Extend existing `runnerGateway.ts`, `runnerControl.ts` and Rust protocol only
through `sah-runner-v1` authenticated commands. Add create/attach/prompt/
observe/cancel/kill with sequence, idempotency and fencing. Tests must cover
identity mismatch, stale generation, duplicate command and reconnect. No public
direct Orca/provider channel is allowed.

