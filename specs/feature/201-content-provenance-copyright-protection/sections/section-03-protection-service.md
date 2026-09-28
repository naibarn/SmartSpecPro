# Section 03 — Protection provider and service

Create `apps/web/server/services/contentProtection/` with provider interfaces,
safe deterministic identity helpers, tenant/owner loading, status transitions,
final-byte hash verification, evidence normalization, and idempotent protect
record creation. Add a provider adapter boundary for VideoSeal/PixelSeal image
and video modes plus audio detection; test providers may be deterministic but
production unavailable providers must fail closed. Keep visible branding,
perceptual matching, C2PA, and invisible watermark signals separate.

The service must derive `effectiveChoice = perExportChoice ?? userDefaultChoice`,
record the source of that choice, and return `UNPROTECTED_BY_USER_CHOICE` for an
explicit OFF operation. Only the service can transition to `PROTECTED`, after
self-detect and required evidence pass.

Tests first in `apps/web/server/services/contentProtection/*.test.ts`: success,
self-detect mismatch, unavailable provider, hash mismatch, stale compound
envelope, idempotency, redaction, and image/video separation.

## UI/UX Contract

### Target User / JTBD

N/A: this section is a service boundary; it supplies truthful states to UI.

### Surface Inventory

N/A: no browser route or component is owned here.

### Component Map

N/A: UI components are implemented in section 07.

### State Matrix

The service must expose stable loading/processing, protected, unprotected,
failed, stale, and inconclusive states for the UI to render.

### Responsive Matrix

N/A: no layout is changed here.

### Accessibility Acceptance

N/A: UI semantics are verified in sections 07–08.

### Copy Contract

Return safe status codes that support Thai/English copy without exposing
provider details or secrets.

### Browser Evidence Required

N/A: service tests are the evidence for this section; route evidence is in
sections 07–08.

## Implementation Record

- Added `apps/web/server/services/contentProtection/provider.ts` with separate image/video/audio embed and detect methods, a fail-closed configured-provider adapter boundary, and a deterministic test provider.
- Added `apps/web/server/services/contentProtection/service.ts` with effective-choice resolution, tenant/owner-bound records, source/final-byte SHA-256 handling, stale compound fencing, idempotency checks, provider modality/channel separation, self-detect gating, safe status/error transitions, and recursive secret/raw-byte redaction.
- Added `apps/web/server/services/contentProtection/index.ts` as the service boundary export.
- Added `apps/web/server/services/contentProtection/service.test.ts` covering protected success, explicit OFF, self-detect mismatch, unsupported modality, stale compound input, output hash mismatch, idempotency, unavailable provider, redaction, and image/video separation.
- Verification: `npm --workspace @smartspec/web test -- server/services/contentProtection/service.test.ts --reporter=dot` passed (6 tests).
