# TDD Plan - Feature 123 Agent Experience Adapter Layer

## Testing Conventions

Use existing SmartSpecPro conventions:

- Vitest for TypeScript package and app/shared tests.
- React Testing Library only when preview UI components are introduced.
- Root `npm run typecheck` for shared TypeScript validation.
- Focused app tests through `npm --prefix apps/web test -- <path>` where applicable.

## Section 01: Shared Contracts And Flags

Write tests before implementation:

- Test: `AGENT_EXPERIENCE_SCHEMA_VERSION` exports the expected schema version literal.
- Test: valid `SmartSpecAgentEvent` envelope passes validation.
- Test: unsupported future schema version fails closed.
- Test: unknown event type/source/surface/visibility/redaction value is rejected or dropped.
- Test: malformed event returns dropped reason `malformed`.
- Test: missing required identity returns dropped reason `missing_identity` where identity is required.
- Test: package root exports only documented public API.
- Test: `AgentExperienceIntent` examples typecheck without host mutation imports.
- Test/checklist: `schema-changelog.md` exists with initial version, supported version window, compatibility/deprecation rules, owner, and rollback note.
- Test/checklist: schema change requires changelog, fixture update, and compatibility expectation update.
- Test: all Agent Experience feature flags exist in `TenantFeatureFlags`.
- Test: all Agent Experience feature flags default to `false`.
- Test: `ALLOWED_FEATURE_FLAGS` accepts exact Agent Experience keys and rejects typo variants.
- Test: admin feature flag grouping includes every new Agent Experience flag.
- Test: flag precedence helper handles force rollback, layer disabled, shadow-only, preview, Runtype renderer, debug inspector, and future no-op flags.

## Section 02: Agency And Team Adapters

Write tests before implementation:

- Test: Agency `meta` / `run_started` maps to `session.started`.
- Test: Agency `text_delta` maps to `message.delta`.
- Test: Agency legacy `token` maps to `message.delta`.
- Test: Agency `tool_start`, `tool_progress`, `tool_end` map to tool events in order.
- Test: Agency `tool_end` with error maps to `tool.error`.
- Test: Agency `approval_required` maps to `approval.request`.
- Test: Agency `preview_ready` maps to `artifact.created` without privileged content.
- Test: Agency malformed event is dropped and does not throw.
- Test: Team `RunStreamEvent` preserves event ID, tenant ID, team ID, room ID, run ID, actor, visibility, and timestamp.
- Test: Team workflow/stage event maps to `workflow.step`.
- Test: Team private/internal visibility is hidden from normal renderer output.
- Test: Team unknown event produces dropped diagnostics or debug-only safe output.
- Test: adapter sequence/order is stable for fixture event arrays.

## Section 03: Golden Fixtures And Negative Tests

Write tests before implementation:

- Test: every fixture file name follows `<surface>.<scenario>.<schemaVersion>.fixture.json`.
- Test: every fixture has unique `fixtureId`.
- Test: every fixture metadata includes schema version, source, surface, scenario, synthetic flag, redaction review, and expected event types.
- Test: production-derived fixture metadata requires owner, source date, redaction reviewer, and removal criteria.
- Test: fixture inventory lists every fixture file.
- Test: Agency happy path fixture maps to expected canonical event types.
- Test: Agency legacy path fixture maps without regression.
- Test: Agency approval path fixture maps approval request and resolution.
- Test: Agency malformed path fixture produces expected dropped reasons.
- Test: Team run path fixture preserves identity and timestamp.
- Test: Team private/internal fixture hides private events from normal renderer output.
- Test: artifact pointer fixture never inlines privileged content.
- Test: approval rejected fixture normalizes to canonical `denied`.
- Test: rollback fixture proves flags-off legacy path expectation.
- Test: fixture lint rejects obvious secrets, signed URLs, and tenant-identifiable examples.
- Test: fixture lint rejects raw prompts, user content, OAuth/API tokens, privileged storage paths, and tenant-identifiable samples.

## Section 04: Preview Renderer And Intents

Write tests before implementation:

