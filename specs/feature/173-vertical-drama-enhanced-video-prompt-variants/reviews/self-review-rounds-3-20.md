# Feature 173 Spec Review — Rounds 3–20

**Reviewer:** Main Codex conductor
**Date:** 2026-09-01
**Scope:** Completeness, future-readiness, and strict Legacy non-regression for
the paired Storyboard Legacy/Enhanced video-prompt design.

The first two reviews are retained in `self-review-round-1.md` and
`self-review-round-2.md`. These additional rounds were run after the initial
draft and after each material correction. Rounds 19 and 20 are the final clean
convergence rounds after the last correction.

| Round | Focus | Finding | Disposition |
|---:|---|---|---|
| 3 | UI/UX planning contract | The UI section lacked an explicit user/JTBD, existing-pattern reference, surface inventory, full state matrix, canonical viewports, copy contract, and browser evidence. | Closed by expanding Section 03. |
| 4 | Display versus render state | A selected tab could be mistaken for the prompt used by the paid renderer. | Closed with client-local `viewedVariant`, persisted `activeVariant`, active badge, and render-action rules. |
| 5 | Split-shot atomicity | Per-clip variant storage did not explicitly prevent a partial mode switch across speaker sub-shots. | Closed with shot-group atomic Apply, affected-sub-shot diagnostics, and `variantGroupFingerprint`. |
| 6 | Prompt edit routing | Reusing the existing `clip.prompt` save callback for Enhanced would overwrite Legacy or active state. | Closed with `updateVideoPromptVariant`, dirty-buffer rules, explicit re-finalization, and no hidden spend. |
| 7 | Render/media provenance | Applying a new variant after a video existed could overwrite or falsely present old media as matching. | Closed with variant/hash/model/media provenance, `prompt_mismatch`, `provenance_unknown`, preservation, and explicit re-render. |
| 8 | Legacy after opt-in | “Legacy unchanged” did not define how manual edit, regeneration, bulk/repair, and dialogue refresh behave after a variant store exists. | Closed with Legacy-first preview writes, active-only projection when Legacy is active, explicit Apply Legacy, and no Enhanced mutation. |
| 9 | Terminal semantic ownership | Generic Director and Feature 170 could both be interpreted as independent final prompt writers. | Closed with exactly one terminal semantic owner and same-finalizer repair rule. |
| 10 | SDK/runtime boundary | Shared backend SDK is pinned below the target package range, and generic `llm-only` metadata is not a Python Agent bridge. | Closed with v1 isolated runtime, explicit adapter bridge, no generic executor route, and readiness diagnostics. |
| 11 | Tool/model fallback safety | Generic input defaults permit model fallback, while package `strict_provider_pin` and `allow_*_tool` settings are not sufficient integration enforcement. | Closed by requiring locked single-target routing, no cross-provider fallback, Core tool allow-list, and fail-closed readiness. |
| 12 | Package identity/version | Manifest/pyproject declare `11.0.0`, while `SKILL.md` front matter declares `1.0.0`; provenance could become ambiguous. | Closed as an explicit enablement blocker until one version/entrypoint identity is verified and stamped. |
| 13 | Media/reference/temporal correctness | Prompt variants did not explicitly carry the exact Feature 170 reference mapping or logical-shot versus provider-segment constraints. | Closed with typed `VideoShotMediaBundle`, role/order/fingerprint preservation, provider-plan provenance, and unsupported-segment blocking. |
| 14 | Persistence/recovery/data safety | Whole-pack JSONB replacement, malformed/future stores, unbounded research/traces, timeout, and cross-session behavior were underspecified. | Closed with clip-scoped deep merge, additive/no-backfill v1, safe reader behavior, bounded payloads, timeout/cancel settlement, and stateless isolated runs. |
| 15 | Flags/cost/concurrency/security | Independent flags, in-flight kill-switch behavior, cost drift, tenant authorization, and queue backpressure needed explicit rules. | Closed with the full flag matrix, admission/final-merge policy, single confirmation, server recheck, ownership checks, rate limits, and no fan-out. |
| 16 | Acceptance/proof traceability | The new rules needed direct acceptance and browser/test coverage rather than prose-only guarantees. | Closed: acceptance, test matrix, responsive/accessibility proof, runtime package tests, and render-provenance evidence now trace to each rule. |
| 17 | Cross-document reread | No textual contradiction remained in the checked state, routing, flag, and API sections. | PASS for checked scopes; continued with an independent media-source cross-check before final convergence. |
| 18 | Active media source | The exact Feature 170 bundle was stored, but the renderer's source could still be inferred as `viewedVariant`. | Closed by making `activeVariant.mediaBundle` the only Feature 170-aware render selection; old clips retain their existing builder. |
| 19 | Clean convergence 1 | Re-read the complete main spec, four sections, and target manifest/schema evidence; no unresolved required marker or Legacy-flow contradiction found. | PASS. |
| 20 | Clean convergence 2 | Repeated the final contract, flag, provenance, schema, whitespace, and scope checks after all edits. | PASS. No new MUST_FIX found. |

## Final review result

No additional MUST_FIX gap remains in the design scope after Round 20. The
remaining blockers are intentional readiness/implementation gates, not hidden
behavior: the isolated SDK bridge, package identity correction, tool allow-list,
runtime capability manifest, product implementation, and browser/live-provider
proof must pass before enabling the Enhanced button.

No product code, database migration, shared SDK dependency, global skill route,
Legacy callback, or existing media asset was changed by this review.
