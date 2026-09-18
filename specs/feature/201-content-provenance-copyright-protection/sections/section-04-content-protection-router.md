# Section 04 — Content Protection tRPC router

Create `apps/web/server/routers/contentProtection.ts` and
`apps/web/server/routes/contentProtection.ts`, mounting them in the existing
tRPC and `/v1` route registries. Add protected procedures/routes for overview, list/detail,
protect, verify, verification detail, cases/evidence, rights/certificate, and
user watermark default. Use bounded Zod schemas for IDs, modality, choices,
storage/library references, pagination, and reviewer tokens. Every lookup must
use server-derived tenant and user/role authority; do not trust tenant IDs from
input. Public reviewer access uses a hashed, expiring, revocable token.

Long-running protect/verify mutations enqueue the canonical worker plane and
return an idempotent job/record reference. Error messages are safe and bounded.

Tests first in router tests: unauthenticated denial, cross-tenant/non-owner
denial, input validation, idempotent repeat, public link lifecycle, and no secret
in output. Add the restricted public reviewer route and
`/.well-known/smartaihub-evidence-keys.json` using the same service-level
redaction and key-history rules.

## Implementation Record

- Added `apps/web/server/routers/contentProtection.ts` with bounded strict Zod inputs, tenant-derived auth, owner/admin scoping, overview/list/detail, protect, verify, verification detail, user settings, and ON/OFF choice procedures.
- Added `apps/web/server/routes/contentProtection.ts` with REST overview/list/detail adapters and a public evidence-key history response that accepts public fields only.
- Mounted the tRPC router in `apps/web/server/routers.ts` and REST routes in `apps/web/server/_core/index.ts`.
- The protect/verify records are persisted with source checksums from server-owned `mediaAssets`; traversal-like storage references and client-supplied tenant authority are rejected. Long-running worker enqueue is completed by Section 05 against the same records.
- Verification: `npm --workspace @smartspec/web test -- server/routers/contentProtection.test.ts --reporter=dot` passed (3 tests).
