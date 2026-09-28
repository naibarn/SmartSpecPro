# Section 04 — Media History UI

## UI/UX Contract

- Target user: Media Studio creator reviewing and reusing generated image, video, or audio.
- Surface: Media Studio History gallery/sidebar, preview, open/download/reuse actions.
- State matrix: loading; empty; R2 ready; storage pending; provider fallback warning; provider expired/unviewable; R2 missing/error; retrying.
- Responsive: cards remain usable on mobile width; status label and retry action do not rely on hover; media preview must not overflow or shift layout.
- Accessibility: visible text status, semantic buttons, keyboard focus, screen-reader labels for retry/fallback/expired state, sufficient contrast, no forced autoplay.
- Copy: Thai and English localized labels for R2 ready, saving, temporary provider fallback, provider expired, and storage unavailable; fallback keys must be safe if one locale is missing.
- Browser evidence: authenticated route test must confirm R2 is selected when present and expired state is visible when neither source is playable. Live R2/browser proof is reported separately if unavailable.

## Ownership

Own Media Studio task types, URL-selection helpers, history card/status rendering, locale keys, and focused UI tests.

## Acceptance

R2 is always the default source; provider fallback is visibly temporary; expired provider links never silently render as healthy media.
