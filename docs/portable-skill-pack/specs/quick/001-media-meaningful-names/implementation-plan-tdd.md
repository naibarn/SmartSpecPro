# TDD guidance

## Test-first cases

1. Resolver returns `คาเฟ่รักในเวทีพิเศษ ตอนที่ 29-1` for structured series/episode/shot metadata.
2. Resolver appends clip when present and omits it when absent.
3. Explicit display title wins over prompt and technical artifact labels.
4. Generic prompt fallback is cleaned, bounded, and does not choose the model ID when meaningful prompt text exists.
5. Filename sanitization removes separators/quotes/control characters, preserves `.png`/`.mp4`, and handles Unicode safely.
6. Media History Add to Gallery sends the resolver title and full prompt description.
7. Public Gallery download sends `Content-Disposition` with the derived filename only when `download=1`; normal playback remains streamable and accepts ranges.

## Expected initial failures

- No shared resolver exists.
- Media History still sends the raw prompt.
- Public route has no download filename branch.
- Vertical Drama naming metadata is absent from the task envelope for affected new call sites.

## Fixtures and mocks

Use small task fixtures with nested `parameters.extra_params` and `resultData.extra_params`; include both non-VD generic tasks and VD tasks. Keep database/storage mocks scoped to the route tests. Do not require real provider calls, R2, or browser credentials.

## Regression checks

- Existing `remotion_render_mp4` artifact contract tests remain unchanged and passing.
- Existing public route tests for published/unpublished/tenant/range behavior remain passing.
- Existing Gallery search tests remain passing.
- Run focused TypeScript checks after integration.
