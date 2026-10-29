# SPEC-224 Debian Runner Model Catalog Runtime — 2026-10-29

## Source and artifact

- Integrated source: `ffc367b845be7ca6f23d19719138fba585695e0f` (`main` == `origin/main` at build time).
- Build: `SAH_RUNNER_BUILD_VERSION=0.2.52-spec224-catalog-ffc367b845be7ca6f23d19719138fba585695e0f SAH_RUNNER_SOURCE_SHA=ffc367b845be7ca6f23d19719138fba585695e0f cargo build --release --manifest-path apps/runner-app/Cargo.toml --bins`.
- Installed Runner: `0.2.52-spec224-catalog-ffc367b845be7ca6f23d19719138fba585695e0f`; SHA-256 `a97052e35b1c5630db17fbf672b3b0e5ee7ea737ad6fdf170b5c45f6793ab596`.
- Session host SHA-256: `4b98931cf76f3f2250395bff68f75654d8115e9897e0185b296c6311a5ff9414`.
- Prior installed Runner: `0.2.51-spec224-probe-retry-20261028a`; rollback executable is preserved at `/home/dev/.local/share/smartaihub-runner-dev/rollback/spec224-modelcatalog-20261029/smartaihub-runner-0.2.51-spec224-probe-retry-20261028a`. Prior session host, base unit and development drop-in are also preserved there. The existing installer supports in-place `upgrade`; no Runner re-enrollment occurred.
- Local device release was used; `desktop-review` 503 (`runner_release_github_not_configured`) was not on this install path. No production release or traffic changes occurred.

## Runtime evidence

- Existing Runner ID remains `runner-f1328901deec1b147d200a818e12e4be`; server session remains `27a7a2a1-45b2-4f6d-a34d-fcb72e120d0e`.
- On 2026-10-29 00:42:45Z, the development Control Plane acknowledged capability publication as `applied`, with `executionReadiness=capability_ready` and snapshot revision `snapshot:runner-f1328901deec1b147d200a818e12e4be:2026-10-29T00:42:44.452Z`.
- Read-only query of `smartspec_dev.runner_nodes` confirmed the same Runner is `online` and `trusted`; snapshot observed at `00:42:44.452Z`, expires at `00:47:44.452Z`, and reports the new version.
- Catalog source is `codex_app_server_model_list`, state `discovered`, verification state `unverified_catalog_only`, with eight models: `gpt-5.6-luna`, `gpt-5.6-sol`, `gpt-5.6-terra`, `gpt-6-astra`, `gpt-6-luna`, `gpt-6-sol`, `gpt-6.1-sol`, `gpt-6.1-terra`.
- A fresh read-only Codex `account/read` fingerprint matched the fingerprint in the persisted live snapshot; the account email was not emitted. Current Task Control source in the development checkout is at the integrated source SHA and the database is `smartspec_dev`.
- Runner workspace registry hash stayed `c00b86e2d7d07be433580a204ae4695500eab434a4f5addc4a5fe054f5d3bc4b`; the existing systemd development drop-in hash stayed `e90b13ed923c0eb465937b7286abfde01201a7f3fa6a914b6706396542c9b39f`.

## Defect and repair

The first upgraded binary sent a Codex `not_ready` placeholder catalog on every non-Codex tool row. The server correctly rejected the entire snapshot because the catalog adapter did not match the tool adapter. `apps/runner-app/src/diagnostics.rs` now emits no catalog (`null`) for non-Codex adapters and keeps the discovered or not-ready catalog only on `codex.v1`. A snapshot generated from the current local Runner state was validated against `validateRunnerCapabilitySnapshot`; the resulting snapshot passed and contained one Codex catalog with eight models.

## Checks

- Rust: `cargo test --release --manifest-path apps/runner-app/Cargo.toml --lib codex_app_server_catalog -- --nocapture` — 2 passed, 0 failed, 1 opt-in live test ignored by the suite. Separately performed a read-only live `account/read` and `model/list` discovery; eight models returned.
- Node contracts and Runner routes: `JWT_SECRET=test-jwt-secret-32-chars-minimum-1234567890 pnpm --dir apps/web exec vitest run server/services/__tests__/runnerContracts.test.ts server/routes/__tests__/runnerControl.test.ts` — 44 passed.
- Task Control catalog, workspace read model and panel: `JWT_SECRET=test-jwt-secret-32-chars-minimum-1234567890 pnpm --dir apps/web exec vitest run client/src/components/chat/Spec224WorkspacePanel.test.tsx server/routers/__tests__/spec226DevelopmentControl.test.ts server/services/spec224WorkspaceSpecSet.test.ts` — 79 passed.
- A wider four-file regression command also ran `UniversalControlPlanePanel.test.tsx`: 96 passed, 1 failed. Its standalone-flow test expected an accessible `สร้างงานใหม่` button and did not find it. This is outside the catalog source diff and remains a separate Task Control regression to investigate.
- Authenticated Playwright could not run: no browser session/storage state was available on this Debian host. No authenticated model-selection result is claimed.

## Pilot state and next action

- Read-only check of tenant `tenant-001` in `smartspec_dev` found 0 SPEC-224 worker jobs, 0 active SPEC-224 jobs and 0 active leases. The existing handoff's Approval Authority check found no pending/approved Goal Grant; this runtime upgrade did not create one.
- Runtime release and catalog delivery are verified, but Task Control authenticated selection and the real Goal remain unverified. The owner must open development Task Control, select the existing online Runner and registered Platform Engineering workspace, choose a currently catalogued Codex model and supported effort, start the bounded Goal, then approve its actual Goal Grant through the existing approval flow. After that, resume the durable Goal/Run through the existing authority; do not create synthetic grants, jobs or receipts.
- SPEC-224 remains incomplete pending authenticated Task Control verification, an owner-approved Goal, genuine Child 1/2 Runner receipts, settlement, automatic continuation and independent Final Verify.
