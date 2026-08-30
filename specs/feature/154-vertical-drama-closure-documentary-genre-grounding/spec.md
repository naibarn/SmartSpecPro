# Feature 154 — Closure Assurance, Documentary/Review Series, and Genre Grounding

Status: implementation in progress (additive rollout)

## 1. Purpose

Extend Feature 153's long-form story memory with three safe authoring contracts:

1. Every unresolved thread receives an explicit disposition instead of being
   treated as a defect merely because it remains open in the current horizon.
2. Documentary, location/restaurant/product/software review, and hybrid
   docu-drama series get a repeatable episode engine and evidence policy.
3. A selected visual genre becomes observable story evidence. A science-fiction
   series must contain functional technology, a fantasy series must contain
   causal magic/world mechanics, and review/documentary series must show the
   subject being observed. The look never overrides canon or invents facts.

This feature is deliberately additive. Existing fiction series without the new
contracts keep the Feature 153 behavior and can be upgraded explicitly.

## 2. Scope and non-goals

In scope: shared TypeScript/Zod contracts, prompt grounding, deterministic
closure QC, targeted repair admission, memory projection compatibility, create
wizard selection, memory-tab diagnostics, and focused tests.

Out of scope: automatic rewriting of an entire season, replacing the existing
LLM provider/orchestration pipeline, factual web crawling, provider rendering,
or claiming that local tests prove production/provider behavior.

## 3. Relationship to existing work

- Feature 153 remains the source of truth for long-form episode memory and
  relationship graph deltas.
- Feature 152 remains the generation assurance/orchestration layer.
- This feature adds only optional JSON fields and uses the existing deep draft,
  row-lock, tRPC, and memory-tab seams.
- No database migration is required; the series `bible` and `memory` JSON
  contracts are versioned and tolerant for legacy rows.

## 4. User outcomes

### 4.1 Thread closure

The memory tab must distinguish:

- `explicit_payoff`: clearly resolved on screen/in the story;
- `implicit_payoff`: resolved by consequences or changed circumstances;
- `expected_continuation`: intentionally deferred beyond the current horizon;
- `intentional_open`: an authored ambiguity for audience interpretation;
- `surprise_payoff`: intentionally reserved for a later reveal;
- `needs_repair`: a required payoff with no credible evidence.

The UI explains the reason, evidence episodes, confidence, severity, and next
action. “Mark resolved” remains available but cannot silently erase history.

### 4.2 Documentary and reviews

The format picker supports fiction, documentary, location review, restaurant
review, product review, software review, and hybrid docu-drama. A review episode
uses the stable engine `hook -> context -> observation/evidence -> strengths and
limitations -> verdict -> next-episode tease`. Claims must carry source or
subject references. Without supplied sources, generated text is explicitly
labelled observation/opinion or needs verification; the system must not invent
prices, specifications, addresses, ratings, or product behavior.

Sponsored/product-tie-in material carries disclosure and CTA guidance without
turning every episode into an advertisement.

### 4.3 Genre grounding

New series with story-facing look guidance use strict genre grounding by default.
Each episode must declare observable genre cues and, where applicable, a world
mechanic and its cost/constraint. The validator reports missing evidence or
genre drift before the draft is presented as ready. Legacy series remain
`legacy_soft` unless the creator opts in.

## 5. Contracts

### 5.1 `seriesFormat`

Persist under `bible.seriesFormat` with `version: 1`, `kind`, `episodeEngine`,
`factPolicy`, `commercialDisclosure`, `requiredEvidence`, and `ctaPolicy`.
All fields are bounded and validated at the server boundary.

### 5.2 Closure annotations

`VdOpenThread` gains optional `closureIntent` and `expectedEvidence`.
`VdEpisodeMemory` gains optional `threadClosures`, each carrying thread ID,
disposition, evidence episode numbers, rationale, and optional confidence.
Legacy memory blocks parse without these fields.

### 5.3 Visual grounding

Persist under `bible.visualGroundingContract` with version, mode, genre family,
required observable cues, forbidden drift, and minimum cue coverage. It is a
hard evidence contract only after canon/premise/continuity and factual format
constraints; it cannot create or remove characters, plot, or relationships.

## 6. Safe repair policy

QC first classifies a thread deterministically. Only `needs_repair` is blocking.
Repair is narrow: it targets one thread and one drafted episode, preserves
canonical facts and relationship deltas, and may add an exact resolution marker
only when the target episode already contains supporting evidence. Otherwise the
user is sent to the episode editor with a concrete reason. No global rewrite is
allowed.

## 7. Acceptance criteria

- Legacy series and flag-off prompts remain parseable and behavior-compatible.
- A closure audit never labels a future/intentional/surprise thread as a defect.
- A required unresolved thread at a completed horizon is visibly blocking and
  has a repair/edit path.
- Review formats reject or warn on unsupported factual claims rather than
  fabricating verification.
- Strict sci-fi/fantasy/documentary drafts include observable evidence or a
  deterministic actionable warning.
- Relationship graph and memory projection remain the single continuity source.
- Focused shared/server/UI tests pass; baseline-wide typecheck noise is reported
  separately, as are provider/browser/deployment checks not run locally.

## 8. Rollout

Ship contracts and read-only QC first, then enable strict grounding for newly
created story-facing series. Existing rows are opt-in. A failed strict gate
returns a repair-needed state with preserved partial output, never a silent
creative rewrite.
