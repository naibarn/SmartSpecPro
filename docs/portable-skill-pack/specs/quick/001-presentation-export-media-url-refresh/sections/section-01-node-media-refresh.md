# Section 01 — Node media refresh

## Ownership

Own `apps/web/server/routes/slideRender.ts` and its focused test file only.

## Work

- Confirm managed proxy/upload references are normalized and presigned on each
  request.
- If a minimal code adjustment is required, keep it limited to supported
  managed URL forms; do not fetch arbitrary direct URLs.
- Add/adjust tests for fresh presign calls and unchanged non-managed URLs.

## Acceptance

- Current deck 449 managed URL resolves to a new presigned URL in the internal
  HTML response.
- Internal auth/IP/token checks remain unchanged.
- Node route tests pass.
