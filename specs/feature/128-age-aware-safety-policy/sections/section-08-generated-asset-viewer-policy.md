# section-08-generated-asset-viewer-policy

## Goal

Apply age policy when users view, download, share, remix, or reuse generated assets. Creator-time safety is not enough because a later viewer may have a stricter policy, incomplete profile, or different jurisdiction.

## Depends On

- `section-01-policy-foundation`
- `section-07-media-async-enforcement`

## Files In Scope

- Generated asset/library/history services and routes.
- Media output metadata schema and migration if needed.
- Preview/download/share/remix/reference endpoints.
- Frontend asset cards/viewers only where needed for safety states.
- Tests for viewer-time decisions.

## Test First

Add tests for:

- Child/unknown viewer cannot access asset marked teen/adult/restricted.
- Teen viewer follows tenant policy and jurisdiction thresholds.
- Adult viewer can access adult asset only if policy and protected-surface state allow it.
- Download/share/remix/reference reuse are separately evaluated actions.
- Existing assets without metadata default to conservative policy and may require review.
- Public share links evaluate the viewer context, not only the creator context.

## UI/UX Contract

- States: allowed asset, blocked asset, requires profile completion, requires PIN unlock, requires review, metadata missing fallback, share disabled.
- Responsive matrix: asset grids/list rows must keep stable card dimensions when blocked placeholders replace previews.
- Accessibility: blocked placeholders need readable labels and actionable buttons where allowed; thumbnails must not leak restricted content behind overlays.
- Browser evidence expected during implementation: desktop/mobile asset grid with mixed allowed/blocked assets and public share blocked state.

## Implementation Requirements

- Store or derive safety metadata: creator age band at creation, policy version, content safety category, minimum viewer age band, review status, and provider moderation signals.
- Add server-side checks on every asset operation; frontend hiding is not sufficient.
- Do not render restricted thumbnails to the client when blocked.
- For shared/public links, require a viewer policy context. Unknown viewers should receive unknown/child-safe behavior unless the product has a verified public age gate.
- Ensure asset deletion/export/privacy workflows still operate for the owner where legally required, even if content display is blocked.

## Integration Notes

- Depends on media job metadata from section 07.
- Observability/review workflows in section 11 should consume missing metadata and review-required states.

## Verification

- `cd apps/web && pnpm test -- generatedAssetSafety`
- `cd apps/web && pnpm test -- media`
- `cd apps/web && pnpm check`

## Handoff

After this section, age policy applies to generated content lifecycle, not only prompt submission.
