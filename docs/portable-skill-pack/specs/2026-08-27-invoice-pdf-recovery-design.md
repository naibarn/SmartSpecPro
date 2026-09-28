# Invoice PDF Recovery Design

## Goal

Ensure paid or pending invoices can obtain a PDF when the renderer temporarily fails, without rolling back payment or credit state.

## Design

- Keep payment approval independent from document rendering.
- Record a redacted, retryable `invoice_document_render_failed` audit event whenever best-effort rendering fails.
- Make document recovery process each missing invoice independently and treat a null `pdfFileUrl` as missing.
- Keep customer authorization and storage access unchanged; recovery only creates the invoice document artifact.

## Runtime recovery

Enable the existing Playwright renderer, restart the backend so the setting is loaded, and run the existing document recovery job. Verify the database row, storage object, and authenticated access response.

## Validation

Focused billing/UI tests, Web typecheck, renderer smoke, document coverage query, and a real PDF fetch are required. Browser and production deployment checks remain separate evidence.
