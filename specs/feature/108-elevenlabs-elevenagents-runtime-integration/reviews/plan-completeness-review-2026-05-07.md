# Plan Completeness Review

Date: 2026-05-07

Target:

- `specs/feature/108-elevenlabs-elevenagents-runtime-integration/claude-plan.md`
- `specs/feature/108-elevenlabs-elevenagents-runtime-integration/claude-plan-tdd.md`
- `specs/feature/108-elevenlabs-elevenagents-runtime-integration/sections/index.md`
- `specs/feature/108-elevenlabs-elevenagents-runtime-integration/sections/*.md`

## Verdict

The Feature 108 plan is structurally complete and implementation-ready after
minor hardening. Section validation reports 6/6 sections complete, the section
order is coherent, the MVP boundary is clear, and the plan correctly keeps
ElevenAgents separate from one-shot ElevenLabs media generation.

Before `deep-implement`, close the recommended handoff gaps below so the
implementer does not need to infer dependency, rollout, and callback decisions.

## Checks Performed

- SocratiCode `codebase_status` succeeded with green index; latest incremental
  update showed `fetch failed`, so review used targeted file reads and shell
  checks for exact verification.
- `check-sections.py` returned `complete` with 6/6 sections and a valid
  manifest.
- Planning artifacts were scanned for unresolved placeholders and decision
  drift.
- Feature 108 plan was cross-checked against the existing Feature 099
  ElevenAgents follow-on context returned by SocratiCode.
- Repository checks confirmed `@elevenlabs/react` is not currently present in
  the visible package manifests.
- Repository checks confirmed tenant feature flag utilities already exist.

## Scorecard

| Dimension | Result | Notes |
|---|---|---|
| Structure | PASS | Research, schema/contracts, services, API/callbacks, UI, and final hardening are split into six ordered sections. |
| Scope Boundary | PASS | Chat-first MVP, TypeScript ownership, and non-media-model separation are explicit. |
| TDD Coverage | PASS | Schema, contracts, services, router, route, UI, billing, security, and regression tests are represented. |
| Security | PASS WITH RECOMMENDATIONS | Signature/replay/tenant binding are covered, but post-call callback route ownership should be made explicit if webhook reconciliation is used. |
| Implementability | MINOR GAPS | Dependency install ownership, exact rollout flag key, post-call reconciliation route/fallback decision, and admin UI route ownership need hardening. |

## Findings

### 1. Dependency install ownership is missing

Evidence:

- `claude-plan.md` requires `@elevenlabs/react` usage.
- `section-05-chat-admin-ui.md` owns React UI files but does not own
  `apps/web/package.json` or lockfile updates.
- Current package manifest search found no `@elevenlabs/react` entry.

Why it matters:

Without explicit dependency ownership, Section 05 may fail at compile time or
touch package files outside its declared boundary.

Recommended hardening:

- Add `apps/web/package.json` and the repo lockfile to Section 05 ownership if
  `@elevenlabs/react` is absent.
- Add a TDD/verification item that the package install is reflected in the
  manifest/lockfile and `pnpm check` resolves imports.
- If Section 01 finds the package is not viable, require a documented fallback
  wrapper before Section 05 starts.

### 2. Post-call transcript reconciliation lacks an explicit endpoint/fallback handoff

Evidence:

- `claude-plan.md` says final transcript reconciliation uses post-call webhook
  or provider polling.
- `section-03-backend-services.md` includes a reconciliation service.
- `section-04-api-callbacks.md` only defines
  `POST /api/voice-agents/elevenlabs/tool-callback`; it does not define a
  post-call transcript webhook route or an explicit decision artifact that
  chooses polling-only.

Why it matters:

If the research spike confirms post-call webhook use, implementation needs an
owned route, signature handling, route registration, and route tests. If polling
is chosen, the plan should say where the polling trigger/job lives and what
marks sessions `transcript_pending`.

Recommended hardening:

- Add a Section 01 research output decision:
  `reconciliation_transport = post_call_webhook | provider_polling | both`.
- If `post_call_webhook`, add a Section 04 route such as
  `POST /api/voice-agents/elevenlabs/post-call` with raw-body/signature tests.
- If `provider_polling`, add the scheduler/trigger ownership and retry budget
  to Section 03 or Section 06.

### 3. Rollout flag is conditional even though a tenant feature flag system exists

Evidence:

- `claude-plan.md` says to use feature flagging if the existing tenant feature
  flag system supports this surface.
- `section-06-observability-regression.md` says `voiceAgents` or equivalent.
- Repository search shows existing tenant feature flag services and middleware.

Why it matters:

For a public callback plus new Chat surface, rollout gating should be explicit
and fail closed. Leaving the key name and touched files vague makes Section 06
weaker than the risk level deserves.

Recommended hardening:

- Add a concrete feature flag key, preferably `voiceAgents`, to the shared
  feature flag contract if compatible with local naming.
- Add owned files for shared flag definitions, tRPC/Express flag middleware
  usage, and UI visibility gating.
- Add tests for admin visibility, Chat panel visibility, and tool bridge disabled
  behavior when the tenant flag is off.

### 4. Admin UI ownership is too vague for deep-implement handoff

Evidence:

- `section-05-chat-admin-ui.md` names concrete Chat files.
- Admin UI ownership is only "A focused admin page/component following existing
  admin/provider patterns" plus i18n keys.

Why it matters:

The implementer must discover route/nav/i18n placement during implementation,
which increases drift risk and makes testing boundaries less clear.

Recommended hardening:

- Add concrete candidate admin route/component/nav/i18n files after a short
  local pattern check.
- Add one admin route/nav test or smoke assertion if the repository has route
  tests for admin pages.
- State whether this belongs under Media Provider settings, a new Voice Agents
  admin subpage, or both.

## Not Blocking

- Deferred Team Room, Work OS, Agency, telephony, and knowledge-base sync are
  appropriately out of MVP.
- The plan correctly preserves one-shot ElevenLabs media provider behavior as a
  regression target.
- Security testing expectations are strong enough, provided the post-call route
  handoff is clarified.

## Recommended Next Step

Patch the four hardening items into `claude-plan.md`, `claude-plan-tdd.md`, and
sections 01, 04, 05, and 06 before starting `deep-implement`.
