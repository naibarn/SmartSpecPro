# Plan/Spec Completeness Review Round 5

## Scope

This review applies the clarified security rule:

- one Worker App token set must be valid for one machine/installation only;
- copied tokens must not let another machine connect to SmartAIHub;
- replay or wrong-device use should block/revoke the affected connection.

## Findings And Fixes Applied

### 1. Bearer Token Replay Risk

Finding: the previous plan used short-lived access tokens and rotating refresh
tokens, but bearer token possession alone would still allow a copied token to be
replayed from another machine during its lifetime.

Fix:

- `claude-spec.md` now requires one approved worker token set to be bound to one
  Worker App installation/device.
- `claude-plan.md` now requires a per-install device key pair or equivalent
  proof-of-possession secret stored in OS secure storage.
- Authenticated worker requests must include device proof bound to timestamp,
  nonce/request id, method, path, token `jti`, and body hash where practical.

### 2. Replay Blocking Behavior

Finding: the plan needed explicit behavior when copied tokens are used.

Fix:

- Copied access tokens without the original device proof are rejected.
- Copied refresh tokens, refresh-token reuse, repeated device-key mismatch, or
  replayed proof revoke/block the connection and require fresh browser approval.
- Worker App clears tokens when server reports device proof mismatch/replay.

### 3. Tests And Operations

Finding: the security rule needed tests and admin/audit visibility.

Fix:

- Added TDD tests for token/device binding, wrong-device token use, refresh
  replay, stale/reused nonce, wrong method/path, and wrong token `jti`.
- Added Worker App tests for per-install device key secure storage and request
  signing.
- Added admin/audit requirements for token replay, device proof mismatch,
  refresh-token reuse, and auto-blocked connections.

## Result

The plan now treats worker tokens as device-bound proof-of-possession tokens, not
plain bearer credentials that can be copied to another machine.
