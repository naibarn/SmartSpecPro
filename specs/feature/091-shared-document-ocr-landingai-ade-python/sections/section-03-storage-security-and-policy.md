# Section 03 - Storage, Security, and Policy

## Ownership

Own the privacy model, URL safety, auditability, and tenant gating for external document processing.

## Target files / modules

- `apps/web/drizzle/schema.ts`
- `apps/web/server/services/libraryService.ts`
- `apps/web/server/services/financeDocumentExtractionService.ts`
- `python-backend/app/api/internal_library.py`
- `python-backend/app/services/finance_ocr_debug_trace.py`

## Work items

1. Add or extend fields needed for provider lineage and parse provenance.
2. Ensure tenant / project / owner scoping is preserved in stored parse records.
3. Add policy gates for:
   - external document processing allowed / denied
   - temp URL generation
   - audit logging
4. Redact source hostnames and avoid logging raw document content.
5. Preserve existing retention / delete behavior for uploads and derived artifacts.
6. Persist hashes and parse status for both success and failure outcomes.
7. Keep temporary public URL TTLs short and explicit.
8. Ensure ambiguous legacy rows stay excluded from personal finance retrieval.

## TDD expectations

- Add policy and security tests first.
- Include tests for:
  - private tenant flow blocked when external processing is disabled
  - source URL redaction in logs
  - no cross-project document access
  - audit record contains provider and source URL kind
  - lineage records for both success and error paths
  - retention cleanup removes derived artifacts according to policy
  - legacy ambiguous rows do not become personal evidence

## Acceptance checks

- No internal-only URL can escape into the provider request.
- Security and retention behavior remains explicit.
- Personal and work scopes remain isolated.
- The stored lineage contract is sufficient to reconstruct provider choice, URL kind, and fallback reason.
