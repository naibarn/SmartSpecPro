# Section 01: Shared Contracts And Flags

## Objective

Create the safe MVP foundation: `packages/agent-experience`, canonical event contracts, validation, public exports, fixture helpers, Agent Experience feature flags, and flag precedence logic.

## Scope

- Add a new private npm workspace package `@smartspec/agent-experience`.
- Define `SmartSpecAgentEvent`, metadata envelope, parse result, dropped-event reason, renderer intent, and related union types.
- Define schema/version constants and runtime validation helpers.
- Define package root exports and keep them intentionally small.
- Add feature flags in web shared flag inventory and admin grouping.
- Add a pure flag precedence helper and tests.

## Out Of Scope

- Initial section scope had no `@runtypelabs/persona` dependency; the 2026-06-22 follow-up directive supersedes this only for gated bridge evaluation.
- No live stream binding.
- No preview UI.
- No database migration.
- No artifact/approval/billing mutation behavior.

## Files To Add

- `packages/agent-experience/package.json`
- `packages/agent-experience/src/index.ts`
- `packages/agent-experience/src/events.ts`
- `packages/agent-experience/src/schemas.ts`
- `packages/agent-experience/src/featureFlags.ts`
- `packages/agent-experience/src/testing/fixtures.ts`
- `packages/agent-experience/src/__tests__/schemas.test.ts`
- `packages/agent-experience/src/__tests__/featureFlags.test.ts`
- `apps/web/shared/__tests__/agentExperienceFeatureFlags.test.ts`
- `specs/feature/123-agent-experience-adapter-layer/schema-changelog.md`

## Files To Modify

- `apps/web/shared/featureFlags.ts`
- `apps/web/shared/featureFlags.js` only after inspecting whether it is generated or manually maintained
- `apps/web/client/src/components/admin/tenantFeatureFlagGroups.ts`
- `apps/web/client/src/components/admin/tenantFeatureFlagGroups.test.ts`

## Implementation Notes

Inspect nearby `packages/*/package.json` files before choosing module metadata. Match local conventions for `type`, `main`, `types`, scripts, and exports.

The package root should export only:

- schema/version constants;
- canonical event and parse result types;
- renderer intent types;
- Agency/Team adapter entry points after Section 02;
- fixture helper entry points.

Do not export mutation helpers, tRPC clients, bridge internals, or raw source-specific event contracts as product API.

Feature flags to add:

- `agentExperienceLayer`
- `agentExperienceShadowMode`
- `agentExperienceAgencyPreview`
- `agentExperienceTeamPreview`
- `agentExperienceChatPreview`
- `agentExperienceRuntypeRenderer`
- `agentExperienceDebugInspector`
- `agentExperienceForceRollback`
- `agentExperienceWebsiteWidget`
- `agentExperiencePageActions`

All default to `false`.

Flag precedence helper must encode:

- force rollback disables all behavior;
- layer disabled ignores child flags;
- shadow-only observes without visible UI change;
- preview requires layer true and surface preview true;
- external renderer requires layer true and dependency gate pass;
- debug inspector requires debug flag plus permission/redaction checks;
- future customer flags are no-op.

`schema-changelog.md` must include:

- initial schema version;
- supported version window;
- owner;
- compatibility/deprecation rules;
- fixture update rule for schema changes;
- rollback note for unsupported versions.

Post-Phase 0 schema changes must update schemas, fixtures, changelog, and compatibility expectations together. After Phase 1, support current and current-1 schema versions unless a later migration plan explicitly extends the window.

## UI/UX Contract

### Target User / JTBD

- Platform admins and implementers need safe flag controls that cannot expose unfinished Agent Experience surfaces by accident.

### Surface Inventory

- Tenant feature flag admin grouping.
- No new customer-visible surface in this section.

### Component Map

- Reuse existing admin feature flag group components.
- No new Agent Experience visual components.

### State Matrix

- all flags default off;
- layer off with child flags on;
- force rollback on;
- shadow mode on;
- dependency gate failed;
- debug inspector blocked by permission or redaction guard.

### Responsive Matrix

- Existing admin flag layout must remain usable at current supported mobile, tablet, and desktop breakpoints.
- No new responsive layout requirement beyond preserving the existing admin table/list behavior.

### Accessibility Acceptance

- Existing flag controls retain labels, keyboard reachability, focus visibility, and status announcements.
- New flag names must be understandable without relying on color alone.

### Copy Contract

- Avoid user-facing `Persona` terminology.
- Use `Agent Experience` for product-facing labels and `agentExperience*` only for internal flag keys.

### Browser Evidence Required

- Not required for this foundation section unless admin flag grouping layout changes visually.
- If visual admin grouping changes, capture mobile 390x844, tablet 768x1024, and desktop 1440x900.

## Tests First

- Test schema version constant export.
- Test valid event envelope passes validation.
- Test unsupported future schema version fails closed.
- Test unknown event/source/surface/visibility/redaction values are rejected or dropped.
- Test malformed/missing identity cases produce dropped diagnostics.
- Test package public exports match intended API.
- Test or checklist schema changelog exists and records initial version plus compatibility/deprecation rules.
- Test all Agent Experience flags exist in `TenantFeatureFlags`.
- Test all Agent Experience flags default `false`.
- Test all Agent Experience flags are in `ALLOWED_FEATURE_FLAGS`.
- Test typo variants are rejected.
- Test admin grouping contains all new flags.
- Test flag precedence rows.

## Acceptance Criteria

- Package exists and typechecks.
- Public API is small and tested.
- Feature flags are declared, defaulted off, allowed, grouped, and tested.
- Flag precedence helper is tested.
- No existing visible UI behavior changes.
- No external dependency is installed.
