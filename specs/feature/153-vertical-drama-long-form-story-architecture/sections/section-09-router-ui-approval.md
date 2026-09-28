# Section 09 — Router, UI diagnostics, and approval

## Scope

Expose blueprint, block, memory-pack, closure-review, repair, approval, and
progress operations through the existing tRPC router and assurance UI.

## Owned paths

- `apps/web/server/routers/verticalDramaSeries.ts`
- existing assurance/progress panel and localization files
- focused router/jsdom/browser tests

## Design

The draft UI must show graph readiness, revision/fingerprint, unresolved
relation questions, and SLO/cost estimates before deep generation. The graph
diagnostic needs timeline/partial loading and candidate-vs-active diff for
120–500 episode stories; `getCharacterRelationshipGraph` owns bounded filter,
cursor, page-size, and redacted aggregate-diff behavior. Graph edits create an
approved candidate revision and never mutate canonical truth directly.

Selecting two characters must open a bounded, explainable relationship path
for the chosen episode, including direct/derived status, every returned source
edge, family side/group, evidence, and any ambiguity finding. Multiple valid
paths are shown as separate candidates; the UI shows the configured hop/path
ceiling and a truncation indicator when more candidates exist. The UI must
distinguish a derived “น้องเมีย” path from an authored direct edge.

Graph diagnostics and relationship-path responses must apply tenant,
user-permission, and viewpoint redaction before returning edges, path
candidates, evidence, or provenance. The response exposes the resolved
redaction policy version/fingerprint for diagnostics and stale-result checks;
an optional expected fingerprint mismatch is rejected rather than returning a
possibly stale path.
Secret edges may be shown only as a
redacted finding/count when the caller is authorized to know that a finding
exists; hidden edge IDs, evidence payloads, and known-by facts must never leak
through a debug or candidate-vs-active view.

Closure review must display the persisted benchmark result: sampled episodes,
per-dimension scores/confidence intervals, agreement, adjudication state,
confidence status, and whether the comparable-quality label is eligible. A
high aggregate score must not hide an insufficient-confidence or critical-floor
failure state.

Reviewer and adjudicator surfaces must use separate blind sessions, hide the
other reviewer's scores, show candidate/policy/sample fingerprints, and make
the finalization reference visible before approval. A reviewer submission is
not an activation approval.

Expose graph edit preview, proposal, and approval with optimistic revision
conflict handling and an exact affected-content preview. Strict long-form
activation must visibly require candidate/final-gate approval and must never
fall through to the legacy direct active-bible persistence path.

Responses preserve Feature 152 status taxonomy. UI distinguishes partial,
needs repair, awaiting approval, blocked, reconciliation, and success; no
success toast for incomplete content. Show episode/block/arc coverage,
unresolved mysteries/threads, relationship graph findings, cast/look/world
findings, cost, lease/heartbeat freshness, cancellation/pause state, and safe
actions. Provide explicit Pause, Cancel, and Resume actions with confirmation
and credit-reconciliation status; browser disconnect must not be presented as
cancellation.
Use existing tokens/components and accessible Thai/English copy.

## TDD acceptance

- Duplicate start is disabled/deduplicated.
- Resume/Repair/Approve actions match server state.
- Candidate versus active version is visible before approval.
- Graph retrieval honors episode/range, family/faction/type/status/disclosure filters,
  bounded pagination, redacted counts, and candidate-vs-active aggregate diff.
- Relationship graph shows parent/sibling/spouse/in-law/faction/friend/rival
  edges, bounded explainable paths, truncation state, and the affected-episode
  set for a suspected contradiction.
- Unauthorized/secret relationship edges and evidence are redacted in graph,
  memory, finding, and candidate-diff views using the same policy as generation.
- Pause/Cancel/Resume actions reflect durable server state and show checkpoint,
  stale-worker, provider-cancellation, and unused-credit reconciliation status.
- Keyboard, focus, responsive, semantic, contrast, and reduced-motion checks
  pass for changed surfaces.

## UI/UX Contract

### Target User / JTBD

Series creators need to understand long-form completion and safely Resume,
Repair, Review, or Approve without mistaking partial work for success.

### Surface Inventory

Series setup, long-form progress, closure review, candidate approval,
relationship graph/timeline, and memory/cast/look/world diagnostics on the
existing Vertical Drama surfaces.

### Component Map

Reuse the existing assurance/status panel and router data loaders. Add mode and
cost summary, arc/block progress, closure ledger sections, finding list, and
candidate-versus-active approval diff without creating a second navigation
system. The relationship graph must support family/faction filters, episode
timeline, evidence/provenance links, suspicious-edge markers, cursor/page-size
pagination, candidate-vs-active aggregate diff, and a bounded
“repair affected content” action.

### State Matrix

Loading, running, partial, needs repair, awaiting approval,
awaiting reconciliation, blocked, failed, cancelled, succeeded, and legacy
compatibility-empty states must each have explicit copy and action behavior.

### Responsive Matrix

Desktop shows the full ledger table; laptop collapses secondary columns; tablet
uses grouped cards; mobile uses stacked progress/finding/action cards. No
critical finding or action may be hidden only in an overflow table.

### Accessibility Acceptance

Keyboard navigation and visible focus, semantic headings/table labels,
screen-reader status updates, minimum contrast, form labels, disabled-state
explanations, and reduced-motion behavior are required.

### Copy Contract

Thai is the default product language with English fallback. Never use a success
message for partial/repair/approval states. Explain exact missing episode,
thread, evidence, guest, world rule, or wardrobe cue and provide the safe next
action.

### Browser Evidence Required

Run focused jsdom tests and a browser capture for desktop and narrow responsive
states when the UI is changed. Record whether live generation/provider and
production proof were performed separately.

## Implementation notes

Added tenant-scoped `getCharacterRelationshipGraph` and
`getCharacterRelationshipPath` operations to the existing compatibility router,
with bounded filters/cursors, redaction-policy conflict fencing,
candidate-active aggregate diff, and bounded explainable paths. Added the
accessible `VerticalDramaRelationshipGraphPanel` with episode/range,
family/faction, status/disclosure filters, candidate diff display, partial
loading, and pair-path inspection. The dedicated blueprint, benchmark, edit,
pause/cancel, and repair-affected-content operations remain outside this
compatibility slice and are not reported as implemented.
