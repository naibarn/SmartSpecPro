# Section 05 — Context Detection

## Goal

Suggest/link objects from story context without mutating read paths or blocking
creator work.

## Implementation

- Build a pure context pack from series story, episode synopsis/outline,
  neighboring episode boundary, shot text, scene/place, time/day, travel and
  continuation markers, aliases, and manual decisions.
- Use candidate extraction followed by context/continuity scoring. Same
  place/time or travel continuation favors reuse; a new place/day does not.
- Persist detector version, evidence, confidence, context fingerprint,
  decision, expiry, retry/backoff, and suggestion ID.
- Add episode procedures `getObjectReferenceSuggestions` and
  `reviewObjectReferenceSuggestion` plus link/reset semantics.
- Remove detection side effects from `getEpisodeDetail`; enqueue an advisory
  mutation/outbox/job with dedupe and terminal state.
- Honor manual remove/lock tombstones until explicit reset. Never call paid
  generation.

## Tests first

Test continuity/new-day cases, alias evidence, thresholds, dedupe, expiry,
manual precedence, bounded retries, and read-pure episode detail.

## Ownership and acceptance

Own context builder, detector, advisory job/outbox integration, and suggestion
procedures. Failures resolve to warnings and logs, never thrown episode blocks.

## UI/UX Contract

### Target User / JTBD

Creator needs to understand and review an object suggestion without being
blocked by detection uncertainty.

### Surface Inventory

Shot suggestion chip, evidence/reason panel, accept/reject/reset actions, and
non-blocking detector status.

### Component Map

Episode suggestion procedures feed storyboard UI; this section owns detector
state, not the catalog layout.

### State Matrix

Queued, suggested, accepted, rejected, expired, retrying, and failed states
show evidence and next action; failed remains dismissible.

### Responsive Matrix

Suggestions collapse into a compact details disclosure on tablet/mobile and
remain readable beside the shot on desktop.

### Accessibility Acceptance

Evidence is text-readable, controls are keyboard reachable, and status is
announced without color-only meaning.

### Copy Contract

Use “แนะนำจากบริบท” / “Suggested from story context” and explain uncertainty;
avoid claiming certainty for heuristic matches.

### Browser Evidence Required

Prove same continuation suggestion, different-day no-force behavior, review,
manual removal persistence, and read page availability during detector failure.

## Implementation Record

Implemented as a background advisory trigger from the episode workspace plus a
durable suggestion query and review/reset procedures. Suggestions are shown on
the relevant shot with explicit “ใช้/ข้าม” actions; `getEpisodeDetail` remains
read-pure and refresh does not write catalog links.
