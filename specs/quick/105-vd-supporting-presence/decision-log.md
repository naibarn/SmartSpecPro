# Decision log

## Depth

Standard quick-plan. The feature crosses backend generation, shared JSONB
contracts, prompt assembly, router persistence, and an existing React shot card,
but does not require a new table or provider attachment contract.

## Key decisions

1. Use `supportingPresence`, not `characters`, for generic visible roles.
2. Store the effective manual value on the start-frame frame; use storyboard
   values only as the pre-plan/legacy fallback.
3. Treat user customization as authoritative with an explicit marker, including
   an explicit empty array to suppress auto entries.
4. Keep role counts bounded and prompt-facing; do not attach portraits.
5. Keep auto-detection shot-local and based on the shot's own fields.
6. Do not auto-regenerate images after a detected mismatch.

## Self-review fixes

- Added suppression semantics so dismissing a false positive survives
  regeneration.
- Added manual add/edit/remove controls instead of a read-only badge.
- Added legacy fallback and explicit exclusion from portrait resolution.
- Added count bounds and a provider prompt constraint against extra people.
