# Section 07 — Prompt and Media Propagation

## Goal

Use approved object references in image/video workflows and provide explicit,
credit-safe object prompt/image actions.

## Implementation

- Add versioned object prompt request/result with context fingerprint and
  idempotent retry state.
- Add explicit confirmation and credit admission before image generation;
  persist generated media as draft until approved as canonical/detail/alternate.
- Reuse managed media URL resolution, existing job/credit ledgers, and
  request-specific provider failure classification.
- Feed resolved object assets into image prompt, start-frame, video prompt, and
  media bundle paths with bounded count/bytes and deterministic order.
- Missing object work is a warning/skip and never a prerequisite.

## Tests first

Test prompt context/versioning, idempotency, paid admission/draft approval,
provider failure isolation, caps, and propagation to every bundle type.

## Ownership and acceptance

Own generation-facing object prompt/media adapters and focused tests. Preserve
existing character/wardrobe/location continuity and commercial policy code.

## UI/UX Contract

### Target User / JTBD

Creator wants a context-grounded prompt or object image while knowing when an
action can spend credits.

### Surface Inventory

Prompt result, explicit generation confirmation, credit estimate, draft/approve
state, provider warning, and retry control.

### Component Map

Catalog UI requests prompt/generation; existing media/job/credit services own
admission and reconciliation.

### State Matrix

Unavailable, ready, confirming, queued, draft, approved, failed, and retrying
states are explicit; no generation request is hidden behind detection.

### Responsive Matrix

Confirmation and credit details remain visible in stacked mobile cards and wide
desktop panels.

### Accessibility Acceptance

Credit-impacting actions require labelled confirmation, focus return, and
keyboard cancellation; failures use aria-live text.

### Copy Contract

Thai-first copy distinguishes free prompt save from paid image generation and
uses English fallback for provider errors.

### Browser Evidence Required

Prove prompt-only action, confirmation gate, draft result, cap warning, and
provider failure that leaves storyboard usable.

## Implementation Record

Implemented the versioned non-paid prompt preview/request ledger and shared
context prompt builder. Paid object-image generation now uses the existing
model/credit admission adapter through explicit confirmation and imports
completed results as generated catalog assets.
