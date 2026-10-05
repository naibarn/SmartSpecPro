# Section 05 — Optional Provider Adapter Boundary

## Goal

Implement an optional, mocked, provider-neutral adapter boundary that is unavailable by default. It must preserve native authoring as the usable path and must never make a real Stitch request or read/discover credentials in this section.

## Dependencies

- Depends on: Sections 01 and 02.
- Parallelizable with Sections 03/04 after its dependencies are satisfied.
- Blocks only provider-related portion of Section 07; it must not block native authoring.

## Tests first

1. Flag-policy tests deny every provider dispatch when any of native parent, provider adapter, or provider-specific flag is false.
2. Mock adapter tests cover capability negotiation, SDK/API version mismatch, consent absence, ineligible credential binding abstraction, egress/data profile denial, cancellation, idempotency, timeout/error normalization and result validation.
3. Normalized successful results produce a new canonical artifact provenance branch; fallback does not merge provider and native lineage silently.
4. Provider malformed response, unsafe asset/right metadata, untrusted HTML/code, missing tenant/project scope and unavailable service return safe typed failure while native creation remains available.
5. Tests assert no network call and no credential value access. Mock the secret-binding abstraction, not a raw environment variable.

## Implementation

1. Define a provider adapter interface based solely on Section 01 canonical request/result contracts. Provide a disabled adapter and a mock fixture; do not add the Stitch SDK/package unless a separately approved implementation need proves it necessary.
2. Implement policy evaluation before any adapter invocation: feature gates, caller authorization/consent, provider certification status from G0, data residency/retention profile, approved prompt envelope, rights metadata, capability/version compatibility and existing secret-binding reference eligibility.
3. Ensure adapter results normalize into canonical artifact candidates with provider identifier/version, request id, provenance parent/branch, policy decision, normalized assets and no raw secret/error payload.
4. Make fallback explicit: the service returns a native candidate or a typed provider-unavailable result; it never silently claims provider generation.
5. Keep every external and Stitch flag default false. Update reconciliation record with provider certification blockers: account, terms, retention, quotas, credentials, real API contract and operational runbook.

## Completion criteria

- Provider adapter is testable through mocks, data-minimizing, fail-closed, and disabled by default.
- Native-only operation remains fully available if provider integration is unavailable or denied.
- No live request, credential inspection, SDK account onboarding, public route or new orchestration system is added.

## Implementation record

- Added `apps/web/server/services/designProviderAdapter.ts` as an injected Stitch contract boundary without SDK, network setup, or production wiring. Dispatch requires the existing parent/native/resolver/provider/Stitch/visual-verification flags, verified certification, explicit consent, approved data profile, and eligibility of a secret-binding reference. The interface receives only a reference, never a credential value.
- Provider responses are parsed through the canonical artifact schema and rejected unless tenant/project/user, request id, catalog snapshot and `external-provider`/`stitch` provenance match. Errors are normalized to typed outcomes; native requests are not silently re-labeled as provider output.
- Focused tests cover default-off no-call behavior, policy/egress denial, server-owned scoped candidate lineage and rights, idempotent replay/conflict isolation, protocol/capability negotiation, typed provider failures, cancellation (including cancellation while queued before dispatch), timeout and unsafe results: `cd apps/web && npm test -- --run server/services/__tests__/designProviderAdapter.test.ts` — 1 file, 9 tests passed.
- The adapter has no default provider implementation and no real credential binding or certification source. Therefore provider dispatch remains unavailable in product until G0 certification and wiring are approved.
- The production `operationStore.runOnce` must provide atomic per-key execution and fingerprint conflict rejection. An in-flight caller's abort cancels the operation it owns; cancellation of another caller waiting on a shared operation is not modeled until an approved durable operation owner is selected.
- Follow-up correction (2026-10-05): valid provider candidates now include the required canonical `schemaVersion: 1`. A missing component-catalog snapshot is rejected before policy lookup, negotiation, or provider generation, preventing avoidable egress/cost. Regression coverage is included in `designProviderAdapter.test.ts`.
- Candidate focused verification for Specs 263/270 passed 14 files / 107 tests. The adapter still has no production provider, certification source, credential binding, or durable operation owner; provider dispatch remains default-off and this section remains partial.

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
