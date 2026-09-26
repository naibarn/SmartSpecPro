# SmartAIHub Specs 214–230 — RAG / Vector / Skill Retrieval Cross-Spec Alignment

**Date:** 2026-09-22

## Executive result

The architecture is aligned around one production retrieval data plane: **Spec 229 Retrieval Broker V2**. Domain specs retain authority over identity, lifecycle, permissions, policy, methodology and final decisions.

## Canonical ownership

| Concern | Owner |
|---|---|
| Retrieval Broker / AI Search / Vectorize / hybrid ranking / evidence normalization | Spec 229 |
| Identity / tenant / project / authorization / secrets | Spec 220 |
| Skill identity / version / trust / eval / publication | Spec 221 |
| Historical replay / effectiveness learning / advisory strategy | Spec 222 |
| ZCode harness transport | Spec 223 |
| Autonomous development lifecycle / requirement closure / hardening / final verify | Spec 224 |
| First-party Chat/Help/mobile retrieval presentation | Spec 225 |
| Legacy retrieval/vector migration bridge | Spec 226 |
| Policy interpretation/certification | Spec 227 |
| Maintenance issue identity/priority/repair governance | Spec 228 |
| RepositoryEngineeringProfile / current-task methodology & Skill binding | Spec 230 |

## Skill-first retrieval invariant

```text
Canonical Skill / repository Skill
    ↓ safe searchable projection
Spec 229 Retrieval Broker
    ↓ candidate evidence
Spec 221 authority revalidation
    ↓
Spec 230 current-task methodology selection
    ↓ selected Skill only
lazy canonical source load + digest verification
    ↓
Claude / Codex / Kimi / Hermes / ZCode
```

**Vector similarity is candidate-generation evidence, never permission, trust, lifecycle truth or execution authority.**

## Key corrections in this pack

1. `data.retrieval` in Specs 214/215 resolves provider-neutrally through Spec 229.
2. AI Builder/Product Builder/Universal Assistant use Broker results rather than direct vector-provider calls.
3. Spec 220 enforces pre-retrieval scope and post-retrieval authoritative checks for private data.
4. Spec 221 defines `SkillDiscoveryProjection`, indexing lifecycle and Skill discovery evals.
5. Spec 222 historical vector-backend implementation text is explicitly superseded by Spec 229; 222 retains logical knowledge/effectiveness learning.
6. Spec 224 separates deterministic requirement closure from retrieval-assisted context delivery.
7. Spec 226 owns additive migration of already-implemented legacy retrieval/vector callers.
8. Spec 228 uses semantic similarity for candidate duplication/history, never silent issue merge.
9. Spec 229 R2 adds Skill-first retrieval, exact-lane protection, tombstones, hard negatives and authority revalidation.
10. Spec 230 uses 229 per WorkPackage/AuditLens and lazily materializes only selected Skills.

## Production rule

No new production vector database, independent hybrid ranker or provider-specific semantic-search path may be introduced by a consumer spec after Spec 229 cutover unless it is an explicitly certified local/offline test adapter.
