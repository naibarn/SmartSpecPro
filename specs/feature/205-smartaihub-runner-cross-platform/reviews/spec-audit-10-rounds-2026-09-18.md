# Spec 205 Pre-implementation Audit — 10 Rounds

**Date:** 2026-09-18
**Scope:** Spec 205, its deep-plan artifacts and related Feature 200/203/204
boundaries
**Result:** 10/10 specification/plan lenses passed; superseded for runtime status by `reviews/implementation-audit-10-rounds-2026-09-18.md`

## Findings fixed during this audit

1. Worker App authentication parity was described too generally. The spec now
   freezes the Runner namespace and minimum values:
   `smartspec-runner-registration`, `smartspec-runner-control-plane`,
   `runner_registration`, `runner_execution`, `runner_upload` and
   `runner_refresh`.
2. The spec now explicitly rejects all Worker token uses, including
   `worker_refresh`, on Runner routes and rejects Runner tokens on Worker
   routes. It also requires JTI revocation, effective scopes, tenant/runtime/
   node binding, device proof for local devices and bounded refresh replay.
3. Bootstrap credentials are now enrollment-only. WSS control must use an
   Authorization header or single-use handshake exchange; bearer/refresh
   credentials may not appear in a WSS URL query string. Device proof headers
   and nonces use a Runner-specific namespace.
4. “One shared Control Channel” was ambiguous across Feature 200 and Feature
   205. The related wording now means one versioned transport/registry/message
   contract, not a shared socket, credential, configuration root or durable
   session. Runner and Worker remain separately authenticated nodes.
5. `waiting-external` was missing from the main UI state matrix. It is now
   present in the main spec, plan and Section 07 contract.

## Final audit rounds

| Round | Lens | Evidence checked | Result |
|---:|---|---|---|
| 01 | Structure/deep-plan | 9 sections, section manifest, section validator and UI-contract validator | PASS |
| 02 | Worker authentication parity | Existing `workerAuthService.ts` invariants vs Runner namespace, token uses, revocation, device proof and refresh rules | PASS |
| 03 | Platform/release | Windows x86_64, macOS Intel, macOS Apple Silicon, Linux x86_64, manual-only workflow policy | PASS |
| 04 | Product separation | Separate package, executable/config roots, credentials, lifecycle and Worker import boundaries | PASS |
| 05 | Durable control plane | `worker_jobs`, events, outbox, lease/fence ownership and no second ledger | PASS |
| 06 | Shared Container | Managed node, per-Job workspace/process scope, no direct user socket, restart and two-tenant isolation | PASS |
| 07 | Cross-spec ownership | Feature 195–200, 203 and 204 ownership/non-overlap and shared-runtime wording | PASS |
| 08 | Security/MCP/retired systems | Credential redaction, path safety, MCP grant-only access, WSS query safety and retired-path prohibition | PASS |
| 09 | UI/Task Control | Combined Feedback/Chat launcher, inline panel, `/workers/connect`, Runner/Worker labels and external-wait state | PASS |
| 10 | TDD/acceptance/rollback | TDD assertions, evidence matrix, manual release, rollback and RAM-safe verification policy | PASS |

## Codebase alignment at the time of this audit

At the time of this pre-implementation audit, the codebase contained only the
partial TypeScript contract in
`apps/web/server/services/runnerContracts.ts` (`sah-runner-v1`). It now has
additive optional tool/capability inventory fields and focused validation, but
the following Feature 205 runtime deliverables are not present yet:

- `apps/runner-app`;
- Runner backend gateway/routes;
- `.github/workflows/runner-release.yml`.

Therefore this record confirms only that the specification and plan described
the required implementation boundary. The subsequent implementation result,
focused tests and remaining external rollout gates are recorded in the
implementation completion/review documents.

## Verification

- `check-sections.py`: complete, 9/9 sections.
- `check-ui-contracts.py`: passed.
- Focused `runnerContracts.test.ts`: 6 tests passed.
- Ten final targeted audit rounds: 10/10 passed.
- `git diff --check` for tracked audited changes plus a targeted whitespace
  scan for the new Spec 205 files: passed.
- Whole-repository TypeScript typecheck: intentionally not run because of the
  repository RAM constraint.
