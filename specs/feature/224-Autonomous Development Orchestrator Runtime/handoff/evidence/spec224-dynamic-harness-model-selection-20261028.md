# Dynamic Harness Model Selection — partial checkpoint

Source: `988909d0583462bcc5e8289b7fbc4a5eb70a70d2` (integrated on `origin/main`).

## Implemented

- Codex app-server `model/list` projection now retains the advertised default model and default reasoning effort; catalog revision covers defaults, capabilities, and supported efforts. Catalog visibility remains explicitly unverified for entitlement.
- Added Codex adapter refresh, capability lookup, and selected-model/account revalidation interfaces. Before execution the Runner refreshes the account-scoped catalog, rejects changed accounts, removed models, or unsupported reasoning efforts, then launches the pinned model via `--model` and per-process `-c model_reasoning_effort=...`. It does not alter global `config.toml`.
- SPEC-224 resolves Auto to the catalog default or validates an explicit model from the trusted Runner snapshot, persists the resolved selection on DevelopmentRun, includes it in Goal approval, and carries it through the existing Agent manifest and canonical Runner command. Child job construction retains the persisted choice.

## Focused evidence

- `JWT_SECRET=... pnpm exec vitest run server/services/__tests__/spec224ModelSelection.test.ts server/services/__tests__/runnerJobCommandContracts.test.ts server/services/__tests__/spec224DevelopmentRunContracts.test.ts server/services/__tests__/agentControlPlaneContracts.test.ts server/services/__tests__/externalAgentRunnerDispatcher.test.ts server/services/__tests__/runnerContracts.test.ts` — 6 files, 59 passed.
- `cargo test --manifest-path apps/runner-app/Cargo.toml --locked --lib external_agent::tests -- --test-threads=1` — 3 passed.
- `cargo test --manifest-path apps/runner-app/Cargo.toml --locked --lib adapters::tests::codex_app_server_catalog -- --test-threads=1` — 2 passed.
- Opt-in live read-only `model/list` test on the installed authenticated Codex CLI — 1 passed; confirms account-scoped catalog response only, not entitlement or inference.
- `git diff --cached --check` passed before integration.

## Remaining acceptance

This is a partial backend slice. Task Control picker/refresh UI is owned by Session C and is not included. No connected PostgreSQL integration or bounded Codex task was run; no model inference was started. Account catalog discovery is not entitlement proof. P0 live Runner event acknowledgment against the configured endpoint remains unverified, and the existing SPEC-293 run/attempt path-scoped writer lease remains a prerequisite to live Goal/source admission. Do not claim live acceptance.