- Test: fixture-only preview renders loading, empty, success, malformed, and safe error states.
- Test: renderer receives only canonical events, not raw source payloads.
- Test: approval card emits `approval.approve` / `approval.deny` intents without direct mutation calls.
- Test: artifact pane emits open/download/copy intents without loading content directly.
- Test: debug expand intent is hidden or denied without debug permission.
- Test: icon-only controls have accessible labels.
- Test: keyboard path reaches approval and artifact actions.
- Test: Thai and English user-visible fallback/error strings exist.
- Test: mobile drawer layout does not overlap timeline content.

## Section 05: Artifact, Approval, And Cost Adapters

Write tests before implementation:

- Test: artifact record maps to `artifact.created` pointer with safe metadata.
- Test: artifact update maps version without inline privileged content.
- Test: approval record maps to `approval.request`.
- Test: source `rejected` normalizes to canonical `denied` and preserves `sourceDecision`.
- Test: approval resolution requires backend-confirmed state.
- Test: cost estimate is advisory and cannot finalize billing client-side.
- Test: finalized cost event accepts only server-owned data shape.
- Test: tenant mismatch or missing authority produces dropped diagnostics.

## Section 06: Debug Inspector And Redaction

Write tests before implementation:

- Test: normal user cannot receive debug/private events.
- Test: authorized debug user receives only sanitized payload preview.
- Test: secret/credential/signed URL patterns are rejected or redacted.
- Test: private RAG/tool/provider payloads do not enter normal UI state.
- Test: debug denial emits safe metric or denial event without leaking payload.
- Test: data classification defaults unknown fields to private/internal.
- Test/checklist: debug trace IDs align with existing runtime/source trace identity instead of a parallel durable ledger.
- Test/checklist: cached debug previews document retention, access revocation, and delete behavior if any cache is introduced.

## Section 07: Runtype Renderer Spike

Write tests/evidence before implementation:

- Test/evidence: dependency gate report records exact package version and license.
- Test/evidence: bundle impact is documented.
- Test/evidence: Shadow DOM or DOM ownership behavior is documented when applicable.
- Test/evidence: mobile drawer/layout parity is documented.
- Test/evidence: accessibility parity covers keyboard, focus, labels, and reduced motion.
- Test/evidence: private API usage check is complete.
- Test/evidence: bridge fallback to SmartSpec renderer works.
- Test: `agentExperienceRuntypeRenderer` ignored when layer disabled.
- Test: bridge receives only filtered canonical events.
- Test: bridge emits typed intents only.

## Section 08: Rollout Metrics And Release Gates

Write tests/evidence before implementation:

- Test: release evidence artifact fails validation when required command results are missing.
- Test: waiver without `waiver_id`, gate, reason, owner, expiry date, mitigation, revisit trigger, or impacted rollout stage fails release gate.
- Test: expired waiver blocks stage progression.
- Test: waiver cannot bypass cross-tenant safety, approval integrity, billing authority, secret redaction, or rollback readiness.
- Test: canary stage gate aborts on cross-tenant, billing, approval, or rollback failure.
- Test: doc-sync guard detects missing fixture inventory entries.
- Test: doc-sync guard detects schema change without changelog entry.
- Test: doc-sync guard detects missing flag entries, waiver entries, dependency gate report, launch decision log, and section mapping.
- Test/evidence: surface adoption criteria are recorded before live preview.
- Test/evidence: compatibility coverage records streaming, tool calls, approvals, artifacts, themes, debug, credits, errors, mobile layout, access control, i18n, accessibility, rollback, and external bridge when enabled.
- Test/evidence: performance baseline exists before live preview.
- Test/evidence: alert/triage ownership exists before tenant beta.
- Test/evidence: threat model covers malformed streams, cross-tenant references, debug exposure, approval spoofing/replay, billing manipulation, artifact XSS/privileged URL leak, external supply-chain risk, fixture/log leakage, and deferred page-action escalation.
- Test/evidence: reviewer signoff references evidence artifacts, not only verbal approval.
- Test: launch decision log records stage, decision, owner, timestamp, and next gate.
- Test: rollback drill evidence records detect/decide/execute/verify steps.
