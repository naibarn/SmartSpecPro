# Section 04 — Spec 224 and Spec 256 Handoff

## Goal

Connect approved design artifacts to existing capability discovery and Spec 224 development-run authority without creating a parallel capability, approval, retry, job, agent, or workflow system.

## Dependencies

- Depends on: Sections 01 and 02.
- Consumes optional resolver output from Section 03 but does not block its independent resolver tests.
- Blocks: Section 06 handoff UI and Section 07 end-to-end proof.

## Required discovery before edits

1. Locate the exact live Spec 256 extension point. Do not assume `capabilityRegistry.ts` is its design registry; it currently has model-capability responsibilities unless source evidence proves otherwise.
2. Locate the current Spec 224 DevelopmentRun request, evidence, approval, validation, audit and execution handoff contracts.
3. Identify existing `worker_jobs` job type/executor/outbox registration only if the requested handoff must run asynchronously.

## Tests first

1. Capability requirement resolution calls the proven Spec 256 authority and returns explicit satisfied/denied/missing evidence; an invented, revoked, or denied capability fails closed.
2. Handoff requires an accepted immutable artifact version plus matching digest and fresh evidence. Changed digest, stale decision, tenant mismatch, missing rights or invalid schema rejects before dispatch.
3. Handoff payload carries canonical artifact/version/digest, provenance, component resolution snapshot and evidence references without raw prompt secrets, untrusted HTML or executable code.
4. Where async registration is proven necessary, test canonical job type/executor/outbox registration, idempotency, cancellation and result ownership. Add a regression test showing no second queue, approval service, retry loop, scheduler or workflow route is introduced.
5. Product self-design remains subject to all Spec 224 security/release/sensitive-interaction gates.

## Implementation record

- Added `apps/web/server/services/designHandoffService.ts` as a pure, injected-port contract adapter. It binds exact artifact version/digest and fresh evidence, checks actor tenant/project, approved status and rights, then requires an explicit authorization port, verified capability port and handoff port. Missing authority fails with `AUTHORITY_UNAVAILABLE`; no default service or dispatch is wired.
- Focused tests cover server-resolved immutable digest/version binding, missing authority, stale and malformed expiry, revoked/unbound evidence, tenant mismatch, denied capability, authority exceptions and non-approved artifacts: `cd apps/web && npm test -- --run server/services/__tests__/designHandoffService.test.ts` — 1 file, 5 tests passed.
- Read-only discovery found no callable Spec 256 design capability authority and no Spec 224 artifact-version/digest evidence field. Spec 224's current DevelopmentRun job path is limited to Codex/Claude Code. Therefore this adapter does not create a DevelopmentRun or worker job. Owner-approved evidence storage and a live Spec 256 resolver remain blockers to acceptance.
- Independent reviews found and closed caller-forged artifact/evidence data, malformed expiry, invalid capability-evidence-ref and missing evidence tenant/project binding gaps. The request now contains only IDs and digest references; canonical authority ports supply the values used for decision and dispatch, and the adapter rechecks both evidence and artifact scope.

## Implementation

1. Create a narrow integration adapter that maps canonical design artifacts to the verified Spec 256 capability request and verified Spec 224 handoff request. Keep both authority boundaries explicit and do not copy their state machines.
2. Bind acceptance to exact artifact version/digest and evidence freshness. Re-evaluate authorization/capabilities at handoff time rather than trusting a client claim.
3. Return typed outcomes: accepted, capability denied, evidence stale, decision conflict, authorization denied, and authority unavailable. Never silently downgrade a denied handoff into provider or native execution.
4. Register background work only through the existing job-control-plane path when the actual implementation requires it; otherwise keep the adapter synchronous and pure.
5. Update the G0 record with actual source paths and an explicit statement of which authority owns capability, approval, execution, retries, audit and result lifecycle.

## Completion criteria

- Spec 256 and 224 are reused through confirmed seams, with immutable/fresh evidence binding.
- The integration has no independent durable state machine beyond canonical design artifact decisions.
- Retired `/workflows`, Agency, workpacks, OpenSandbox/Docker and `sandbox_jobs` are absent.

## UI/UX Contract

### Target User / JTBD
N/A for this backend/contract section; its outputs serve the authenticated design-authoring user described by Section 06.

### Surface Inventory
N/A; this section adds no browser route or screen.

### Component Map
N/A; no UI component is owned here. Contract/service ownership is specified above; UI is owned by Section 06.

### State Matrix
N/A for direct UI. Service outcomes (success, validation failure, unauthorized, stale version, cancellation, unavailable provider) must be machine-readable for Section 06.

### Responsive Matrix
N/A; no layout is changed by this section.

### Accessibility Acceptance
N/A for direct UI; this section must not remove accessibility metadata consumed by the UI.

### Copy Contract
N/A; user-visible Thai/English text belongs to Section 06 localization resources. Never expose raw provider or secret errors.

### Browser Evidence Required
N/A for direct UI; integration browser evidence is collected in Section 06 and final hardening.
