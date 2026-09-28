# Feature 162/163 Gap Closure Implementation Plan

## Wave 0 — baseline and ownership

Record the dirty worktree and keep an explicit owned-file list. SocratiCode is
unavailable, so use targeted `rg`, symbol reads, focused tests, and `git diff
--check`. Do not stage or rewrite unrelated release/application changes.

## Wave 1 — server contracts, access, workflow policy, and migration

Conductor-owned serial schema step:

- Extend shared Worker Series projections with `canBind`, `canProcess`, and
  `canPublish`, while preserving existing fields.
- Add additive binding metadata columns and foreign keys for pinned jobs.
- Add normalized workflow registry/policy/resolution records or a typed JSONB
  policy companion if existing admin persistence patterns require it. Include
  tenant, operation, version, default, allowlist, lock/override, required
  capabilities, audit, and active/revision constraints.
- Add a server workflow policy service and admin procedures with safe previews,
  audit, and rollback. Use current domain-admin procedure conventions.
- Upgrade the Worker access resolver to use connected-device owner when
  available, explicit sharing policy for group/tenant modes, owner > group >
  tenant precedence, and fail-closed unresolved identity. Recheck action
  capabilities in every route.
- Add contract tests, migration dry-run/invariant tests, and policy resolver
  tests before dependent waves.

## Wave 2 — shot dispatch and artifact lifecycle

- Add a server mutation/route that accepts a typed shot request from the Web
  storyboard, validates Series/episode/shot ownership and revision, resolves
  current binding/capability/policy, and inserts an idempotent Worker job.
- Add server status/projection queries for shot job, workflow resolution, QC,
  artifact, and stale/revoked state.
- Reuse the existing publication proof and media asset/index lifecycle, adding
  generated-shot provenance and shot binding metadata without changing legacy
  B-roll rows.
- Add service/router tests for valid admission, stale revision, missing frame,
  disallowed workflow, idempotent replay, revoked binding, and publication.

## Wave 3 — native MCP and analysis

- Refactor the MCP stdio client into typed negotiation: current/stateless MCP
  support, legacy initialize support, `tools/list` pagination, valid input
  schema validation, workflow capability extraction, and fail-closed errors.
- Advertise only live validated workflow IDs/capabilities in heartbeat.
- Persist remote execution ID/checkpoint and add bounded poll/cancel/reconcile
  behavior around the typed tool result.
- Extend local analysis with bounded probe/scene/silence/black/frozen/blur
  evidence and subject-focus candidates. Add batch plan generation with stable
  source fingerprints and safe derived workspace confinement.
- Keep provider/MCP output verification, FFprobe QC, checksum, and publication
  lineage intact. Add Rust tests and fixture tests for each failure boundary.

## Wave 4 — storyboard Shot Inspector

- Add a presentational generated-shot control/drawer to the existing nine-shot
  storyboard, not nine full editors. It displays mode, workflow policy,
  compatible workflow candidates, resolution revision, start frame, ordered
  references, budget, and independent generated-shot/B-roll status.
- Connect the drawer to the new server mutation/status path. Keep existing
  provider `onGenerateVideoClip` as a clearly separate action.
- Cover loading, empty, stale, blocked, processing, QC, ready, retry, cancel,
  revoked, focus restoration, keyboard labels, reduced motion, and responsive
  layout with focused component tests and browser evidence.

## Wave 5 — canonical Worker App screens

- Replace the shell's legacy five-tab filter with a real sidebar over the
  canonical route registry. Mount separate screen components for Overview,
  Series, Binding, Media Workspace, Queue, Published, AI/Workflows,
  Runtime/GPU, Connection/Access, and Settings.
- Keep old `connection`, `render`, `hermes`, and `settings` tab IDs as aliases.
- Move shared Series/root/job state to the existing Worker context/coordinator;
  screens remain projections and never start duplicate loops.
- Add batch inventory selection, processing queue, published/index state, and
  workflow/runtime capability summaries. Do not render absolute paths or
  secrets. Add UI tests and accessibility/responsive checks.

## Wave 6 — integration and hardening

- Run focused Web/shared tests, Worker TypeScript, Rust tests, migration/journal
  checks, and browser/native checks where available.
- Perform five audit rounds plus two clean convergence rounds after fixes.
- Record static proof separately from live ComfyUI/MiniMax, GPU, R2, vector,
  packaged Tauri, browser, and production proof. Do not deploy or restart.
