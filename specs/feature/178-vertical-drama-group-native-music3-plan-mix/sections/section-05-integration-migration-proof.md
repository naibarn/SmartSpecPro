# Section 05 — Integration, Migration and Proof

## Goal

Connect the completed Web and Worker flow, apply the additive migration safely,
and prove the feature with bounded checks plus explicit runtime/browser gates.

## Ownership paths

- migration ledger/state under `apps/web/drizzle/`
- Web shared/service/router/UI tests from sections 01–04
- Worker TypeScript/Rust tests from section 03
- focused browser smoke/evidence scripts already used by this repository
- release/runtime documentation for Worker capability and MiniMax GPU setup

## Implementation requirements

1. Inspect dirty worktree and stage only Feature 178 files when publication is
   requested; preserve unrelated changes.
2. Apply the additive Drizzle migration to the configured PostgreSQL database,
   verify migration ledger and table/index/FK state, and run deterministic
   backfill/readiness checks. Do not mutate user creative plans or retry paid
   terminal jobs during verification.
3. Run focused Web Vitest suites for contracts/schema/services/router/UI, Worker
   TypeScript tests and focused Rust tests. Respect the RAM constraint: do not
   run `npm run check` unless the user separately removes that constraint.
4. Run `git diff --check`, targeted TypeScript/esbuild/import parsing and Worker
   build/package checks as resources permit. A passing source check is not a
   claim of authenticated deployment proof.
5. Run a no-credit queue/lease/callback smoke using fixtures. Separately run the
   real Worker runtime gate on the target RTX 5060 Ti 16 GB machine with genuine
   MiniMax Music 3 installed; record model identity, GPU capability, artifacts,
   FFmpeg mix and QC. If unavailable, leave the state truthfully blocked.
6. Capture authenticated Production-tab browser evidence at all required
   viewports for empty/readiness, pending, blocked, published and read-only
   states. Verify that the heading appears at the supplied pre-assembly state.
7. Report residual risks separately: hosted bundle/cache/authentication,
   migration environment, real provider/GPU runtime, or any skipped viewport.
8. Verify `verticalDramaGroupNativeMusic3` is default-off, keeps the readiness
   heading visible, and blocks group mutation/admission until compatible Web/
   Worker contracts and the real GPU feasibility gate pass.

## TDD/acceptance stubs

- End-to-end fixture advances Web approval → Worker queue → ASR/edit-map → Music
  take → score mix/QC → published projection.
- Duplicate requests produce one durable job and one charge decision.
- Stale group/callback cannot publish.
- Migration and rollback visibility preserve existing episode rows/manifests.
- Browser route shows the empty heading and group-native card states.
- Flag-off route shows the heading but no group mutation or Worker admission.

## UI/UX Contract

### Target User / JTBD

The producer needs proof that the Production tab reflects the same durable
group/job/artifact state that the Worker completed.

### Surface Inventory

Proof covers the Production route, Worker status projection and migration-backed
readiness; deployment/auth/runtime evidence is kept distinct.

### Component Map

Web router/service, group panel, Worker job/artifact callback and database
migration form one traceable path from approval to published mix.

### State Matrix

Evidence must cover empty, pending, blocked, failed, published and read-only;
real MiniMax unavailable remains truthfully blocked.

### Responsive Matrix

Capture 390x844, 768x1024, 1440x900, 360x800, 1024x768 and 1280x800 without
horizontal overflow or clipped primary actions.

### Accessibility Acceptance

Browser proof includes keyboard/focus and readable status/error content; skipped
auth or browser evidence is recorded, never implied to pass.

### Copy Contract

Reports preserve deterministic error text and explicitly say when evidence is a
fixture, hosted-shell-only, unauthenticated or real GPU/provider output.

### Browser Evidence Required

Attach authenticated screenshots/trace for each state or list the exact missing
environment gate and its owner.

## Exit criteria

All focused checks pass, migration state is verified, no-credit integration is
green, and real/browser evidence is either attached or explicitly marked as a
remaining environment gate. No claim of complete production runtime is made
without genuine artifact/QC evidence.
