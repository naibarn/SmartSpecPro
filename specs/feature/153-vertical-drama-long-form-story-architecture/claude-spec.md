# Feature 153 — Synthesized Requirements for Planning

## Objective

Extend Feature 152 so Vertical Drama can author, validate, repair, remember,
and close a true long-form series. The quality recommendation is 120 episodes
at 90 seconds (about three hours); requests above 120 remain supported through
an explicit extended mode rather than being rejected.

## Required outcomes

1. A hierarchical blueprint maps every episode to a macro arc, sub-arc, and
   block, with stable IDs and entry/exit state.
2. Reverse planning starts from the terminal episode and tracks the central
   mystery's question, answer, evidence, reveal, consequence, and closure.
3. Existing story-control, quality-ledger, memory, visual-bible, character
   variant, duration, and Feature 152 assurance contracts remain compatible and
   are extended rather than duplicated.
4. Memory has immutable source, append-only events, current truth projection,
   arc/block snapshots, and bounded retrieval packs. Approved edits and retcons
   cannot be silently overwritten.
5. Threads, consequences, and protagonist/antagonist advantage exchanges are
   owned, evidenced, costed, and closure-checked across the whole story.
6. Every character is represented in a canonical relationship graph covering
   parent/child, siblings, spouse, fiancé, in-law, family side, faction,
   friend, acquaintance, rival, disclosure, knowledge, time validity, evidence,
   and provenance. The graph is visible to the user and drives repair impact.
7. Cast can grow beyond five or six characters through core, recurring, arc,
   faction, and guest lifecycle contracts. A late guest is fictional, may be a
   childhood fiancé/new villain/presumed-missing relative, and must reframe or
   complete existing causality without deus ex machina.
8. Fantasy, sci-fi, cartoon/high-spectacle, future, realistic-combat, and
   cinematic non-explicit romance scenes use world/power rules and provider-
   neutral capability tags with safe fallback behavior.
9. Wardrobe/look changes are admitted only from explicit story cues such as
   gala, rural home, travel, sleep, combat, weather, time, role, or continuity.
   Existing identity locks and outfit variants remain authoritative; image
   references cannot rewrite narrative identity.
10. Generation runs in bounded blocks with checkpoints, deterministic validation,
   skill-first semantic review, targeted repair, memory fold, arc gates, and a
   finale closure gate.
11. All state, credits, tenancy, approval, provider reconciliation, fencing,
    and activation rules inherit Feature 152 and Feature 151 boundaries.
12. The quality target is measured against a Chinese-drama-comparable rubric,
   combining deterministic continuity/closure floors with human/sample craft
   review; schema validity alone cannot claim equivalence.
13. The existing draft path is the source of truth: `generateStoryBible` must
    create graph readiness/fingerprint before `generateStoryBibleDeep` or
    `extendStoryDraftHorizon` can run; all revise/resume/repair paths carry the
    same graph revision.
14. Strict episode memory emits typed relationship graph deltas and an atomic
    reverse dependency index; the legacy pair-state relationship projection is
    derived only after graph acceptance.
15. Quality admission exposes versioned call, repair, time, credit, checkpoint,
    and context SLOs, while benchmark review uses fixed samples, independent
    reviewers, critical floors, and adjudication.
16. The 90-second profile is a registered exact 9-shot duration contract, and
    120–1000 episode planning is staged into resumable interval-complete chunks.
17. Strict runs use independent component fingerprints, viewpoint-scoped
    knowledge redaction, executable cast-density policy, and candidate-only
    activation with crash-safe idempotent persistence.
18. Full-season engagement health checks repetition, hook novelty, escalation,
    and character agency distribution in addition to local schema validity.
19. Benchmark, anti-drift, cast-density, plan-chunk, memory-compaction, and
    credit/retry policies resolve concrete versioned defaults before paid work.
20. Plan chunks use bounded 10/20-episode sizing, zero overlap, predecessor
    fingerprints, deterministic idempotency, and provider-outcome reconciliation.
21. Graph and memory diagnostics apply the same tenant/permission/viewpoint
    redaction as generation, while source/policy revisions fence stale work.
22. Strict mode reuses canonical speech/content-budget helpers and the existing
    story-job lease/heartbeat/fence/watchdog/checkpoint/resume seams.
23. Graph semantics enforce cardinality/inverse/parent-cycle/belief invariants,
    and admission records pricing, hard spend, pause/cancel, and reconciliation
    behavior before paid work.
24. Every resolved policy used by generation has an independent immutable
    fingerprint so retries cannot silently change speech, quality, chunk,
    execution, or pricing behavior.
25. Feature 151/152/provider/safety/locale/vocabulary versions are pinned,
    retries are typed and bounded, activation is read-back verified, and
    horizon extensions re-plan terminal closure in a new candidate.

26. The relationship graph has a bounded retrieval contract for episode/range,
    family-side/group, faction, relation-type, status, disclosure, arc, cursor,
    and page-size filters. Its user-facing view returns truncation/continuation,
    redacted counts, policy lineage, and an aggregate candidate-versus-active
    diff without leaking secret edge or evidence IDs; pair-path inspection
    remains separately bounded and explainable.

## Non-negotiable constraints

- Do not hard-cap `targetEpisodeCount` at 120; current technical compatibility
  up to 1000 remains.
- Do not claim automatic professional/Chinese-drama equivalence; target a
  measurable comparable benchmark using deterministic floors and a human
  rubric/sample.
- Do not lock Seedance/Minimax or any future provider API into story contracts.
- Do not create a second agent runtime, memory store, identity store, or quality
  ledger family without proving the existing seam insufficient.
- Do not allow uncued automatic wardrobe generation or fictional guest surprise
  to erase established causality.
- Do not treat a compacted memory recap as truth unless required-ID and
  pre/post-fingerprint replay verification passes.

## Required proof

Pure fixtures must cover 120, 121, 150, 500, and 1000 episode admission;
reverse mystery closure; unresolved threads; advantage exchange; memory
retcon/compaction; guest episodes 119/120; hard-death return rejection;
fantasy/sci-fi rule costs; wardrobe transitions and no-cue rejection; and
synthetic 500-episode replay without live LLM calls. Service/job proof must
cover checkpoints, fencing, repair impact closure, approvals, tenant scope,
credits, and status mapping. Browser/provider/production/deployment proof must
be labeled separately.
