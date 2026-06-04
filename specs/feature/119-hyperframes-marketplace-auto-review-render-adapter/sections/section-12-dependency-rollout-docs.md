# Section 12: Dependency Rollout and Documentation

## Goal

Plan the dependency, runtime, rollout, documentation, and rollback work needed before HyperFrames can move from contract/service planning into production execution.

This section intentionally delays package installation until dependency and runtime checks are complete.

This section has two execution slices:

- **Preflight slice**: dependency audit, doctor command, runtime decision, and
  worker/container readiness. This slice must complete before Section 05 installs
  or executes HyperFrames packages.
- **Closeout slice**: docs, runbook, rollout stages, rollback proof, and release
  evidence. This slice completes after the implementation and release gates.

## In Scope

- HyperFrames dependency audit.
- Runtime doctor checks.
- Worker/container runtime requirements.
- Worker/browser isolation requirements.
- Credit/cost/quota and storage path documentation.
- Environment flags.
- Rollout stages.
- Operational docs and rollback runbook.

## Files To Create

- `apps/web/server/services/hyperframesDependencyAudit.ts`
- `apps/web/server/services/__tests__/hyperframesDependencyAudit.test.ts`
- `apps/web/scripts/hyperframes-doctor.mjs` or equivalent existing script style
- `apps/web/scripts/hyperframes-dependency-audit.mjs` or equivalent existing script style
- `apps/web/scripts/hyperframes-fixture-render.mjs` or equivalent existing script style
- `apps/web/scripts/hyperframes-snapshot-test.mjs` or equivalent existing script style
- `docs/hyperframes-marketplace-auto-review.md`
- `docs/runbooks/hyperframes-marketplace-auto-review.md` if runbooks exist

## Existing Files To Review

- `apps/web/package.json`
- `apps/web/package-lock.json`
- root `package.json`
- root `package-lock.json`
- `apps/web/Dockerfile`
- `docker/Dockerfile.node-api`
- CI workflow files
- deploy workflow files
- existing docs/runbooks directory structure

## Test First

Add failing tests/checks for:

- feature flags default off;
- dependency audit requires pinned versions;
- license/provenance metadata is recorded;
- native/postinstall scripts are reviewed;
- doctor detects Node, browser/headless runtime, FFmpeg/FFprobe, fonts, storage, temp workspace, and HyperFrames availability;
- fixture render command creates playable output, manifest, snapshots, and cleans temporary workspace;
- snapshot test command verifies golden frames, long Thai text, CTA, disclosure, and 9:16 safe areas;
- worker disabled state preserves Standard Order;
- rollback flags stop new jobs while existing Library items remain accessible.
- docs/runbook include credit/cost/quota, storage paths, isolation boundaries, exact retention defaults, and template governance.

Preflight checks before Section 05:

- package names and exact versions are known or explicitly deferred;
- no `@hyperframes/*` package is added to the main app bundle unless the audit
  approves that boundary;
- local/dev CLI path and production `@hyperframes/producer` worker path are
  documented as separate runtime modes;
- doctor can run without secrets and can report missing Chrome/FFmpeg/fonts;
- worker/container decision records whether production rendering runs in a
  dedicated worker image, sidecar job, or disabled state.

## Preflight Deliverables

Before Section 05 runtime execution starts, this section must produce:

- dependency audit result covering package names, pinned versions, license,
  provenance, native/postinstall behavior, and main-bundle exclusion;
- doctor result covering Node, HyperFrames CLI/runtime, Chrome/headless shell,
  FFmpeg/FFprobe, fonts, temp workspace, and storage access;
- runtime mode decision for local/dev CLI and production worker/container;
- pass/partial/fail gate result with the allowed Section 05 implementation scope;
- Standard Order regression proof for dependency failed, worker off, and flags
  off states;
- documented reason when package install or runtime execution is deferred.

## Dependency Audit

Before adding packages:

- confirm exact HyperFrames package names and versions;
- pin versions in lockfile;
- review license terms;
- review transitive dependencies;
- review native binaries and postinstall scripts;
- record expected browser/runtime dependencies;
- record FFmpeg/FFprobe requirements;
- record font dependencies;
- confirm CI/container runtime compatibility;
- confirm bundle impact if any client-side packages are considered.

The preferred first implementation should keep HyperFrames runtime server/worker-side only.

Preflight gate result:

- `pass`: Section 05 may implement worker execution and fixture render hooks;
- `partial`: Section 05 may implement contracts, queue state, and disabled-worker
  projections, but must not execute HyperFrames runtime;
- `fail`: keep HyperFrames UI hidden/disabled and continue only with shared
  contracts and Standard Order regression tests.

## Runtime Doctor

Doctor should check:

- Node version;
- package installation;
- HyperFrames CLI/runtime availability;
- browser/headless-shell availability if required;
- FFmpeg/FFprobe;
- font availability;
- temp workspace write/read/cleanup;
- storage access;
- fixture composition lint;
- fixture snapshot;
- fixture render if dependencies are installed.

Doctor output must avoid secrets and signed URLs.

## Worker and Browser Isolation Requirements

Production rollout must document and verify:

- render worker runs in a dedicated container/job, not the web request thread;
- worker uses tenant/run scoped temp directories;
- worker denies network access after asset staging when possible;
- worker mounts only controlled work/output directories;
- CPU, memory, duration, frame count, and output size are capped;
- browser preview uses sandbox/CSP/trusted player boundary;
- composition HTML cannot read cookies/localStorage or call SmartSpecPro APIs;
- all user-visible diagnostics are redacted.

