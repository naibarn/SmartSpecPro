# Orchestra Backlog — Feature 022: BytePlus ModelArk API

## Expected Artifacts (after /deep-plan)

When `/deep-plan @specs/feature/022-byteplus-modelark-api/spec.md` completes, these files must exist:

- `specs/feature/022-byteplus-modelark-api/sections/index.md`
- `specs/feature/022-byteplus-modelark-api/claude-plan.md`
- `specs/feature/022-byteplus-modelark-api/claude-plan-tdd.md`

## Pending Tasks (for /orchestra resume after /deep-plan)

After deep-plan artifacts are verified, orchestra will implement in these waves:

### Wave 1 (parallel: CMD-2 + CMD-3)
- [ssp-backend] Add BytePlus template to PROVIDER_TEMPLATES + testBytePlusModelArk() in mediaProviders.ts
- [ssp-python] Create byteplus_modelark_provider.py + update __init__.py

### Wave 2 (parallel: CMD-3 task routing)
- [ssp-python] Add provider routing in media_tasks.py (generate_image_task + generate_video_task)
- [ssp-python] Add _normalize_byteplus_task_state() and _extract_byteplus_result_url() helpers

### Wave 3 (tests)
- [ssp-test-qa] Write test_byteplus_modelark_provider.py

### Wave 4 (verification)
- [ssp-frontend] Verify Media Studio supports BytePlus I2V reference image URL flow
- [ssp-frontend] Fix any parameter passing gaps (resolution, duration, camerafixed)

### Wave 5 (security gate)
- [ssp-security-fastapi] Audit byteplus_modelark_provider.py for injection, SSRF, key exposure
- [ssp-security-trpc] Audit mediaProviders.ts testBytePlusModelArk for SSRF

## Notes

- No DB migration needed (reuse existing media_providers + media_models tables)
- Admin must manually create the provider record via admin UI after implementation
- Media models (6 Seedream/Seedance models) must be seeded via admin UI or seed script
