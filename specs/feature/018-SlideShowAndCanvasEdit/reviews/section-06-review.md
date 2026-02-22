# Section 06 Review - Import Conversion and Compatibility

## Scope Reviewed
- `apps/web/server/services/presentationCompatibilityService.ts`
- `apps/web/server/services/presentationCompatibilityService.test.ts`
- `apps/web/server/services/presentationPersistence.ts`
- `apps/web/server/routers/presentation.ts`
- `apps/web/server/routers/presentation.test.ts`
- `apps/web/shared/presentation/constants.ts`
- `apps/web/shared/presentation/contracts.ts`

## Findings
1. Compatibility open behavior now differentiates editable native presentations from office-source read-only paths and produces explicit `.ppt` guidance.
2. Conversion flow enforces idempotency/serialization semantics via source-key lock and idempotency cache, returning deterministic statuses (`created`, `existing`, `locked`, `unsupported`).
3. Conversion metadata persistence is now wired through source-attachment upsert (`sourceFormat`, status, partial-fidelity warnings, source linkage).
4. Fidelity-warning extraction is deterministic and bounded, ensuring warning payloads are safe for frontend parsing.

## Risks / Follow-ups
- Current conversion lock/idempotency state is process-memory scoped; future worker-based conversion orchestration should persist lock/idempotency across instances.
- Converted deck payload generation is intentionally minimal in this section; richer slide-content fidelity shaping can be layered in export/hardening phases.

## Fixes Applied During Review
- Added explicit compatibility/conversion schema-version constants and shared contract schemas for parser stability.
- Added router coverage for compatibility and conversion endpoints to verify typed actor forwarding and deterministic response shapes.
