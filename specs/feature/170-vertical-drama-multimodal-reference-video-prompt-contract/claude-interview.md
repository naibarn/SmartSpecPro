# Deep-plan interview transcript

## Interview status

No blocking business question was asked. The user explicitly requested
autonomous execution from deep-plan through deep-implement, and the written
spec plus prior clarification already fixes the domain decisions. Technical
choices are recorded as auto-decisions below.

## Q1 — Stop-frame optionality

**Answer:** Every shot may have a stop frame or may not have one. A stop-frame
prompt alone never counts as a stop frame; only a real usable image asset does.

## Q2 — Reference modalities and cardinality

**Answer:** Start and stop are image-only. `references[]` accepts zero-to-many
images, videos, and audio files in any mixture, including many items, from local
disk or Library.

## Q3 — Prompt finalization

**Answer:** All video prompt additions must happen before the final optimization
skill. The optimized result is the final UI/persisted/provider prompt; no code
may append content afterward. User edits require re-optimization.

## Q4 — Model evolution

**Answer:** Omni Flash 1.1, Seedance 2.0/2.5, and MiniMax H3 must be handled by
separate capability/mode profiles. Future releases such as Seedance 2.6 or
MiniMax H4 should be registered through configuration for existing transports,
without changing the canonical contract or UI.

## Auto-decisions

- Use the existing managed `media_assets` and tenant-scoped resolver as the
  source of truth; do not persist provider URLs as canonical media.
- Generalize existing shot-reference rows/projections and version worker
  payloads; preserve old image-only readers.
- Use Vitest for TypeScript/web tests and pytest for Python provider tests.
- Default over-limit behavior is block with an actionable list. Only an
  explicit selected-subset action creates a new bundle revision.
- Use an inspection skill before authoring and a terminal optimization skill
  after all deterministic composition; derived/unavailable modality evidence is
  labelled and never overstated.
- Runtime model capability/profile data is authoritative. Official provider
  documentation is a baseline/audit input, not a bypass for runtime limits.
