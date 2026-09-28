# Section 01 — safety and context

Ownership: `apps/web/server/services/verticalDramaStorySafety.ts`, script/story generation prompt params, memory context helpers, and their focused tests.

Implement a deterministic analyzer that distinguishes benign story facts from combinations likely to trigger provider moderation. It must never invent a policy category; findings are risk signals and safe rewrite directives. Add a bounded future-episode constraint builder that reads the next planned/materialized episode without changing the canonical memory bundle. Thread both into script generation and apply the output gate before credits are deducted or data is persisted.

TDD: test benign scenes, risk combinations, bounded lengths, missing next episode, and no future-knowledge leakage.

Acceptance: initial and repair prompts carry the same safety contract; high-risk output is terminal for the candidate and cannot reach media generation.
