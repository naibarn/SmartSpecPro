# Interview Notes

No blocking domain questions remained after reading the spec and the repo. The implementation can proceed with the spec-defined defaults and the codebase patterns already discovered.

## Q1. Should tenant admins be able to read personal finance data?

Answer: No. Personal finance is owner-only by default, and the plan should fail closed if `owner_user_id` does not match the authenticated user.

## Q2. Should cloud OCR or cloud LLM providers be allowed for finance documents?

Answer: Only when tenant policy explicitly allows outbound processing of finance documents. Otherwise the pipeline must use a local / approved path or fail closed.

## Q3. Should legacy library rows without `project_id` be included in personal finance retrieval?

Answer: No. They stay in compatibility mode until they are backfilled or explicitly remediated, and ambiguous rows must be excluded from personal retrieval.

## Q4. Should model output be trusted for balances or summaries?

Answer: No. All authoritative amounts and balances must come from database queries. The model may only turn computed results into readable prose.

## Auto-Decisions

- Personal finance uses `projectId = "personal"` as a reserved per-user namespace.
- Personal conversations are locked server-side; the UI lock is only a convenience layer.
- Finance data is confirmed via draft-first flow before it becomes authoritative.
- OCR output is untrusted input and must be validated before write paths.
- The plan should follow the repo’s existing TypeScript + Vitest conventions.
- The implementation should reuse the existing library upload / sandbox / dedupe patterns rather than inventing a new document subsystem.

