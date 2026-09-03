# Gap Review v5 — 10 Additional Rounds

Date: 2026-09-01

## Round 1 — Product breadth
**Gap:** v4 taxonomy was still mostly a list of ten families.
**Fix:** added composable behavior primitives, mechanism domains, more than twenty additional families and an unknown-product fallback composition rule.

## Round 2 — Regulated / safety-critical boundary
**Gap:** broad coverage could be misread as permission to invent medical, hazardous or industrial procedures.
**Fix:** added regulated-category metadata, evidence requirements, compliance approval hooks and explicit limited-coverage boundaries.

## Round 3 — Multi-shot hierarchy
**Gap:** `allowMultiShotGeneration` did not model editorial shots vs provider generation calls.
**Fix:** introduced `Sequence → Logical Shot → Generation Segment → Prompt Turn`, plus `sequence-plan.schema.json`.

## Round 4 — 8/10/15-second shot policy
**Gap:** v4 had only a preferred shot duration and could not represent fixed/preset/custom shot-duration policy.
**Fix:** added `shotDurationPolicy` with auto/fixed/allowed-values/per-shot modes and UI presets `[8,10,15]`.

## Round 5 — Provider duration adaptation
**Gap:** a 15s logical shot could exceed a provider's direct clip limit without a deterministic plan.
**Fix:** added duration adaptation modes: extension, route model, split shot, time-compress, edit/trim; continuous-shot semantics prevent silently turning one shot into two cuts.

## Round 6 — Extension prompt chains
**Gap:** v4 had `mode=extend` but no representation for Base Prompt + Extend 1 + Extend 2...
**Fix:** added `prompt-chain.schema.json`, segment state, local/global timecodes, bridge states, previous interaction/source requirements and example Omni 40s chain.

## Round 7 — Extension duration solver
**Gap:** total duration and provider extension increments could conflict.
**Fix:** added `adapters/temporal_planner.py` to compute exact or nearest reachable duration from provider constraints. For Omni, 8s base + four 8s legal extensions reaches exactly 40s.

## Round 8 — Seam / tail rewrite / dialogue continuity
**Gap:** extension may mutate tail frames and some source modes restrict new dialogue.
**Fix:** capability profile now records seam mutability, context length, dialogue restrictions, local time semantics and stored interaction requirements. Added seam policies and QC failure classes.

## Round 9 — Native multi-shot vs external editing
**Gap:** provider-native multi-shot was implicitly treated as equivalent to editorial shot control.
**Fix:** added explicit strategies: independent shots, provider-native multi-shot, extension chain and hybrid. Provider-native multi-shot requires capability evidence; production preference remains independent shots when repairability/fidelity dominates.

## Round 10 — Regression / output completeness
**Gap:** output did not require timeline/chain artifacts and QC lacked temporal scores.
**Fix:** output now requires `sequencePlan` + `promptChains`; QC scores multi-shot continuity, extension seam, temporal coverage and narrative beat coverage. Added 8/10/15 and 40s extension fixtures plus temporal-planner tests.

# Remaining deliberate limitations

1. Exact named-product behavior still requires verified source facts.
2. Provider extension/multi-shot numbers are fail-closed when not verified.
3. Exact labels/UI/text remain better handled by post-compositing when reliability matters.
4. Repeated extension can accumulate visual/identity/product drift; a 40s chain is not automatically superior to independent shots.
5. Multi-speaker dialogue and complex hand/product choreography remain high-risk and may need shot separation.
6. Regulated or safety-critical product demonstrations may require human/compliance approval.

## Follow-up Round 11 — Taxonomy/schema vocabulary consistency
**Gap:** expanded families introduced interaction and visualization labels not guaranteed to exist in the canonical primitive/schema vocabulary.
**Fix:** synchronized all family interactions into `behaviorPrimitives`, added `water_flow`/`steam_flow` visualization support, and added semantic consistency checks to package validation.

## Follow-up Round 12 — Continuous logical shot across extension turns
**Gap:** the 40s example showed multi-shot progression but did not prove that one 15s logical shot can remain one shot across two provider turns.
**Fix:** added `examples/omni-15s-continuous-shot-chain.json` using an 8s base + 7s same-shot extension with explicit no-cut/no-reset seam policy.

## Follow-up Round 13 — Requested vs actual provider duration
**Gap:** an earlier v5 draft treated any whole-second Omni extension duration inside 3–10s as deterministically requestable. Official documentation verifies the range and 40s cap but does not document a dedicated exact-duration parameter.
**Fix:** added `durationControl` + `deterministicDurationRequest`, changed Omni to prompt-guided/nondeterministic, added requested/actual segment duration fields, and changed 15s/40s examples from guaranteed partitions to creative targets that must be reconciled with actual provider output.
