# Implementation plan

## Objective

Produce semantically unambiguous Enhanced dialogue timelines for every video model and resolve provider prompt budgets by model family rather than shared provider name.

## Section 1: Speaker-safe Enhanced terminal prompt

Update the Enhanced Python bridge so canonical dialogue creates the only speech events. Render sanitized physical actions independently; remove quotes, speech verbs, and mouth/lip-sync directives in Thai and English. Add a terminal semantic validator that checks canonical speaker/name/position/line anchors, listener closure, and absence of speech intent in physical-only events. Add deterministic prompt compaction driven by a target budget supplied by the server. Preserve the protected dialogue and identity core and fail before persistence if it cannot fit.

## Section 2: Model-aware budgets and integration

Expand the shared resolver signature to accept model identity. Define known ceilings for Grok, MiniMax H3/H3 Max, Omni Flash 1.1, Wan 3.0, and Seedance 2.5. Remove provider-wide Kie handling, raise the global ceiling to 30,000, and retain configured/default behavior for unknown models. Pass model identity at every production call site. Resolve the budget when creating Enhanced skill input, include it in the fingerprint, and validate returned bridge prompt length against it.

## Risks and mitigations

- Sanitization may remove useful acting prose: only speech/lip-specific clauses are removed; remaining physical action is preserved separately.
- Very small model budgets may not fit the protected core: fail closed with a precise error rather than truncate dialogue.
- Stale catalog values may contradict approved family limits: known family ceilings take precedence; only video-specific config may tighten them.
- Shared resolver signature can cause missed call sites: TypeScript and `rg` call-site closure verify all invocations.

## Acceptance criteria

- No Enhanced timeline can emit `speaker A as they speaker B ...` through index coupling.
- Exact canonical line order and speaker/position ownership are retained.
- Thai/English duplicate mouth and speech directives do not survive physical-action sanitization.
- Episode 258 shot patterns pass regression tests.
- Resolved limits equal 4,096 / 7,000 / 20,000 / 20,000 / 30,000 for the approved families.
- Grok Enhanced output is at most 4,096 characters with protected dialogue intact.
- Focused Python and TypeScript tests pass; diff check is clean.
