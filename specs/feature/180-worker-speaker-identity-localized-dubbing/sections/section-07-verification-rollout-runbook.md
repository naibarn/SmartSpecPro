# Section 07 — Verification, Rollout and Runbook

> v2 implementation prerequisite: read ../contracts-v2.md and the v2 section dependency graph. Both local and cloud execution are supported through one control plane. Existing v1 scope remains unless explicitly revised there.

## Goal

Prove the feature with focused tests and browser evidence, then release safely behind capability gates.

## Implementation scope

- Add focused Web/Worker Vitest, Python pytest and Playwright/browser-smoke coverage from `claude-plan-tdd.md`.
- Add deterministic fixtures for Thai speech, multi-speaker overlap, no face/body-only, subtitle gaps, music/SFX and manual Silence Cut.
- Add feature flags and provider capability dashboards/diagnostics.
- Add additive migration/rollback checks, minimum Worker runtime compatibility checks and cancellation reconciliation checks.
- Add GPU/VRAM admission, no-subtitle preparation and provider rate-limit retry-after checks.
- Document RTX 5060 Ti 16 GB worker prerequisites, model/license installation, disk/temp space, concurrency, restart/recovery and cleanup.
- Add release gates for UVoice clone API proof, provider pricing/usage reconciliation, consent retention/deletion and separation quality.
- Run `git diff --check`, focused test commands and UI evidence capture; do not require full `npm run check` under the stated RAM constraint.

## Browser evidence checklist

Capture 1440×900, 1280×800, 768×1024 and 390×844 states for source auto-resolution, scan, standalone/Series review, subtitle localization, consent block, UVoice unavailable, separation choice, export progress and QC failure/success. Verify keyboard focus and that switching panel tabs preserves state.

Also capture stale-source rejection, cancellation before/after provider dispatch, unresolved-cue blocking, clone sample-quality rejection and incompatible-worker upgrade guidance.

## TDD stubs

- End-to-end mocked gateway workflow.
- Worker reconnect/resume and no-duplicate-credit tests.
- Accessibility and responsive browser smoke.
- Feature-flag rollout and provider-unavailable tests.
- Diagnostic redaction tests.
- Migration rollback, old-worker/new-server, source-path handoff and cancel-after-dispatch tests.
- No-subtitle workflow, GPU/VRAM capacity and provider rate-limit tests.

## Exit criteria

Focused proof passes, browser evidence is captured, operator runbook is complete, unverified providers remain disabled, and rollout can be reversed without deleting immutable artifacts.

## UI/UX Contract

### Target User / JTBD

Editors and operators need evidence that the workflow is usable, safe, reversible and honestly reports unavailable capabilities.

### Surface Inventory

Browser evidence covers the Media Studio panel, job progress, provider capability, QC result, artifact publication and diagnostics surfaces.

### Component Map

Browser smoke owns interaction evidence; feature flags own rollout; diagnostics own redacted failure details; no test helper may bypass the real UI contract.

### State Matrix

Evidence must cover loading, empty, running, partial, blocked, provider unavailable, retryable failure, terminal failure, success and rollback/disabled states.

### Responsive Matrix

Run evidence at 1440×900, 1280×800, 768×1024 and 390×844, including one narrow viewport where panel scroll and primary action are tested.

### Accessibility Acceptance

Run keyboard/focus and semantic-status checks, verify reduced-motion behavior and ensure diagnostics never expose credentials or restricted samples.

### Copy Contract

Evidence must use the same Thai primary labels and stable technical codes as production; “ยังไม่พร้อมใช้งาน” must not be presented as success.

### Browser Evidence Required

Store screenshots/video or structured evidence for every release-gate state and record viewport, build/version, feature flags and artifact/job IDs without secrets.

## v2 required integration

Verify all twelve sections. Release A requires genuine local and cloud TTS; B requires 178 integration and localized separation; C promotes optional providers individually. Record blocked hardware/API proof explicitly. Default tests never install models or call paid APIs.

## Expanded lifecycle dependency

Read ../voice-lifecycle-v2.md and sections 11/12. Validate reference-only vs transcript-required vs trained modes separately. Existing inference readiness cannot authorize training. Release evidence must distinguish A/B/C/D and must cover profile API lifecycle, transitive rights and rollback where enabled.

## Convergence audit requirements

Apply lifecycle sections 8–10 and contracts recovery clarifications; they refine earlier general wording. Use VoiceOwnerScope for profiles/datasets, AudioScope for executions. Include applicable C5-01 through C5-07 regression cases in ../claude-plan-tdd.md. Release reporting distinguishes core A+B, optional providers C and training D.
