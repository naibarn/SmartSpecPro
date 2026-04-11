# Section 01 - ADE Service Adapter

## Ownership

Own the Python-side ADE integration and keep the adapter small, testable, and provider-agnostic at the boundary.

## Target files / modules

- `python-backend/app/api/internal_library.py`
- `python-backend/app/services/<new-ade-adapter>.py`
- `python-backend/app/services/r2_storage_service.py`
- `python-backend/tests/unit/api/test_internal_library_extract.py`
- `python-backend/tests/unit/services/<new-ade-adapter>.py`

## Work items

1. Add a Python service wrapper around the ADE client.
2. Add a normalized adapter contract for:
   - parse markdown
   - structured extraction
   - source URL kind
   - provider name / version
   - warnings / errors
   - MIME type and file hash
   - page count and parse status
   - trace ID and provider request ID
3. Implement provider-safe URL resolution:
   - keep public URLs as-is
   - convert private/local documents into temporary public URLs through storage when allowed
4. Keep the adapter pure enough that Node only sees a stable JSON response.
5. Make unsupported, encrypted, or malformed inputs fail closed with a typed error surface.

## TDD expectations

- Write the adapter tests first.
- Include tests for:
  - public URL -> no rewrite
  - private URL -> temporary public URL rewrite
  - parse/extract normalization
  - error surface when ADE is unavailable
  - unsupported MIME or encrypted document rejection
  - canonical lineage fields preserved on success and failure
  - temporary URL expiry recovery when the source file is still available

## Acceptance checks

- ADE adapter can parse document inputs from a URL.
- Returned payload contains provider lineage and OCR text / markdown.
- Private/local URLs never leak unmodified into provider calls.
- The adapter emits one canonical response shape for both parse-only and parse-plus-extract paths.
- The adapter does not attempt ADE calls for unsupported file classes.
