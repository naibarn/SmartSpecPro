# Feature 133 — Interview Transcript (Phase 1 scoping)

Date: 2026-07-12
Context: The full spec (`spec.md`) and research (`claude-research.md`) already
exist; the interview only resolves the remaining plan-shaping, preference-driven
Phase-1 scope decisions. Spec §24 open questions with sensible defaults were not
re-asked (music = uploads/library only; @remotion/player license = a verification
task; Expert writeback/GPU/campaigns = out of MVP scope).

---

### Q1 — Studio scope for Phase 1

**Question:** Catalog Video Studio is the first studio, but should Phase 1 also
include a direct authoring path to exercise the pipeline without catalog data?

**Answer: Catalog + Motion (recommended).** Ship Catalog Video Studio *and* a
minimal Motion Studio authoring surface (edits the Neutral Project Schema / picks
templates directly). Rationale: gives an end-to-end compiler→render test path
that does not depend on marketplace product data, so the render pipeline can be
validated and debugged in isolation. Motion Studio in Phase 1 is deliberately
thin — template pick + param edit + preview + render, no advanced timeline.

### Q2 — TTS/narration in the MVP

**Question:** Does the MVP need narration/TTS for Catalog videos, or defer TTS to
Phase 2?

**Answer: TTS in Phase 1 (recommended).** Reuse `ttsService.synthesize` to
generate narration audio in Phase 1, feeding the new `audio` layer type + the
loudnorm post-pass. Rationale: a spoken-narration Catalog video is materially
more complete than caption-only, and the reuse cost is low (the service exists).
Caption cues remain available in parallel.

### Q3 — Brand Kit scope in the MVP

**Question:** How much of Brand Kit ships in Phase 1?

**Answer: minimal + locks (recommended).** `brand_kits` table with colors /
fonts / logo / caption preset, plus **locks** enforced as hard constraints at
compile time (spec §10.3). Rationale: brand consistency (locked colors/fonts) is
the whole point of a brand kit; shipping tokens without locks would let the brand
identity drift in the very first release. Advanced fields (motion personality,
camera behavior, transition/music style) can arrive later, but locks are in from
day one.

---

## Resulting Phase-1 scope deltas vs spec §22 Phase 1

- **+ Motion Studio (thin)** added alongside Catalog Video Studio as a
  catalog-independent authoring/test surface (Q1). Two studio surfaces, one
  shared `video_projects` document + compiler + render path.
- **TTS confirmed in-scope** — narration generation via `ttsService.synthesize`
  → `audio` layer → loudnorm post-pass (Q2).
- **Brand Kit includes lock enforcement** at compile time, not just token
  storage (Q3).

All other Phase-1 scope items from spec §22 Phase 1 are unchanged.
