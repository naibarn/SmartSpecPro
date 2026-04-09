# Usage Guide

## Quick Start

1. Open Chat and choose `New Chat (Personal)` to create a locked personal finance thread.
2. Send a text message like `จ่ายค่าแท็กซี่ 180 บาท` to create a draft transaction.
3. Upload a receipt or invoice into the same personal chat, then use the finance ingest flow to create an OCR-backed draft.
4. Review the draft card, edit missing fields if needed, then confirm it to create the final transaction.
5. Open the summary actions to view daily or monthly totals computed from confirmed transactions only.
6. Use finance evidence search to find linked receipts and supporting documents within the active tenant/project scope.

## Example Flow

### Personal text draft

```text
จ่ายค่าอาหารกลางวัน 220 บาท
```

The finance router will:

1. Parse the message into a structured draft.
2. Mark the draft as `needsClarification` if fields are missing.
3. Keep the scope locked to the authenticated user and the personal project.

### OCR-backed draft

1. Upload a finance-approved file type such as PDF, JPEG, PNG, WebP, GIF, HEIC, or HEIF.
2. Make sure the source item keeps the same tenant, owner, and project as the active personal conversation.
3. The OCR service stores the extraction trace, creates a draft, and logs `finance_document_ocr_started` / `finance_document_ocr_completed` / `finance_document_ocr_failed`.

## API Reference

### Chat

- `chat.createPersonalConversation`
  - Creates a locked personal conversation with `projectId = "personal"`.
- `chat.updateConversation`
  - Rejects any attempt to retarget a personal conversation to another project.

### Finance

- `finance.parseTextToDraft`
  - Builds a structured draft from chat text.
- `finance.parseDocumentToDraft`
  - Converts an OCR extraction into a draft.
- `finance.ingestFinanceDocument`
  - Runs the upload-to-OCR-to-draft pipeline from a library item.
- `finance.confirmDraft`
  - Confirms a draft idempotently into a transaction.
- `finance.updateDraft`
  - Applies versioned edits to an open draft.
- `finance.voidTransaction`
  - Voids a confirmed transaction safely and repeatably.
- `finance.listTransactions`
  - Lists transactions for the active tenant/project scope.
- `finance.getDailySummary`
  - Returns a timezone-aware daily aggregate.
- `finance.getMonthlySummary`
  - Returns a timezone-aware monthly aggregate.
- `finance.createRecurringRule`
  - Creates a recurring rule that emits drafts first by default.
- `finance.pauseRecurringRule`
  - Pauses a recurring rule.
- `finance.resumeRecurringRule`
  - Resumes a recurring rule.
- `finance.listLinkedDocuments`
  - Lists evidence linked to a transaction.
- `finance.searchFinanceEvidence`
  - Searches supporting library evidence within the active scope.

## Operational Notes

- Personal finance data is owner-only.
- OCR uses a file allowlist, signature validation, bounded workers, and request-side abuse gating.
- Retrieval is filtered by tenant, project, scope, and ownership before ranking.
- Deleted personal evidence is cleaned from library rows, chunks, and vector artifacts on purge.

