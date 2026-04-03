# Section 05 — Document Rendering, Versioning, and Access

## Overview

This section implements invoice PDF generation, language variants, sync-header versioning, replace archives, and secure download access for PDFs and evidence.

## Files to create or modify

| File | Action |
|---|---|
| `apps/web/server/services/billing/documentService.ts` | Render/store/list invoice documents |
| `apps/web/server/services/billing/documentAccessService.ts` | Signed/proxy access issuance |
| `apps/web/server/routers/billing.ts` | Invoice PDF download/list endpoints |

## Implementation details

- Render documents from invoice snapshots only.
- Support Thai, English, and bilingual renditions under one invoice row.
- Track document language, version, render reason, render actor, and timestamp.
- Implement sync-header for editable unpaid invoices with before/after diff capture.
- Archive replaced documents while preserving secure admin access.
- Serve PDFs and recovery evidence with short-lived signed or proxy-gated access plus audit logging.
- Implement redaction policy for sensitive fields in list/detail contexts that do not require full PII exposure.
- Define retention behavior for raw payloads, evidence, and archived document variants.

## Tests to write first

- Multi-language variant tests under one invoice number.
- Sync-header version increment tests.
- Signed access ownership and expiry tests.
- Replaced archive visibility tests.
- Sensitive-field redaction tests.
- Retention policy tests.
