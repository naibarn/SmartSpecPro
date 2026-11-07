# P1 Focused Test Plan

## Shot-intent integration

Test valid suggestion merge, omitted optional suggestion, timeout, provider unavailable, malformed schema, invalid character/shot IDs, stale storyboard revision, user edits made after planning, and retry-budget exhaustion. Fallback must retain the exact base storyboard and permit start-frame/video actions.

## Visual canon and references

Test stable style/look-lock projection across storyboard, start-frame prompt and video prompt; character identity, wardrobe and prop-role facts; location continuity and scene-state anchors; deleted/cross-tenant assets; old records without optional fields; missing stop frame; and a model that supports first-frame-only.

## Provider routing

Matrix tests for authorized/configured compatible provider, disabled provider, tenant allowlist denial, unsupported reference count/duration/resolution/transport, timeout, one allowed fallback and no further fallback. Confirm budget denial uses the existing financial control and is not presented as CPE score failure.

## UI / approvals

Browser or component tests show a previewable warning/suggestion and keep image/video actions usable. Explicit manual approval, reject, cancel, and restart remain unchanged. CPE off is byte-compatible at request-contract boundaries.

## Commands

Use focused Vitest suites under `apps/web/server/services/__tests__` and `apps/web/client/src/components/verticalDramaSeries/__tests__` with `pnpm --filter @smartspec/web exec vitest run <focused files>`. Browser acceptance uses the repository's authenticated UI verification route when an implementation slice reaches it; do not run a heavy local typecheck.
