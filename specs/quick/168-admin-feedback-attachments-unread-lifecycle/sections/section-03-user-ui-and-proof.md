# Section 03 — User Reply Media, Close, and Proof

## Ownership

Own `MyFeedback.tsx` and focused user-surface tests, plus evidence artifacts.

## Requirements

- Render non-internal reply images beneath each reply using authenticated media.
- Reuse the fullscreen preview/lightbox interaction and keep original ticket
  attachments readable.
- Let the owner close an active ticket; closed tickets clearly disable reply
  behavior if no reply composer exists and never accept future API replies.
- Verify internal-note attachments are absent from the user payload/render.

## Acceptance

Focused jsdom tests pass for nested image rendering, close action, and protected
media props. Browser evidence records mobile/tablet/desktop behavior and any
environment limitation without claiming skipped checks as pass.
