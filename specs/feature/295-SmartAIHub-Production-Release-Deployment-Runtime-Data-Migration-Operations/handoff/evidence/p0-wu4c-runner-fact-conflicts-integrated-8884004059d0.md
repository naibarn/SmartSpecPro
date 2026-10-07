# P0-WU-4C Runner fact conflict checkpoint — SPEC-295

- PR #166 implementation: `d7c2930c003bb5af2ec9739301e17839a9022759`; merge: `02f4ae88f8dbdd5bafa693aefff3dc11b860dbd0`.
- PR #167 implementation: `420c9d80d4369800d6ab83c70e230c61b10ae689`; merge: `8884004059d061b0d19177c60f2916d1757dc975`.
- PRs: https://github.com/naibarn/SmartSpecPro/pull/166 and https://github.com/naibarn/SmartSpecPro/pull/167
- RunnerGateway regression: 17 passed.
- Scope: signed Runner snapshot facts cannot change under an already accepted revision; reused idempotency keys with changed facts are rejected; DB transaction rechecks idempotency and revision claims to preserve the current fact under concurrent submissions.
- Classification: partial cross-host fact conflict hardening. It does not establish complete cross-host conflict precedence or complete P0 acceptance. `P0_CODE_IMPLEMENTATION = PARTIAL`.
