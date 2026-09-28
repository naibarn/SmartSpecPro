# Section 01 — Control Plane

Ownership:

- `apps/web/server/routers/systemSettings.ts`
- `apps/web/server/services/tenantFeatureFlagService.ts`
- `python-backend/app/api/meta_oauth.py`

Tasks:

- Add Meta OAuth and webhook fields to admin settings read/write contracts.
- Preserve stored secrets when blank values are submitted.
- Return configured booleans only.
- Add a safe configuration test procedure.
- Resolve and decrypt Meta settings through the shared Python loader.
- Synchronize Meta tenant flags to Redis.

TDD:

- Router storage/masking tests first.
- Python encrypted-setting resolution test first.
- Tenant Redis synchronization test first.

Acceptance:

- No schema change.
- No plaintext secret returned or logged.
- Existing provider settings remain compatible.
