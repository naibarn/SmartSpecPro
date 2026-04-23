# Decision Log

## Depth selection

Chosen depth: `standard`

Reason:

- The feature is broad, but it is still one coherent product track.
- The work can be decomposed into a small number of sections without requiring the full `deep-plan` workflow.
- The existing Library and markdown editor foundations make this a continuation of current code, not a greenfield rewrite.

## Key scoping decisions

1. Keep `/document-management` as the entry point.
2. Keep the current Library surface and add knowledge-centric navigation on top of it.
3. Treat Obsidian as a model for the mental model, not a literal UI copy.
4. Scope Bases-like support to saved views, filters, sort, grouping, and columns first.
5. Treat Canvas as a later workspace phase, not a blocker for the knowledge cache foundation.
6. Keep search as a fallback and discovery tool, not the only way to access content.
7. Use `library_items.id` as the canonical note identity for derived relations.
8. Resolve links deterministically by path, then unique title, then unique alias; ambiguous matches must not be guessed.
9. Keep v1 navigation-first: derived note relations may enrich views and filters, but do not automatically alter RAG context or ranking.
10. Treat non-markdown files and cloud references as capability-limited in knowledge modes until they have an explicit cache contract.
11. Bridge the vault into agent skills through explicit context packs rather than implicit graph expansion.
12. Require context-pack resolution to enforce permissions at request time and return citation-backed note context.
13. Defer any structured fact layer until after context packs and relation safety are proven; markdown remains the source of truth.
14. Treat persisted Library context packs as a source for the existing runtime `ContextPack`, not as a second competing runtime schema.
15. Add explicit list/resolve contracts for Library context packs before considering autonomous expansion or auto-attach behavior.
16. For delegated workers, use narrow context-pack scopes and grants instead of piggybacking on blanket library search or read access.

## Main risks

- Relationship extraction can leak inaccessible content if permissions are not enforced at read time.
- A graph / backlinks cache can drift stale if saves, renames, or deletes do not invalidate it correctly.
- Saved views can balloon scope if formulas or arbitrary query language are too broad too early.
- Canvas can expand into a full editor unless it is clearly framed as a knowledge workspace.
- Title or alias collisions can silently create incorrect backlinks unless the resolution contract is explicit.
- Existing markdown content can make rollout look incomplete unless tenant-level backfill is part of the launch plan.
- Agent-facing memory can become noisy or unsafe unless context reuse is curated, permission-checked, and citation-backed.
- The runtime and delegated-worker layers can accidentally over-broaden access unless context-pack resolution is kept separate from raw note-read grants.
