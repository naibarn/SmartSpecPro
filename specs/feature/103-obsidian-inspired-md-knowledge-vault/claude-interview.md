# Interview Transcript

## Interview Notes

No additional live Q&A was collected after research. The user explicitly asked the planner to continue autonomously and complete the workflow. Per the interview protocol, this is treated as a signal to make the remaining business and technical decisions directly, while recording them here for review.

## Q1. What should v1 optimize for first: human navigation or agent-ready business memory?

Auto-decided answer:

V1 should optimize for **agent-ready business memory as the product differentiator**, while using human navigation improvements as the enabling foundation.

Rationale:

- The feature started as a Library/Document Management improvement, but later requests repeatedly emphasized using Markdown notes as the internal "brain" of the business for agent analysis.
- Agent-ready memory without strong navigation and curation is unsafe and noisy, so note relationships, properties, quick switching, and saved views remain phase-1 prerequisites.
- The implementation should therefore be navigation-first in architecture, but business-memory-first in success measurement.

## Q2. Which content should agents be allowed to use by default?

Auto-decided answer:

Agents should be allowed to use **only explicitly published, permission-readable, memory-ready context packs by default**.

Additional rule:

- Readable Markdown outside those packs may still be passed into downstream analysis through explicit user attach/open actions on a per-note basis.

Rationale:

- This preserves explainability, permission safety, and trust.
- It prevents graph neighbors, backlinks, or arbitrary readable notes from silently widening the analysis context.
- It gives teams a controlled publication path for internal business memory.

## Q3. Which initial analysis use cases should the feature be strongest at?

Auto-decided answer:

The first use cases to optimize are:

1. SOP and operations memory
2. Policy and compliance reference
3. Project handoff and strategic continuity

Why these three:

- They benefit strongly from Markdown-native authoring and cross-linking.
- They need source visibility, freshness tracking, and reviewability.
- They are high-value for both human lookup and agent-assisted analysis.

## Auto-Decisions

- Use the existing TypeScript, TRPC, Zod, Drizzle, and Vitest patterns from `apps/web`.
- Keep `/document-management` as the single workspace entry point.
- Preserve current Library search/RAG behavior by default; do not auto-inject graph or backlink neighbors into runtime context in v1.
- Make `library_items.id` the canonical note identity for relation resolution and cache durability.
- Treat Markdown as the only file type that gets full note-native knowledge behavior in v1; other file types remain evidence or metadata-bearing assets.
- Require fail-closed permission checks on every derived read surface, including backlinks, graph neighbors, saved views, and context-pack resolution.
- Keep Canvas as a durable visual workspace, but do not treat canvas adjacency as an automatic retrieval or backlink signal in v1.
