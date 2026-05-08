# Section 03 Security Review

Date: 2026-05-06

## Verdict

PASS

## Trigger

Modified tRPC router: `apps/web/server/routers/media.ts`.

## Review

- Auth boundary remains `protectedProcedure` for media generation endpoints.
- Magnific validation runs after selected model resolution and before credit deduction/provider submission.
- User-supplied `webhook_url` and `callback_url` fields are rejected recursively for Magnific requests.
- Reference image/video URLs pass the existing public-safe URL or tenant-local relative path validators.
- DB rows with explicit `configJson: null` are not silently constrained by unrelated static config, preserving existing provider behavior.

## Findings

No HIGH or CRITICAL findings.

## Residual Risk

- Later provider-client sections must continue to avoid forwarding user-controlled callback/webhook values to Magnific.

