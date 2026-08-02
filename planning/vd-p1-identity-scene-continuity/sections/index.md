<!-- PROJECT_CONFIG
runtime: typescript-pnpm
test_command: cd apps/web && npx vitest run
END_PROJECT_CONFIG -->

<!-- SECTION_MANIFEST
section-01-prereq-baseplan-fix
section-02-feature-flags
section-03-model-prompt-budget
section-04-motion-profile-module
section-05-scene-continuity-module
section-15-series-look-lock
section-06-motion-profile-contract
section-07-frame-observability-gate
section-08-motion-contract-skills
section-09-scene-visual-state-skill
section-10-scene-state-storage-carryover
section-11-scene-lock-injection
section-13-scene-mutations-ui
section-14-joint-verification
section-12-neighbor-anchoring
END_MANIFEST -->

# Implementation Sections Index — VD P1 current-worktree plan

Current authority, in order:

1. `../../specs/feature/137-vertical-drama-identity-stable-i2v-pipeline/spec.md`
2. `../../specs/feature/138-vertical-drama-scene-continuity-engine/spec.md`
3. `../../specs/feature/139-vertical-drama-series-look-lock/spec.md`
4. `../current-worktree-reconciliation.md`
5. this index and the binding override at the top of each affected section

Historical file/line anchors and test counts are hints only. Re-resolve symbols and
recapture the baseline before implementation. SocratiCode is preferred; if its MCP
transport remains unavailable, record the shell fallback.

## Feature order decision

Implement the shared foundation first, then **Feature 139 → Feature 137 → Feature
138 P1a → joint P1 verification → Feature 138 P1b canary**.

Why:

- 139 owns the effective series visual register and the source-aware resolver that
  every image path must use. The 138 scene planner consumes this look, so 139 must
  precede scene-state authoring.
- 137 is independently valuable and shares prompt-budget/skill gates but does not
  require scene state. It lands after the look resolver to avoid editing shared
  prompt builders twice with competing ownership.
- 138 P1a adds metered scene planning, JSONB concurrency, prompt injection and UI;
  it consumes 139 and composes with 137.
- 138 P1b changes reference capacity and within-scene scheduling. It is isolated
  behind its own child flag and rolls out only after P1a is green.

## Dependency graph

| Section | Current role | Depends on | Delivery wave |
|---|---|---|---|
| 01 | Recapture current baselines; no `basePlan` code fix | — | 0 |
| 02 | Register four default-off flags and dependency semantics | 01 | 1 |
| 03 | Selected-model prompt-budget helper | 01 | 1 |
| 15 | Feature 139 resolver, catalog, persistence, final assembler and UI | 02, 03 | 2 |
| 04 | Feature 137 pure profile/status/risk module | 01 | 1 |
| 06 | Feature 137 output/persistence contract | 02, 04 | 3 |
| 07 | Feature 137 observability request gate | 02 | 3 |
| 08 | Feature 137 activated skill/judge/drafting rules | 06, 07, 15 | 3 |
| 05 | Feature 138 scene grouping/hash/anchor pure module | 01, 15 | 1/4 |
| 09 | Feature 138 state skill/service, constrained by effective look | 02, 05, 15 | 4 |
| 10 | Feature 138 state storage, revision, stale carry-over | 05, 09 | 4 |
| 11 | Feature 138 P1a injection and required-state behavior | 03, 10, 15 | 4 |
| 13 | Feature 138 P1a mutations and Astryx UI | 10, 11 | 4 |
| 14 | P1 flag matrix, security/quality gates, rollout proof | 08, 11, 13, 15 | 5 |
| 12 | Feature 138 P1b neighbor-anchor canary | 02, 05, 11, 14 | 6 |

Section numbers are historical identifiers; the table above, not numeric order,
defines execution order.

## Execution waves

1. **Wave 0 — baseline:** section 01.
2. **Wave 1 — foundation:** sections 02, 03, 04 and the pure portion of 05.
3. **Wave 2 — Feature 139:** section 15. Gate its own resolver/injection/UI before
   allowing the scene planner to consume the look.
4. **Wave 3 — Feature 137:** sections 06 and 07, then 08.
5. **Wave 4 — Feature 138 P1a:** sections 09 and 10, then 11 and 13.
6. **Wave 5 — P1 convergence:** section 14 with legacy preset flag + four P1 flag
   truth table, focused typecheck delta, browser evidence and internal smoke.
7. **Wave 6 — P1b canary:** section 12; repeat its focused security, capacity,
   latency and prompt/render-anchor gates independently.

## Frozen cross-feature contracts

- Prompt precedence: policy/safety → identity/required shot facts → series look →
  scene state → shot creative direction → motion contract (video only).
- Feature 139 raw fragments are applied exactly once in a shared final image-prompt
  assembler; authoring LLMs receive only a compact register fact.
- Missing/invalid Feature 137 motion output is unavailable, never low-risk, and
  consumes no retry beyond the existing bounded judged loop.
- Feature 138 state with a mismatched `membershipHash` is stale and is not injected.
- `verticalDramaSceneNeighborAnchors` is active only when
  `verticalDramaSceneContinuity` is enabled.
- P1b persists one anchor id before prompt authoring and revalidates that exact id
  before paid render; it never substitutes another asset silently.
- Feature 140 owns the future prop ledger; Feature 138 stores no duplicate prop
  source of truth.

## Completion boundary

Wave 5 is a releasable P1 boundary with neighbor anchoring off. Wave 6 is a separate
canary and must not delay rollback or GA of 139, 137, or 138 P1a.
