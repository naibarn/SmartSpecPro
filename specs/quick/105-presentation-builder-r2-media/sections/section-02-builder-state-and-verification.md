# Section 02: Builder State and Verification

## Ownership

Own Presentation Builder client state/copy and regression verification. Preserve existing layout and localization patterns.

## Target files

- `apps/web/client/src/components/presentation/PresentationArticleGeneratorDialog.tsx`
- related client tests
- `apps/web/server/services/presentationArticleGenerator.ts` only if the `__dirname` failure is proven in its boundary
- shared presentation contract only if a slot state cannot be represented by the current JSON

## UI/UX Contract

- Target user: a user preparing slides and reviewing generated visual slots.
- State matrix: generating, ready with durable media, failed, expired/unavailable, retrying.
- Text-only fallback: explain that the media is unavailable and provide `Regenerate`/`Retry`; never show a broken provider image as if it were valid.
- Accessibility: status text is readable by screen readers; retry controls have explicit labels and disabled/loading states.
- Responsive: preserve the existing two-panel builder; status content must wrap on narrow widths without hiding the action.
- Copy: follow existing Thai/English strings and safe server error sanitization.
- Browser evidence: focused component test and a manual route check if a configured browser environment is available.

## Acceptance

- Builder no longer surfaces `__dirname is not defined` as the only error.
- A failed/expired slot is text-only and recoverable.
- Sequential media generation keeps the progress UI truthful and does not enable Slide JSON import before required slots are ready.
