# P0-WU-4C Runner idempotency checkpoint — SPEC-293

- PR: https://github.com/naibarn/SmartSpecPro/pull/170
- Implementation commit: `f36c85d11271fa1f5a34f2a70629680ffbd8982d`
- Integrated merge commit: `8b6e23602de8341593586e6e25beb554443287b7`
- Verification: RunnerGateway suite 17/17 passed.
- Scope: rejected same idempotency key with different Runner facts, with transaction-level recheck and stable current fact retention.
- Status: partial internal hardening only. `P0_CODE_IMPLEMENTATION = PARTIAL`.
