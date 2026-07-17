# Feature 134 TDD Plan

## 1. Skill and prompt-runtime candidate contract

Write failing tests first for:

- candidate-count serialization for 1 and 5, with 0/6 rejected by schema;
- lean candidate-batch parsing without weakening normal five-prompt output;
- exact count, unique IDs, matching character ID, and role compatibility;
- pairwise 3-of-5 face difference plus hair/signature difference;
- every adult lead candidate passing the existing lead-quality gate;
- authoritative comparison evidence normalized across every candidate;
- one LLM credit charge and one snapshot per validated candidate;
- candidate-mode instructions present in both Skill markdown mirrors and schemas.

Expected initial failures: missing candidate schema/function and missing Skill markers, not
module import failures.

## 2. Candidate asset lifecycle and API

Write failing tests first for:

- bounded manifest projection without exposing snapshot metadata;
- server-side draft batch creation, expiry/supersession, and one-time claim;
- submission-state transitions and terminal success/failure settlement;
- primary resolver ignoring `portrait_candidate`;
- atomic selection preserving sibling character data and demoting only batch primaries;
- manual imported primary protection and idempotent same-candidate selection;
- router eligibility, count/model/credit multiplication, zero-cost path, N independent tasks,
  immediate partial-failure refunds, and no terminal double refund;
- cross-tenant/cross-user/cross-character rejection for claim, settle, and select.

Expected initial failures: missing service methods/procedures and missing projection fields.

## 3. Creator UI workflow

Write failing component/helper tests first for:

- casting eligibility and default count 3;
- accessible 1-5 radiogroup only in open-casting state;
- candidate preview payload and read-only N-prompt confirmation;
- independent polling keys and settle success/failure calls;
- reload resume from manifest task IDs without duplicate polling;
- newest/older batch grouping, selected card, retained alternatives, and future-generation
  warning;
- existing primary/approved-DNA/variant/twin paths hiding candidate controls and preserving
  normal generation.

Expected initial failures: absent helpers/controls/states, with existing normal panel tests
remaining green.

## 4. Integration and verification

After implementation, run:

- focused Skill runtime/content tests;
- focused stock/router/UI tests;
- the Skill bundle verifier;
- scoped `git diff --check`;
- web workspace typecheck;
- browser evidence at required viewports if authentication/dev server permits.

Any fix invalidates and reruns its affected focused gate. Perform one clean targeted
standard-light convergence round after the last fix.

