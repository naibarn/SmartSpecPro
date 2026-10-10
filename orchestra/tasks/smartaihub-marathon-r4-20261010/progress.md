# SmartAIHub Marathon R4 Progress

**Canonical base:** `origin/main` = `96016bd2207f65e97ef89d680d294ae633ad6bad`

**Worktree:** `/home/dev/worktrees/smartaihub-r4-20261010`
**State:** `CHECKPOINT_CANDIDATE`; no PR or merge SHA yet.

## Completed evidence

- Added a synthetic composition test from the SPEC-271 independent evaluator through portable receipt validation to the receipt-object adapter. It covers accepted evidence binding, cross-tenant scope substitution before object write, and mismatched run identity.
- Clarified that the existing replay test shares the same object-storage adapter across service instances; it does not prove process restart durability.
- Focused command: `cd apps/web && npm test -- --run server/_core/__tests__/context.appIngress.test.ts server/services/__tests__/projectResolutionAuthority.test.ts server/services/__tests__/contextBuilder.test.ts server/services/__tests__/spec271AcceptanceReceiptFlow.test.ts server/services/__tests__/spec271IndependentAcceptance.test.ts server/services/__tests__/spec271PortableEvidenceReceipt.test.ts server/services/__tests__/spec271DurableEvidenceReceiptStore.test.ts`
- Result: 7 files passed; 95 tests passed; 1 TODO remains for a server-authenticated custom-domain ingress assertion. These are focused contract tests, not direct T-01–T-23 UAT.

## Lane dispositions

- **SPEC-304 ingress:** current `createContext` keeps `trustedAppContext` null. Repository inspection found no general authenticated edge-to-origin App route assertion; do not trust Host/X-Forwarded-Host or expand the SPEC-260 emergency token. Deployed ingress proof remains pending.
- **SPEC-269 memory isolation:** Phase 1 Project reads remain fail-closed absent trusted App context; App-private memory has no existing storage scope and must not be encoded through legacy persona/user identifiers. Dirty SPEC-268/269 historical worktrees remain preserved and unmodified.
- **SPEC-302 durable receipt:** Phase 2 contract exists, but no accountable schema owner or migration approval was found. No schema/migration changes or database execution were made.
- **SPEC-271/SPEC-224:** this checkpoint composes existing evidence contracts with synthetic adapters only. It does not prove durable process restart, a real DevelopmentRun dispatch, deployed ingress, or any T-01–T-23 case.

## Next executable WorkUnit

`SPEC271_NONPROD_RUNTIME_ACCEPTANCE`: connect the independent evaluator to an authorized non-production runtime and persisted artifact/run authorities; keep each T-case `PARTIAL`/`BLOCKED` until its real boundary is executed. In parallel, resume `SPEC304_TRUSTED_INGRESS_CONSUMER` only when a server-authenticated route assertion contract or authorized ingress test authority is available. Continue the Phase 2 receipt contract without migration execution once the SPEC-302 schema owner is assigned.

**Preserved authority:** Project-shared memory writes remain DENY; SPEC-224 protected dispatch remains DENY; no production migration/deployment, grants, or credentials were issued.
