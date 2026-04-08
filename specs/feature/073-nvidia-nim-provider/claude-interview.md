# Interview Transcript - NVIDIA NIM Hosted Provider

Date: 2026-04-07
Planning directory: `specs/feature/073-nvidia-nim-provider`

## Q1. For phase 1, should SmartSpecPro sync all partner models exposed through NVIDIA, or only NVIDIA-owned plus a curated partner subset?

**User answer**

Sync all models, but keep them disabled by default.

## Q2. For `autoSelectionEligible`, should phase 1 enable the whole bootstrap set from the spec, or a narrower reviewed subset?

**User answer**

Delegate to the planner / LLM to choose the best approach.

**Planner decision**

Use a narrower reviewed subset for phase 1 auto-selection.

Reasoning:

- runtime auto-selection currently depends on reviewed capability metadata
- missing capability flags behave like unsupported features in the current stack
- partner rows introduce extra uncertainty even when they are chat-capable
- a smaller reviewed bootstrap set reduces routing and capability regression risk while preserving explicit manual selection for the wider synced catalog

Phase 1 decision:

- enable `autoSelectionEligible = true` only for a small curated NVIDIA-owned chat subset
- keep all other synced chat rows as `manual-only`

Initial reviewed auto-selection set:

- `nvidia/llama-3.3-nemotron-super-49b-v1.5`
- `nvidia/llama-3.1-nemotron-70b-instruct`
- `nvidia/llama-3.1-nemotron-nano-8b-v1`
- `nvidia/llama3-chatqa-1.5-70b`

## Q3. For embeddings, should phase 1 remain internal/admin-only, or should it also include migration or re-embed tooling now?

**User answer**

Delegate to the planner / LLM to choose the best approach.

**Planner decision**

Keep embeddings explicit/internal-only in phase 1. Do not include migration or re-embed jobs in this scope.

Reasoning:

- current retrieval/query embedding assumptions are still OpenAI-shaped and dimension-sensitive
- implicit or migration-driven rollout would expand the scope far beyond provider onboarding
- internal/admin-only support still gives the team safe validation and manual test coverage

Phase 1 decision:

- add explicit NVIDIA embedding support for internal/admin flows
- do not add global retrieval fallback changes
- do not add migration or re-embed jobs yet
- keep future migration tooling as a follow-up extension point, not a committed deliverable in this plan

## Q4. If a partner model cannot be confidently classified from the live catalog and docs, should it always fall back to `surface = other` and `manual-only`, or should some owner/family be whitelisted upfront?

**User answer**

Delegate to the planner / LLM to choose the best approach.

**Planner decision**

Always fall back conservatively when classification is not confident.

Reasoning:

- the hosted catalog already contains partner non-chat rows
- owner-wide or family-wide whitelists create a large false-positive risk
- explicit reviewed allowlists are safer than inferred trust by owner

Phase 1 decision:

- unresolved partner rows fall back to:
  - `surface = other`
  - `executionMode = deferred`
  - `autoSelectionEligible = false`
- no owner-wide whitelist ships in phase 1
- only explicitly reviewed chat IDs or reviewed family rules may become chat-eligible
