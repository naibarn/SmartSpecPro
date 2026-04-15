# Synthesized Spec

## Feature

Private personal finance ledger inside SmartSpecPro chat, with OCR-assisted document intake and RAG evidence lookup, while keeping personal and work data isolated.

## Core Requirements

1. Users can create a `New Chat (Personal)` conversation.
2. Personal conversations are locked to `projectId = "personal"` and owned by the creating user.
3. Work conversations continue to use the normal project model.
4. Users can type free-form income/expense entries in chat.
5. The system converts natural language into a draft transaction before confirmation.
6. Users can upload receipts / invoices / screenshots and receive OCR-assisted drafts.
7. Users can create recurring finance rules.
8. Daily and monthly summaries are available in chat.
9. Confirmed totals come from database queries only.
10. Supporting documents are searchable and citeable through the existing library/RAG stack.
11. Retrieval must filter by `tenant_id + project_id + allowed_scopes`, and personal retrieval must also require `owner_user_id`.
12. Personal and work evidence must not mix unless the user explicitly duplicates data into another project.

## Data and Domain Rules

- Personal finance is owner-only by default.
- Personal requests fail closed when `owner_user_id`, `tenant_id`, or `project_id` is missing or mismatched.
- Drafts are not authoritative until the user confirms them.
- Recurring rules create drafts first by default unless the user explicitly opts into auto-confirm.
- Transaction amounts are stored in minor units.
- OCR text and extracted fields are retained as audit evidence.

## Security and Privacy Rules

- Use MIME allowlists, file-size caps, and signature validation for finance uploads.
- Reject archives, office docs, password-protected PDFs, and mismatched MIME/signature combinations in the finance path.
- Run OCR / parsing in bounded workers with sandboxing where appropriate.
- Treat OCR text and retrieved documents as untrusted input.
- Keep prompts separate from document text.
- Enforce RLS or an equivalent database backstop on finance tables and retrieval tables.
- Use owner-only semantics for personal data, including against tenant admins unless policy explicitly says otherwise.
- Apply retention and purge policies to drafts, transactions, and linked documents together.

## Existing Platform Constraints

- Reuse the current React + Node/tRPC + PostgreSQL + Redis architecture.
- Reuse the existing library upload and indexing pipeline where possible.
- Reuse existing project-scoped chat memory and retrieval patterns.
- Follow the repo’s existing Vitest test style and server/router/service split.

## Success Criteria

- Personal chat creation is locked and isolated.
- Text entries become drafts and only confirmed items affect totals.
- OCR documents produce draft finance payloads with evidence links.
- Summaries and balances are stable and database-driven.
- Retrieval never crosses personal/work boundaries.
- The implementation remains backward compatible with current chat, memory, and library behavior.

