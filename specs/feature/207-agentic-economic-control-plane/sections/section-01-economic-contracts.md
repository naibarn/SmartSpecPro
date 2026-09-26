# Section 01 — Economic Contracts

**Objective:** Define validated money, economic intent, policy decision and
Job/attempt correlation types without authorizing an effect from client claims.

**Files:** create `apps/web/server/services/economicControlPlaneTypes.ts` and
its focused test; use existing `jobControlPlaneTypes.ts` and authenticated
request context patterns as references.

**Tests first:** invalid amounts/currency; missing or mismatched tenant/actor;
required Job/attempt correlation; bounded idempotency; stable denial reasons;
same-request replay.

**Implementation contract:** export pure constructors/validators plus a typed
admission input/output. Money is integer minor units with currency. Correlation
contains tenant, Job, attempt, actor and policy version. No DB writes or
provider calls belong in this section.

**Acceptance:** focused Vitest passes; no raw secret/provider credential type is
introduced; `git diff --check` passes for owned files.

## UI/UX Contract

### Target User / JTBD
N/A; server contract consumed by later UI.
### Surface Inventory
N/A; no browser surface changes.
### Component Map
N/A; typed decision data only.
### State Matrix
N/A; consumers render decision/reason codes.
### Responsive Matrix
N/A; no layout changes.
### Accessibility Acceptance
N/A; no interactive element.
### Copy Contract
Reason codes must have Thai/English consumer labels.
### Browser Evidence Required
N/A; downstream UI sections own evidence.
