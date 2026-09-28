# Vertical Drama Autonomous Story Quality and Completion

## Objective

Make Vertical Drama story generation autonomous from the user's perspective:
the plan, deep draft, long-form continuation, and episode-script stages should
repair ordinary quality defects automatically, resume from durable checkpoints,
and finish with the best available full story instead of stopping at a user
actionable `needs_repair` state.

The system must still fail closed for security, ownership, billing, corrupted
state, or unavailable provider dependencies. Those are operational failures,
not story-quality failures. They must be retryable and durable, but must not
invent prose or charge an unperformed call.

## Design

### 1. One canonical quality contract

Add a shared, pure contract for story consistency. It tracks episode/shot
events, character knowledge, who is present or can hear a disclosure, open
threads, and repeated event fingerprints. It reports repairable findings such
as knowledge leaks, contradictory premise facts, ambiguous disclosures, and
unmotivated repeated events. Existing structural completion and thread-ledger
checks remain part of the contract.

The contract is advisory for generated prose but blocking for acceptance of a
candidate. The candidate is not discarded; it is passed to the next repair
attempt with exact findings and preserved canonical story locks.

### 2. Autonomous bounded repair with best-known completion

All ordinary schema, completeness, continuity, and semantic-quality findings
enter one durable repair loop. Each attempt persists its checkpoint and
attempt metadata. The loop retries with targeted instructions, then a broader
episode/block repair, and finally a conservative best-known fallback. The
fallback is accepted only when it meets the structural completion contract;
remaining semantic findings are stored as warnings and status is
`completed_with_warnings`, never an unexplained interruption.

Provider outage, insufficient credit, stale ownership, or corrupted
checkpoint does not trigger fallback prose. It remains a resumable operational
failure with the accepted prefix preserved and a durable next action.

### 3. Long-form scaling

Use bounded episode blocks and rolling retrieval packs. Every block carries a
compact canonical ledger, current character knowledge projection, unresolved
thread IDs, reverse dependencies, and event fingerprints. Repair impact expands
only to the affected block plus neighboring closure episodes, preventing a
120-episode prompt from growing without bound while preserving causal context.

The finalization pass runs automatically after the last block and may repair
unresolved closure/continuity findings before accepting the full story.

### 4. Pipeline integration

The same contract is called after initial plan generation, after each deep
chunk, after premium revise/sweep, and after episode script hydration. The
script stage receives a vetted deep draft as a refine base but must re-check
knowledge and event continuity after generation. Automatic quality review is
invoked for the first episodes and any high-risk finding; user-facing review
remains an optional additional pass, not a prerequisite for completion.

### 5. Persistence and observability

Persist quality findings, repair round, attempt fingerprint, selected candidate,
fallback reason, and final status in the existing durable run/checkpoint
artifacts. Keep physical provider calls idempotent and individually billed
through the existing call accounting. Do not write to an existing user's
series as part of this feature; existing stories are repaired only through an
explicit future migration/re-run path.

## Acceptance criteria

- A 50-episode generation automatically repairs ordinary defects and emits a
  complete structured story without requiring a second user click.
- A 120-episode generation remains resumable and keeps bounded prompt/context
  sizes while preserving causal and knowledge continuity.
- The twin scenario is rejected or repaired when the protagonist can hear a
  secret she is supposed not to know, or when the premise says a character is
  unaware but later makes that character coordinate the secret.
- A repeated event such as the same helper falling twice is repaired or given
  an explicit causal distinction.
- Exhausting quality repair attempts does not erase accepted episodes or leave
  the user with no result; a structurally complete best-known draft is returned
  with durable warnings.
- Provider, billing, ownership, and corrupted-state failures remain retryable
  and never fabricate output.

## Non-goals

- No automatic mutation of existing production stories.
- No deployment, migration execution, or provider smoke test as part of the
  code change.
- No guarantee that an LLM-generated story has zero subjective weaknesses;
  the system must maximize quality and make residual findings explicit.
