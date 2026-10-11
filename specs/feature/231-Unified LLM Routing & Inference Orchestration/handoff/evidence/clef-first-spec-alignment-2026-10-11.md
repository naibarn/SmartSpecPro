# Clef-first SPEC alignment handoff — 2026-10-11

## What changed

- Established the canonical Clef-first Decision Model policy in Spec 231, which already owns unified LLM routing and Cloudflare AI Gateway boundaries.
- Aligned Specs 208 and 213 with the new Decision Model preference while preserving Jev only for inventoried legacy Decision Model integrations.
- Added downstream boundaries/cross-references for Specs 224, 256, 267, 269, 266, 272, and 277.
- Recorded official model IDs, typed request/response contract, hosted context/media limits, published input prices, error handling, AI Gateway support boundary, tenant/account attribution, cost governance, evaluation, and rollback requirements.
- Clarified Workers AI token-equivalent pricing versus Neuron-based usage and the optional AI Gateway Unified Billing/prepaid credit path.
- Preserved all existing status claims; no Clef adapter, production routing, benchmark, or deployment is asserted as complete.

## Files updated

- `specs/feature/231-Unified LLM Routing & Inference Orchestration/spec.md`
- `specs/feature/208-hybrid-computer-use-dynamic-capability-routing/spec.md`
- `specs/feature/213-jev-system-one-post-implementation-upgrade/spec.md`
- `specs/feature/224-Autonomous Development Orchestrator Runtime/spec.md`
- `specs/feature/256-skill-first-capability-discovery-intent-execution/spec.md`
- `specs/feature/267-smartaihub-cloudflare-production-migration-durable-execution-control-plane-v2/spec.md`
- `specs/feature/269-smartaihub-primary-specialist-assistant-teams-autonomous-workforce/spec.md`
- `specs/feature/277-task-control-experience-r1-6/spec.md`
- `specs/feature/266-smartaihub-unified-data-evidence-knowledge-spatial-intelligence-fabric/spec.md`
- `specs/feature/272-smartaihub-credential-vault-root-of-trust-secure-provider-broker/spec.md`
- `specs/feature/231-Unified LLM Routing & Inference Orchestration/handoff/evidence/clef-first-spec-alignment-2026-10-11.md`

## Verified and not verified

Verified by repository discovery: the primary checkout was dirty and stale, so work proceeded in a clean worktree at canonical `origin/main` SHA `f4460124440143e7f8a2d746097019bef4ee53c0`; provider/inference code currently contains general profile/routing/gateway surfaces but targeted search found no Clef model adapter/registration. Official Cloudflare model/API/pricing/error and AI Gateway documentation was consulted on 2026-10-11 and is linked from Spec 231.

Verification run: `git diff --check` passed; all 10 affected SPEC handoffs were reconciled and validate without manifest/ledger schema errors; focused Spec handoff index/relationship/ID tests passed (11 tests); generated SPEC views were refreshed and `spec-handoff index --check` passes with no drift. Local-link review found no newly broken cross-SPEC links. It also surfaced three pre-existing missing mockup image links in Spec 277 (`mockup-01-task-control-overview-r1.3.png`, `mockup-02-task-details-verification-r1.3.png`, `mockup-03-task-details-work-plan-r1.3.png`); these are unrelated to this change and were left untouched.

The canonical handoff reconciler preserved existing owner status while flagging changed documents for revalidation: Specs 208 and 269 remain `PARTIAL_INTEGRATED`, Spec 224 remains `WAITING_APPROVAL`, Spec 277 remains `CONTINUATION_REQUIRED`, and Specs 213/231/256/266/267/272 are `VALIDATION_PENDING`. No affected Spec is marked complete. Updating canonical Spec 256 makes its identical nested duplicate copy differ; the generated index now surfaces that nested path as an authority conflict. The noncanonical nested copy and its handoff were left untouched pending separate duplicate-spec reconciliation.

Not verified: production provider wiring, tenant-account runtime behavior, AI Gateway preservation of the structured Clef API, live price/usage receipts, SmartAIHub benchmark results, shadow/canary results, production behavior, and any in-flight job migration.

## Recommended implementation WorkUnits

1. **P231-CLEF-ADAPTER:** Extend the existing provider profile/inference boundary with an explicit typed Clef System One adapter and schema validation; evaluate native Workers AI and AI Gateway request/response preservation without introducing a second registry.
2. **P213-LEGACY-MIGRATION:** Inventory live Jev Decision Model callers and pin in-flight requests; retain Jev adapters only for confirmed consumers and define a safe new-request cutover/rollback.
3. **P272-TENANT-CREDENTIALS:** Bind platform/tenant-owned Cloudflare account credentials through existing secret and policy owners; verify cost ownership attribution without new secret or billing stores.
4. **P224-MINIAPP-EVAL:** Build shadow evaluation across Mini App/Screenshot-to-Code and other representative workloads, measuring completion quality, latency, recovery, and whole-task cost before any default-on rollout.
5. **P231-ROLLOUT:** Implement bounded fallback, usage/audit receipts, and canary/rollback through existing policy controls; prove the inference failure cannot strand autonomous work.

## Next executable action

Implement P231-CLEF-ADAPTER against the current canonical `origin/main` revision, starting with an owner-fit check of `profileRegistry`, `routePlanner`, the provider map, the existing gateway adapter, and Cloudflare account/AI Gateway routes. Add focused adapter contract tests before any production routing change. Treat heavy benchmark/UAT as post-integration evidence tied to the exact integrated SHA.
