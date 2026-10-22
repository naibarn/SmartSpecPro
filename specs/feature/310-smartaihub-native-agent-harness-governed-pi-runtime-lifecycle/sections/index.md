<!-- PROJECT_CONFIG
runtime: typescript-pnpm
test_command: pnpm test (scope-specific command is selected per section)
END_PROJECT_CONFIG -->

<!-- SECTION_MANIFEST
section-01-g0-owner-audit
section-02-g1-contracts
section-03-managed-pi-isolated-spike
section-04-non-git-general-work
section-05-chat-native-bridge-gate
section-06-team-runtime-acceptance
END_MANIFEST -->

# Implementation Sections Index

## Dependency Graph

| Section | Depends On | Blocks | Parallelizable |
|---|---|---|---|
| section-01-g0-owner-audit | - | 02, 03, 04, 05, 06 | No |
| section-02-g1-contracts | 01 | 03, 04, 05, 06 | No |
| section-03-managed-pi-isolated-spike | 02 and approved isolated environment | 04, 06 | Yes, after 02 |
| section-04-non-git-general-work | 02, 03, existing canonical authority | 06 | Yes, after 02/03 |
| section-05-chat-native-bridge-gate | 02 and stable owner-approved merged Runner/Chat contract | 06 | No; external dependency |
| section-06-team-runtime-acceptance | 03, 04, 05 as applicable; SPEC-224/271 owners | - | No |

## Execution Order

1. section-01-g0-owner-audit (G0; current discovery artifact is recorded but must be refreshed before implementation/merge).
2. section-02-g1-contracts (G1; contract proposals require producer owner review).
3. section-03-managed-pi-isolated-spike and section-04-non-git-general-work may proceed independently after their respective authority/environment prerequisites.
4. section-05-chat-native-bridge-gate starts only after a stable owner-approved merged Runner/Chat contract exists.
5. section-06-team-runtime-acceptance follows applicable prior slices; SPEC-224 E2E keeps priority.

## Section Summaries

### section-01-g0-owner-audit
`requirement_ids: A57, A59, R1.3.1-R1.3.3, G0`. Record exact number/owner/dependency evidence and reconcile missing R1.0 source. Touched scope: SPEC-310 docs only. Prerequisite: latest `origin/main`. Completion: registry, PRs, branches, reservations and local worktrees are reported at one SHA; 309 remains unchanged. Verify by rerunning targeted source-control queries and checking the scoped diff. Evidence: dated discovery record. If registry and unpublished assignment disagree, keep assignment tentative and route registry resolution to its owner.

### section-02-g1-contracts
`requirement_ids: A60-A63, A67, R1.3.1-R1.3.4`. Define typed intent/grant/runtime/Gateway/workspace references, actor/credential matrix, negative cases and owner review. Touched scope: SPEC-310 docs and isolated fixtures. Prerequisite: section 01. Completion: canonical owner for each contract is named; unsupported assumptions are marked proposed/waiting. Verify schema examples, compatibility matrix and owner acknowledgements. Evidence: versioned contract pack and owner response. If an owner disagrees, open a focused `CROSS_SPEC_CHANGE_REQUEST`; do not edit their source branch.

### section-03-managed-pi-isolated-spike
`requirement_ids: A01-A20 (when canonical R1.0 is located), A30, A65, A68`. Load and pin privately managed Pi behind the Native Harness and verify all model transport uses SmartAIHub Gateway. Touched scope: new isolated runtime adapter/package and scoped tests only, after G1. Prerequisite: accepted runtime/Gateway contract and authorized isolated non-production environment. Completion: signed/pinned runtime starts, direct provider traffic is denied, Gateway usage correlates to canonical attempt; flag remains off. Verify focused package/runtime/effect-negative tests. Evidence: digest, test profile and redacted Gateway attempt receipt. If upstream release/ABI/provenance is unverified, use a deterministic fake for contract tests and keep live spike waiting.

### section-04-non-git-general-work
`requirement_ids: A41, A48, A64`. Prove one bounded read-only general-work flow with no GitHub/repository requirement, existing Work Context/Workspace authority and canonical artifact refs. Touched scope: new adapter slices only after G1; no new workspace DB. Prerequisite: accepted contracts, existing authorized executor and non-production Gateway/credit proof. Completion: real job/attempt, valid ACL, artifact digest/provenance and settled usage correlate. Verify focused authorization/idempotency/recovery tests and live receipt capture when available. If Runner/cloud authority is unavailable, deliver contract fixtures only and report external evidence pending.

### section-05-chat-native-bridge-gate
`requirement_ids: A58, A60-A63`. Add a bounded consumer for Chat intent only after the Runner/Chat producer publishes a stable owner-approved merged contract. Touched scope: separate SPEC-310 consumer files only; never WP1–WP2C2, Desktop Auth, Companion Chat or Task Control files. Prerequisite: exact merged producer SHA, contract version and owner ACK, plus canonical per-run execution/billing/capability grants. Completion: idempotent dispatch/reject/cancel/reconcile semantics use canonical job authority; `llm:chat` remains insufficient. Verify producer compatibility, negative identity/scope cases and feature-off regression. If contract or grant is absent, leave bridge unimplemented and record `WAITING_STABLE_APPROVED_RUNNER_CHAT_CONTRACT`.

### section-06-team-runtime-acceptance
`requirement_ids: A55-A68`. Expand subordinate child attempts, signed runtime update/rollback, real target acceptance and independent verification without replacing team/job/economic authorities. Touched scope: separately reviewed Native adapter/runtime slices. Prerequisite: applicable prior sections and SPEC-269/207/280/224/271 owner gates. Completion: bounded parent/child grants, single-writer semantics, actual platform proofs and independent acceptance; production remains off until explicit release policy is met. Verify focused tests plus real evidence. If a live proof cannot be collected, preserve `NOT_PROVEN`; SPEC-224 E2E remains first priority.
