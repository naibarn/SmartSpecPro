# Section 03 — Memory, retrieval, snapshots, and checkpoints

## Scope

Extend existing series memory with long-form event payloads, the canonical
relationship graph projection, arc/block snapshots, bounded retrieval packs,
checksums, and approved retcon lineage.

## Owned paths

- `apps/web/shared/verticalDramaSeries/seriesMemoryState.ts`
- `apps/web/shared/verticalDramaSeries/memory.ts`
- `apps/web/server/services/verticalDramaSeriesMemoryProjection.ts`
- `apps/web/drizzle/schema.ts` and approved migrations only if required
- memory/projection/checkpoint tests

## Design

The graph revision is a first-class memory artifact, not only a projection of
`VdRelationshipState`. Fold typed relationship deltas, derive the legacy pair
state for compatibility, and atomically persist a reverse dependency index from
edge to episode/shot/dialogue/memory/recap/look/world references. Retrieval
packs must include the graph revision and both fingerprints; stale or missing
graph state is a blocking finding for strict generation.

Retrieval must be viewpoint-scoped. Character-writing calls receive only facts
allowed by the target character's `knownByCharacterKeys` and episode disclosure
state; critics may receive a redacted provenance view. Each retrieval pack
records the resolved relationship-redaction policy version/fingerprint, and a
change fences dependent packs and repair attempts. Knowledge leakage is a
blocking finding. Accepted writes use one idempotent transaction or a
recoverable outbox across events, projections, dependency index, checkpoint,
and candidate status.

Use existing append-only `vertical_drama_memory_events` and
`vertical_drama_memory_snapshots` first. Add event kinds/payload schemas for
arc state, mystery evidence, relationship-edge/disclosure changes, lifecycle,
world rule, advantage, look, and retcon. Relationship events retain edge IDs,
source evidence, affected characters, valid episode range, and known-by state.
An edge correction creates an impact-closure checkpoint instead of silently
rewriting old episode memory.

Graph projection must preserve belief state separately from canonical relation
truth (`unknown`, `suspected`, `believed`, `known`, `false`). Fold/retrieval
fixtures must reject self-edges, invalid inverse/cardinality states, parentage
cycles, and a viewpoint belief being promoted to canonical truth without
evidence.
Use transactional row locking/optimistic versioning, preserve user edits, and
never delete/supersede an event without an approved append-only retcon.

Snapshot compaction is lossless for canonical truth. It may replace prose with
structured recaps, but must retain hard facts, evidence IDs, unresolved
threads, mystery rows, graph revisions/disclosure state, advantage/cost,
character lifecycle, look state, world-rule limits, capability decisions, and
retcon lineage. Before publishing a compacted snapshot, replay the retained
events and compare required-ID sets plus canonical fingerprints with the
pre-compaction projection. A mismatch leaves the snapshot `needs_repair` and
blocks dependent generation. Snapshot metadata records the compaction policy
version and pre/post fingerprints.

## TDD acceptance

- Reordered/duplicated episode memory folds deterministically.
- Retrieval always includes immutable anchors and reports omitted paths.
- Concurrent writers do not lose a block or user edit.
- Malformed optional memory degrades safely without erasing truth.
- Retcon requires superseded IDs, approval, and impact closure.
- Relationship graph snapshots preserve family side, in-law/faction links,
  disclosure, provenance, and evidence IDs.
- Compaction round-trip preserves every required truth ID and rejects a
  deliberately lossy snapshot.
- A source/locale/genre/duration/horizon/policy/graph revision change fences
  dependent retrieval packs and blocks until a fresh candidate snapshot exists.

## Dependencies and proof

Depends on Sections 01–02. Run existing memory fold/projection tests plus new
transaction/retrieval fixtures before wiring generation.

## UI/UX Contract

### Target User / JTBD

N/A — memory service; user-facing memory diagnostics are Section 09.

### Surface Inventory

N/A.

### Component Map

N/A.

### State Matrix

N/A — persistence states are represented by server status/findings.

### Responsive Matrix

N/A.

### Accessibility Acceptance

N/A — no browser surface is changed here.

### Copy Contract

N/A.

### Browser Evidence Required

N/A — service/concurrency proof is sufficient for this section.

## Implementation notes

`verticalDramaLongFormMemory.ts` provides graph-aware retrieval packs,
redaction-policy lineage, reverse dependency indexes, lossless-compaction
checks, and bounded repair-impact calculation while preserving existing
append-only memory storage seams.