## Environment Flags

Required MVP flags:

- `MARKETPLACE_HYPERFRAMES_ENABLED`;
- `MARKETPLACE_HYPERFRAMES_TENANT_ALLOWLIST`;
- `MARKETPLACE_HYPERFRAMES_RENDER_WORKER_ENABLED`;
- `MARKETPLACE_HYPERFRAMES_ALLOW_LIBRARY_SAVE`;

Optional hardening flags:

- `MARKETPLACE_HYPERFRAMES_OPERATOR_ENABLED`;
- `MARKETPLACE_HYPERFRAMES_TEMPLATE_ALLOWLIST`;
- `MARKETPLACE_HYPERFRAMES_MAX_CONCURRENT_JOBS`;
- `MARKETPLACE_HYPERFRAMES_PREVIEW_RETENTION_HOURS`;

All flags default to the safest non-running state.

## MVP Policy Decisions

Implement these defaults unless a later product decision changes them:

- one primary `Create Auto Storyboard Review` action on Product Detail;
- backend auto plan queues HyperFrames preview when eligible;
- render engine/template/platform controls are collapsed advanced overrides;
- CLI in local/dev diagnostics, `@hyperframes/producer` in production worker after dependency gates pass;
- built-in templates only in V1;
- preview artifacts expire after 7 days unless saved to Library;
- quota-first accounting, then credit billing after render cost metrics are known;
- composition source is internal-only in V1;
- 9:16 launch first, then 1:1 and 16:9 after e2e and snapshot evidence;
- regulated/high-risk claim categories require user review before auto queue unless compliance marks the run safe;
- Marketplace Auto Review outbox/artifact tables are the MVP runtime ledger;
- burn-in subtitles first, sidecar subtitles only after Library metadata/download UX are confirmed.

These MVP decisions resolve the spec's initial open questions for implementation
planning. Any different product decision must update this section, the spec
decision log, and affected tests before code implementation changes behavior.

## Rollout Stages

1. Contracts and tests with all flags off.
2. Auto plan and UI hidden behind flags.
3. Local/dev doctor and fixture render.
4. Staging worker with fixture-only render.
5. Internal tenant Auto Storyboard Review preview.
6. Internal tenant Library save.
7. Limited tenant allowlist.
8. 1:1 platform profile after e2e and snapshot evidence.
9. Captioned final composite after generated clip, subtitle/audio, and final QA evidence.
10. Broader rollout after observability and support review.

## Documentation

Docs should cover:

- purpose and non-goals;
- Auto vs Standard user behavior;
- API and service architecture;
- feature flags;
- dependency/runtime requirements;
- MVP policy decisions;
- credit/cost/quota estimate and duplicate-charge policy;
- storage path and retention policy;
- worker/browser isolation boundaries;
- template governance lifecycle;
- worker operation;
- staging and QA policy;
- retention policy;
- operator controls;
- troubleshooting;
- rollback.

## Rollback Runbook

Rollback steps:

1. Disable Auto flag.
2. Disable worker flag.
3. Stop new preview/final render jobs.
4. Cancel queued/running jobs where safe.
5. Preserve completed Library items.
6. Purge preview/transient artifacts according to retention.
7. Disable affected templates if rollback is template-specific.
8. Confirm Standard Order still starts.
9. Review metrics and dead-letter queue.

## Acceptance Criteria

- Dependency and runtime requirements are known before package install.
- The preflight slice gates Section 05 runtime execution and records pass,
  partial, or fail before worker code executes HyperFrames.
- Doctor gives actionable pass/fail output.
- Flags default off and support rollback.
- Docs and runbook are ready before production enablement.
- Standard Order remains the fallback path in every rollout stage.

## Rollback Notes

If dependency/runtime risk is too high, stop at server contracts and UI-disabled state. No user-facing Standard Order behavior should be impacted.

## UI/UX Contract

### Target User / JTBD

Users need a safe rollout where Auto may be enabled gradually, while Standard Order stays available during dependency, worker, or runtime issues.

### Surface Inventory

| Surface | Rollout impact |
|---|---|
| Product Detail | flag-controlled Auto visibility and Standard fallback |
| Storyboard Review | flag-controlled preview/result panel |
| MediaStudio | flag-controlled finalize/resume support |
| Library | finalized assets remain accessible after rollback |
| Docs/runbook | operator and support guidance |

### Component Map

| Component | Rollout dependency |
|---|---|
| Auto plan summary | feature flag/access projection |
| Render panel | worker flag and doctor readiness |
| Library save controls | Library save flag |
| Operator controls | operator flag and permission |

### State Matrix

| State | Expected UI behavior |
|---|---|
| flags off | Standard Order unchanged |
| worker off | Auto blocked, Standard available |
| Library save off | preview usable, save disabled |
| dependency failed | Auto unavailable with safe copy |
| rollback active | no new jobs, completed Library items visible |

### Responsive Matrix

| Viewport | Requirement |
|---|---|
| mobile | disabled/rollback copy remains concise |
| tablet | fallback actions remain visible |
| desktop | support/runbook-linked diagnostics stay secondary |

### Accessibility Acceptance

Disabled and rollback states must be announced clearly and not hide keyboard access to Standard Order.

### Copy Contract

Rollout copy should explain availability at a user level, not expose package, container, or worker internals.

### Browser Evidence Required

Pre-release evidence must include flags off, worker off, Library save off, and rollback/fallback states.
