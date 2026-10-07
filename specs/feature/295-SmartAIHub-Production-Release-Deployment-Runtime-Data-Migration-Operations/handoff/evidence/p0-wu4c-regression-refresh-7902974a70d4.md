# Internal Workspace Authority regression refresh

- Canonical source SHA: `7902974a70d4631e51410de67762b1e59ded9bde`
- Coverage: RunnerGateway revocation isolation, Workspace Authority project projection, Drizzle migration evidence, runtime health evidence, Cloudflare runtime evidence, internal runtime evidence, Python cross-host authority and local workspace authority.
- Verification: six focused Vitest files — 36 passed; `test_runtime_authority` plus `test_workspace_authority` — 82 passed.
- Classification: focused regression evidence only. Safe-action authenticated API/Runner dispatch and remaining lifecycle producers are still open; `P0_CODE_IMPLEMENTATION` stays `PARTIAL`.
- External production runtime verification: `NOT_RUN`.
