# Feature 151 final runtime/video-prompt audit

Date: 2026-08-18

## Scope

This audit compares the Feature 151 spec/plan with the executable Node and
Python boundaries and the Vertical Drama paid-render path. SocratiCode was not
available in the execution environment, so the evidence was traced from the
source, focused tests, and dependency/runtime probes.

## Gaps found and closed

1. A weak model could mention a character earlier in the paragraph but leave a
   quoted line without an explicit speaker + speech verb. The deterministic
   repair now adds the resolved canonical speaker immediately before the exact
   quote for every known speaker, and the verifier checks for a real speech
   verb rather than a coincidental name occurrence.
2. Provider prompt-QC protected dialogue text but not user-authored custom
   identity locks. Kie/Grok refiner passes could therefore keep the line while
   removing the detail that disambiguates two people. Custom identity-lock
   fragments are now protected in shot generation and again at the paid video
   render boundary.
3. The Python Orchestra returned `verifying` after a completed adapter run,
   which made Node's provider-ready final gate reject a valid completed
   artifact. Completed bounded runs now return `provider_ready`; contract hash
   mismatches and all Agency origin spellings are rejected before execution.
4. The Node runtime client accepted an assured response with no assurance
   result. Assured requests now fail closed when the adapter omits the result,
   while preserving current/current-minus-one runtime compatibility.
5. Native skill requests could bypass the assurance result because the native
   executor returned directly from the API route. Assured native responses now
   carry the same attempt/contract-bound `provider_ready` (or `failed`) result
   used by the normal Orchestra adapter path.
6. The desktop runtime selector could still choose the retired Agency Swarm
   enum for new complex/connector runs. New selection now routes to the cloud
   Orchestra; the legacy enum remains readable only for historical records.
7. Section 06 required a repeatable forbidden-reference audit, but no CI
   check existed. `scripts/ci/forbid-agency-swarm-active-references.sh` now
   verifies the dependency profile and all fail-closed execution boundaries
   while allowing historical compatibility references.

## Existing protections confirmed

- Kie.ai video prompt budget resolves to 4,096 characters; video overflow is
  fail-closed after bounded lossless refinement and never hard-truncated.
- Start-frame/character/location evidence, multi-character cast locks, barrier
  dual-view references, dialogue source pinning, and tenant-scoped asset URLs
  are checked before paid video submission.
- The paid render performs a second provider-aware prompt-QC after formatter and
  preset transforms, immediately before credit reservation/provider submit.
- Agency Swarm execution is fail-closed at the bridge/API boundary and is no
  longer selected for new desktop runs; historical data/types remain readable
  and recoverable for migration. The CI audit script passes.

## Focused proof

- Node prompt/assurance/budget/client/desktop-runtime suites: 211 tests passed.
- Router/reference/draft/desktop-runtime suites: 61 tests passed.
- Python API/assurance/contracts/adapter suites: 57 tests passed.
- `pip check`: clean with `openai-agents==0.21.1` in the active environment.
- `git diff --check`: clean for the touched patch.
- Agency active-reference audit: PASS.

## Release-only checks (not falsely claimed as local proof)

Authenticated browser flow, a real Kie/Grok provider submission, credit-ledger
reconciliation, deployment installation from `python-backend/requirements.txt`,
and full-repository TypeScript checks still require the release environment.
