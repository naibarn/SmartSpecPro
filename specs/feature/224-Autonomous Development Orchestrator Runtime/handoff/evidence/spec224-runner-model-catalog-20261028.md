# SPEC-224 Runner event diagnostics and model catalog — 2026-10-28

Integrated source: `5af4ab6496f87f74a09b39bb007134c9d6022e5a` on `refs/heads/main`.

## Implemented

- Capability event rejection logs and ACKs now carry the validated event type, protocol version, authenticated Runner session, capability revision, sequence, correlation ID, and safe rejection code.
- Known lower-case internal error codes are normalized to the uppercase contract expected by Runner. This prevents the Runner from replacing a meaningful reason with `RUNNER_EVENT_REJECTED`.
- The Debian Runner discovers Codex models through the supported app-server `model/list` JSON-RPC method and reads account context through `account/read`. Account email is used only as input to a SHA-256 account/provider fingerprint; it is not returned or persisted.
- Catalog data is projected through the Runner capability snapshot and contract validator. It records model IDs, display labels, input modalities, reasoning effort options, CLI version, source, revision, account-scope state, and snapshot expiry. Catalog visibility remains `unverified_catalog_only`; it is not entitlement evidence. Failed discovery has an explicit error state.

## Verification

- `JWT_SECRET=runner-control-test-secret-32-chars-minimum pnpm --dir apps/web exec vitest run server/routes/__tests__/runnerControl.test.ts` — 25 passed.
- `JWT_SECRET=runner-control-test-secret-32-chars-minimum pnpm --dir apps/web exec vitest run server/services/__tests__/runnerContracts.test.ts` — 15 passed.
- `cargo test --manifest-path apps/runner-app/Cargo.toml --locked --lib adapters::tests -- --test-threads=1` — 28 passed, 1 ignored.
- Codex CLI `0.165.0` on Debian was queried through app-server `model/list`; it returned 8 catalog entries with display names and supported reasoning options. The app-server documentation warns that this list can be bundled and is not an entitlement check.

## Remaining acceptance gaps

No new signed Runner package was installed, no live Control Plane rejection was re-observed, and no new server ACK was collected. The exact rejection from the configured remote endpoint therefore remains unverified; after this server change is available to that endpoint, inspect the new stage/reason/session/revision fields. The Rust discovery path has parser and contract coverage, but no end-to-end user selection, selected-model verification, persisted Goal authority, or real execution using a pinned model is implemented by this checkpoint. Task Control UI remains owned by Session C. No production deploy was performed.
