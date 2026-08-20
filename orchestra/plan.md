# Orchestra Plan

## Task
Repair the Vertical Drama Draft QC revision gate so server-managed `storyDesign.legacyControlArchive` metadata does not stop QC or Draft confirmation.

## Task Classification
- Scope: small
- Risk: medium
- Affected domains: Backend QC service, shared Vertical Drama story-design contract, focused tests
- Estimated file count: 3
- Chosen route: direct-edit / inline-standard-light
- Bug route: true
- Classification notes: The failing component is identified and the evidence points to a narrow cross-file contract mismatch. No schema, auth, or external provider change is required.

## Discovery and Evidence Ledger
- SocratiCode: unavailable in this runtime; scoped `rg`, file reads, git blame, and focused tests used as fallback.
- source: ui-only + source inspection
- identifier: `Draft revision changed immutable field: storyDesign.legacyControlArchive`; `apps/web/server/services/verticalDramaDraftQualityQc.ts:1059`
- observed failure: QC stops in `revise (round 1)` when `legacyControlArchive` differs after server-side story-design repair.
- data state: `repairVerticalDramaDraftStoryDesign` writes `legacyControlArchive` as audit-only metadata; `assertMutableStoryDesignContract` rejects unknown `storyDesign` keys.
- confidence: high
- next evidence needed: focused regression test proving an audit archive change is accepted while active story-control mutations remain rejected.

## Impact Preflight
- Directly changed files: `apps/web/shared/verticalDramaSeries/draftQualityQc.ts`, `apps/web/server/services/verticalDramaDraftQualityQc.ts`, `apps/web/server/services/__tests__/verticalDramaDraftQualityQc.test.ts`
- Dependent surfaces: Draft QC queue and explicit repair both call the same immutable/story-design checks; Create Series uses the resulting QC receipt as its server-side confirmation gate.
- Risk-sensitive surfaces: Draft data integrity and user-facing QC/confirmation workflow; no auth, tenant, migration, or payment contract changes.
- Sequential work: test first, then smallest shared/server contract fix, then focused verification.

## Loop Policy
- dispatch_preference: direct-standard-light
- parallel_default: false
- planned_agents: []
- security_gate_required: false

## Planned Waves
1. Add a regression test that reproduces the server-managed audit archive change. Complete: the test failed with the reported immutable-field error.
2. Update the immutable story-design contract to ignore only the known audit-only archive metadata and strip provider-supplied copies before merge, then run focused tests and diff checks.

## Current Task Addendum — MCP / Remotion Executor Production Gap

- Scope: executor release contract, server pack admission, Windows/macOS installer layout, UI guidance, and production-readiness proof.
- Discovery: SocratiCode MCP was unavailable; scoped shell inspection was used.
- Critical external blocker: all three production executor manifest URLs return `404 runtime_pack_not_published`.
- Implemented path: signed archive admission with SHA-256 + Ed25519 + actual ZIP content checks; executor CLI/runtime pack co-packaging; platform installer and credential-preserving upgrade/uninstall; UI status and documentation alignment.
- Remaining release action: build on Windows x64, macOS arm64, and macOS x64; configure the matching public key on the web server; verify and promote each signed pack; then run native doctor/connect/render/upload evidence.
