# SmartAIHub Marathon R4 Progress

**Canonical start:** `96016bd2207f65e97ef89d680d294ae633ad6bad`

**Integrated checkpoint:** PR [#453](https://github.com/naibarn/SmartSpecPro/pull/453), squash SHA `f036df3745aea4bcb4cfcff18be2ce5130e0673f`, verified reachable from `origin/main`.

**Worktree:** `/home/dev/worktrees/smartaihub-r4-20261010`
**State:** `CHECKPOINT_PROMOTED_PARTIAL`; R4 remains open.

## Completed evidence

- Added a synthetic composition test from the SPEC-271 independent evaluator through portable receipt validation to the receipt-object adapter. It covers accepted evidence binding, cross-tenant scope substitution before object write, and mismatched run identity.
- Clarified that the existing replay test shares the same object-storage adapter across service instances; it does not prove process restart durability.
- Post-integration focused command: `cd apps/web && npm test -- --run server/_core/__tests__/context.appIngress.test.ts server/services/__tests__/projectResolutionAuthority.test.ts server/services/__tests__/contextBuilder.test.ts server/services/__tests__/spec271AcceptanceReceiptFlow.test.ts server/services/__tests__/spec271IndependentAcceptance.test.ts server/services/__tests__/spec271PortableEvidenceReceipt.test.ts server/services/__tests__/spec271DurableEvidenceReceiptStore.test.ts`
- Result against `f036df3`: 7 files passed; 95 tests passed; 1 TODO remains for a server-authenticated custom-domain ingress assertion. These are focused contract tests, not direct T-01–T-23 UAT.
- Additional `spec224DevelopmentRunIntegration.test.ts` and `spec271IndependentAcceptance.test.ts`: 2 files passed; 13 tests passed. The DevelopmentRun seam uses in-memory adapters and synthetic worker completion; protected dispatch remains denied.
- Local App alias and authenticated-tenant route checks passed in the focused run. They remain component evidence only; they do not prove deployed ingress or T-15. The test command used a temporary `superjson` symlink to an already-installed package; the symlink was removed and no dependency install or manifest change occurred.
- `chatUnifiedWiring.test.ts` was reproduced on exact R4 canonical SHA `f036df3745aea4bcb4cfcff18be2ce5130e0673f` in isolated checkout `/tmp/r4-baseline-f036df3`: 16/16 passed. The historical failure at `b1f2d52e5ba864685dc28414c6f49d7ffe9523eb` was a stale `agencyEscalation`/`hybridPlan` assertion; current mainline has corrected behavior. No source edits were made for this repro.
- Added pure SPEC-302 Phase 2 replay comparison contract at `spec302ProjectResolutionReplayContract.ts`. It hashes allow-listed canonicalized metadata and returns only `NEW_KEY`, `EXACT_REPLAY`, or `IDEMPOTENCY_CONFLICT`; it rejects raw extra fields, unresolved Project destinations, unbound selections without an explicit no-session marker, and Project ceilings without resolved App/Project scope. It does not issue/store/validate/authorize receipts and has no runtime callers.
- The replay test covers 26 focused cases: stable digest, canonicalization precondition, all payload bindings, changed keys, ambiguous/unresolved/no-project/pending states, explicit no-session selection, raw prompt/secret fields, hidden properties, and object prototypes. Independent review found no P1/P2 defect; digest confidentiality and caller-side canonicalization remain explicitly documented/tested.
- Final focused command on the current task candidate: 19 files passed, 257 tests passed, 1 TODO. It covered SPEC-302 Phase 1/replay, SPEC-268/269 memory/prompt, SPEC-304 ingress/App identity, SPEC-271 receipts, SPEC-224 DevelopmentRun, and `chatUnifiedWiring`.
- Scoped TypeScript check passed for the new replay helper and its test using `tsc --noEmit --skipLibCheck --strict --target ES2022 --module ESNext --moduleResolution Bundler --types node`. Prettier check passed for both files. No repository-wide typecheck was run due the RAM policy.
- Ten targeted review dimensions covered replay semantics, tenant/principal binding, App/Project binding, invocation binding, resolution/destination validity, provenance/policy references, operation ceilings, prompt/secret/object-shape rejection, digest determinism/privacy limits, and no storage/issuance/authorization effects. An independent reviewer found no P1/P2 issue; the unkeyed digest and caller canonicalization constraints are documented and tested.
- These checks describe the current unintegrated candidate; the comparator remains a pure helper with no runtime caller and does not satisfy durable Phase 2 receipt persistence.

## Lane dispositions

- **SPEC-304 ingress:** current `createContext` keeps `trustedAppContext` null. Repository inspection found no general authenticated edge-to-origin App route assertion; do not trust Host/X-Forwarded-Host or expand the SPEC-260 emergency token. Deployed ingress proof remains pending.
- **SPEC-269 memory isolation:** Phase 1 Project reads remain fail-closed absent trusted App context; App-private memory has no existing storage scope and must not be encoded through legacy persona/user identifiers. Dirty SPEC-268/269 historical worktrees remain preserved and unmodified.
- **SPEC-302 durable receipt:** Phase 2 contract exists, but no accountable schema owner or migration approval was found. No schema/migration changes or database execution were made.
- **SPEC-271/SPEC-224:** this checkpoint composes existing evidence contracts with synthetic adapters only. It does not prove durable process restart, a real DevelopmentRun dispatch, deployed ingress, or any T-01–T-23 case.

## Next executable WorkUnit

Immediate action: review and integrate the pure replay-contract candidate through PR #454 after normal review. Next WorkUnit: `SPEC302_DURABLE_RECEIPT_SCHEMA_OWNER_RECONCILIATION` — assign the accountable SPEC-302 schema owner and obtain migration approval before persistence/schema work. Independently, run direct T-cases only against an authorized non-production runtime with persisted run/artifact authorities; local contract suites are supporting evidence, not direct T-01–T-23 acceptance. Resume `SPEC304_TRUSTED_INGRESS_CONSUMER` only when a server-authenticated route assertion contract or authorized ingress test authority is available.

**Preserved authority:** Project-shared memory writes remain DENY; SPEC-224 protected dispatch remains DENY; no production migration/deployment, grants, or credentials were issued.
