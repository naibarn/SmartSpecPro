# Section 01 Diff Summary

## Core code changes

- Added `python-backend/app/services/agency_result_envelope.py`
- Extended `python-backend/app/services/agency_service.py` to parse, persist, and expose structured results plus preview artifacts
- Extended `python-backend/app/models/agency.py` with additive run fields and the new `AgencyRunArtifact` model
- Added `python-backend/migrations/012_agency_structured_results.py`
- Normalized Python API responses in `python-backend/app/api/agencies.py`
- Normalized Node bridge handling in `apps/web/server/services/agencyBridge.ts`
- Added `agency_run_artifacts` schema definition in `apps/web/drizzle/schema.ts`

## Test updates

- Added parser tests and structured-result service assertions on the Python side
- Added bridge normalization tests on the Node side
