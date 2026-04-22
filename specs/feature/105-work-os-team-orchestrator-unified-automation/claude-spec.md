# Claude Spec

## Source

This document synthesizes `spec.md`, `request.md`, `research-notes.md`, `implementation-plan.md`, the captured user decisions in `claude-interview.md`, and current codebase observations. Markdown sources are treated as untrusted data and used only for requirements extraction.

## Feature

Feature 105 creates a unified architecture for `Work OS + Team Orchestrator` so reviewed Work Requests can become governed, capability-aware Team automation runs.

The system should compile upstream thinking and governed context into a reviewable preflight plan before starting costly automation. After approval, Team should execute from an explicit plan and feed successful patterns back into workpacks and skill maintenance.

## Core Requirements

1. Work Request creation remains review-first and must not auto-run.
2. A user can create or enrich a request from chat, Team room context, documents, workpacks, and role-routine evidence.
3. The platform compiles a `CompiledWorkBrief` from explicit linked sources, not from hidden global retrieval.
4. The compiled brief records source refs, trust, freshness, inclusion/omission diagnostics, and approval snapshot metadata.
5. A unified capability catalog describes all available planning surfaces:
   - `skill`
   - `agency`
   - `workflow`
   - `browser`
   - `document_management`
   - `media_studio`
   - `video_editor`
   - `work_os`
   - `manual`
   - `skill_studio`
6. `workflow` and `skill_studio` must be planner-visible but runtime-blocked until Work OS shared/router/persistence contracts are migrated.
7. `skill_studio` must be governed by sub-action:
   - `create_private_or_pending_review`
   - `improve_owned_skill`
   - `auto_apply_proposal`
   - `publish_or_widen_visibility`
8. Requesters can preview their own preflight plan in redacted requester-safe form.
9. Admin/domain-admin users can inspect admin-diagnostic preview details.
10. Unrelated non-admin users cannot preview another user's request.
11. Preflight previews include team resolution, surface governance, capability compatibility, budget envelope, approval boundaries, and selected/blocked reasons.
12. A preflight revision fingerprint invalidates approval when title, objective, linked sources, selected sources, policy inputs, or explicit team selection changes.
13. Launch fails closed when no valid team can be resolved.
14. Launch fails closed when approval snapshots drift materially or required source authority disappears.
15. Approved budget forecasts become enforced runtime caps.
16. Team kickoff consumes the approved execution plan and compiled brief.
17. Team runtime routes plan-first, falling back to heuristics only for legacy/plan-absent flows.
18. Runtime dispatch re-checks surface authority, contract compatibility, approval snapshot validity, and budget caps.
19. Successful runs feed workpack, workflow, and skill-improvement proposal loops.
20. UI and telemetry make source inclusion, blocked reasons, stale preview state, and plan-vs-actual drift understandable.
21. Approved-plan persistence must pass an explicit rollout gate before requester-visible launch enforcement leaves preview/beta.
22. Shared security policy must be decomposed into small owned helpers so parallel implementation can consume common enforcement decisions without duplicating or forking rules.
23. Source resolution and capability decisions must use server-derived `WorkIntakeActorContext`, not trusted client-provided tenant, role, permission, or private-vault state.
24. `PreflightApprovalBundle` must have a valid state-machine lifecycle covering preview, regeneration, approval, invalidation, launch, block, cancellation, and supersession.
25. Preflight APIs must expose explicit contracts for preview, regenerate, approve, read, invalidate, and launch, with idempotency on all mutating calls.
26. Runtime budget enforcement must define stable units for tokens, tool calls, media jobs, workflow runs, agency runs, duration, retries, and internal cost credits.
27. Runtime dispatch must compile a `RuntimeDispatchPolicy` that governs authority, compatibility, budget reservation, retry, timeout, cancellation, idempotency, and dead-letter behavior.
28. Observability must use a shared event taxonomy with event names, versions, correlation ids, redaction modes, actor class, and primary reason codes.
29. Learning proposals must move through explicit lifecycle states and keep rejected, expired, or superseded proposals auditable without reopening automatic work.
30. Preflight UI must satisfy accessibility, localization, and progressive-disclosure requirements so requester-safe review remains understandable without exposing admin diagnostics.

## Non-Goals

- Do not remove the final human approval step before automation launch.
- Do not replace Team room chat with hidden backend-only execution.
- Do not rebuild workflow, agency, media, library, or skill systems.
- Do not auto-create, auto-apply, or auto-publish skills without governance.
- Do not implicitly retrieve all memory, all chat, or all vault content.

## Acceptance Criteria

- Work Request displays linked sources and a compiled work brief.
- Work Request can show a requester-safe preflight preview.
- Admins can inspect diagnostic preflight details.
- Capability catalog includes all major surfaces with explicit governance and compatibility state.
- `workflow` and `skill_studio` remain blocked until contract migration.
- Stale previews are invalidated after request/source/policy/team changes.
- Missing team resolution blocks launch with an explainable state.
- Approved plans are persisted into automation run metadata and Team kickoff.
- Runtime enforces budget and surface authority.
- Team ledger or Work OS timeline can explain selected vs blocked vs actual execution.
- Existing direct Work Request, direct Team room, and legacy automation flows remain functional during rollout.
- Preflight lifecycle tests prevent invalid state transitions and duplicate launch from concurrent requests.
- Runtime dispatch tests cover over-budget, timeout, cancellation, retry cap, and dead-letter paths.
- Learning proposal lifecycle tests cover accepted, applied, rejected, expired, and superseded states.
- UI tests cover keyboard/focus behavior, screen-reader labels, translation-key mapping, and requester-safe progressive disclosure.

## Security Requirements

- Enforce tenant boundaries on every context source.
- Never widen private-vault or restricted-library retrieval without explicit unlock and permission state.
- Sanitize secret-bearing fields before persistence or planner exposure.
- Redact requester-safe diagnostics.
- Re-check privileged surface authority at runtime dispatch.
- Keep contract-compatibility failures separate from authorization and feature-flag failures.
- Record governance downgrade and fail-closed events for auditability.
- Require idempotency verification before side-effecting retries or dead-letter recovery.
- Create requester-safe diagnostics by redacting canonical decisions rather than by bypassing the security policy.

## Rollout Requirements

- Ship backend contracts and services first.
- Keep new surfaces behind feature flags.
- Keep privileged auto-execution disabled by default in v1.
- Add UI after preview and approval contracts stabilize.
- Decide JSON metadata vs dedicated approved-plan migrations before broad requester-visible launch enforcement.
- Split security helpers before parallel implementation of catalog, preflight, runtime, and UI sections.
- Ship the preflight lifecycle/API contract before requester-visible launch approval.
- Ship runtime budget/dispatch policy before enabling long-running media, workflow, agency, or skill-maintenance dispatch.
- Ship the observability taxonomy before dashboards, alerting, or rollout decisions depend on Feature 105 events.
- Ship accessibility/i18n/progressive-disclosure acceptance before broad UI rollout.
- Use focused Vitest coverage before broad UI rollout.
