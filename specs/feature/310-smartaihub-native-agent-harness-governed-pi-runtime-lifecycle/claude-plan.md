# SPEC-310 Scoped Implementation Plan

## Status and base

Planning resumed and validated complete (6/6 sections) against `origin/main` SHA `5cb2d07f91fd5da7fd486c317760be199cf03336` in branch `codex/spec310-deep-implement-20261022`. G0 has been refreshed in `g0-discovery.md`; G1 proposal is in `g1-contract-proposal.md`. Section 02 remains owner-pending. Sections 03–06 may proceed only when their specific prerequisites are evidenced. No section or this plan authorizes production execution or the Chat dispatch bridge.

## Requirement ledger

| Requirement | Source | Status | Planned section / proof |
|---|---|---|---|
| Unique SPEC number and non-interference | R1.3 A57–A59; user instruction | SPEC-310 occupied canonically; local SPEC-309 remains untouched and has no canonical reservation | 01; refreshed registry/PR/worktree receipt and scoped diff |
| Existing owner boundaries and no duplicate authorities | R1.3 R1.3.1–3; SPEC-195/205/207/210/224/269/271/278/279/280/292/293 | G0 mapped; G1 proposal recorded; producer ACK pending | 01–02; owner matrix and owner-reviewed contract |
| Native Harness privately manages pinned Pi and uses Gateway only | R1.2 §A/§L/§R; R1.3 R1.3.1/R1.3.4 | G1 proposal; owner review and Pi provenance pending | 02–03; manifest contract, transport contract, negative direct-provider checks |
| Chat-first general work with first-class non-Git Workspaces | R1.2 §L/§M/§N; R1.3 R1.3.4; A64 | Contract proposed; live path unproven | 02/04; no-Git contract fixtures then real artifact receipts |
| Separate user, Runner and per-attempt credentials; no execution via `llm:chat` | R1.3 R1.3.2/R1.3.4; A60–A62 | G0 source reviewed; negative proof pending | 02–04; identity matrix and denial tests |
| Wait for stable approved Runner/Chat contract before dispatch bridge | R1.3 R1.3.3/R1.3.5/R1.3.7; A63 | Waiting external producer contract | 05; exact merged SHA, owner ACK, compatibility tests are entry criteria |
| Native production disabled pending real proofs; preserve SPEC-224 E2E | R1.3.1/R1.3.5/R1.3.6; repo rule | Required invariant | All sections; feature-off tests and separated live acceptance ledger |
| Ten evidence-backed gap reviews | R1.3.6/A67 | Ten G0 planning lenses are complete; ten scoped G0/G1 implementation-artifact reviews remain to be recorded after the artifact changes | `implementation-gap-review.md`; review exact implementation HEAD and do not represent reviews as runtime acceptance |
| Original R1.0 A01–A20 reconciliation | Cumulative input caveat | Source missing from repository snapshot | 01; locate canonical source before acceptance coverage is frozen |

## G1 contract design

The contract pack is documentation and test-fixture design until owners accept it. Its logical entities are references to canonical authorities, not new stores:

```ts
type NativeRunIntentV1 = {
  contractVersion: "native-run-intent.v1";
  conversationRef: string;
  workContextRef: string;
  workspaceRef?: string; // absent is valid for read-only/no-workspace tasks
  goal: string;
  attachmentRefs: string[];
  requestedCapabilities: string[]; // proposal only
  policySnapshotRef: string;
  budgetLimitRef: string;
  idempotencyKey: string;
};

type NativeAttemptGrantV1 = {
  canonicalJobId: string;
  attemptId: string;
  executionGrantRef: string; // separate from desktop and Runner credentials
  leaseFence: string;
  runtimeManifestDigest: string;
  gatewayInvocationGrantRef: string;
  effectiveCapabilityGrantRefs: string[];
  workspaceRef?: string;
};
```

The producer/consumer transport is intentionally unspecified until the Runner/Chat owners choose and approve it. These types do not grant authority and do not imply a live route. Admission remains the existing SPEC-279/195/207/280 path; team intent remains SPEC-269; code delivery remains SPEC-224/271; execution remains the approved Runner/cloud executor.

## Small, independently reviewable PR sequence

| Slice | Deliverable | Merge prerequisite | Explicitly excluded |
|---|---|---|---|
| PR-A G0 proposal | R1.3 source, current discovery/owner map, exact number audit, non-interference ledger | Current registry/PR/worktree evidence attached; no local 309 edits | Runtime code, registry auto-allocation, Companion changes |
| PR-B G1 contract pack | Versioned schemas, authority matrix, negative-case fixtures, SPEC-210 change request | Named producer owners review their respective interface rows | Actual Chat bridge, DB/API/schema migrations |
| PR-C isolated Native spike | Managed Pi load/pin/loop and Gateway transport in an isolated non-production harness | G1 runtime/Gateway contract accepted; package provenance and isolated environment approved | Production flags, Runner user-facing dispatch, direct provider calls |
| PR-D canonical non-Git execution | One bounded read-only general-work job with artifact and charge evidence | Stable approved ingress and execution contracts; live Gateway and credit authority available | Multi-agent writes, code lifecycle replacement, production rollout |
| PR-E gated bridge | Chat-to-Native request adapter consuming approved ingress contract | Exact producer merge SHA, owner ACK, per-run execution authority, scoped billing/capability authority | Broadening `llm:chat`, modifying WP owner branches |
| PR-F team/runtime/installer expansions | Child attempts, runtime updates, Windows/Linux/cloud placement | Canonical parent-child fencing, per-attempt accounting, signed packages, target authority | Orca requirement, independent scheduler/ledger, production enablement without acceptance |

PR-A and PR-B are documentation-only. PR-C onward are separate code PRs and must not block SPEC-224 protected E2E work. Do not open a bridge PR before PR-E entry criteria are evidenced.

## Execution sections and ownership

1. **01 G0 owner and source audit** — record actual versions/paths, numeric allocation and original R1.0 provenance. Files owned: SPEC-310 docs only. Complete on exact canonical source and preserved-workspace collision report.
2. **02 G1 contracts and owner review** — produce schemas, authority/credential matrix, error/replay semantics and contract compatibility examples. Files owned: SPEC-310 docs and isolated fixtures only. Complete when named owners acknowledge their contract rows or gaps are explicitly `WAITING_OWNER`.
3. **03 managed Pi isolated spike** — only after G1 runtime/Gateway contracts and environment approval; pin/digest Pi and prove all model traffic crosses Gateway. Runtime remains isolated and flag-off. Complete with reproducible SPIKE evidence; this is not E2E.
4. **04 canonical non-Git general-work slice** — read-only request to verified artifact using existing Work Context/Workspace, worker_jobs/outbox, Gateway/credit and artifact authority. Requires real non-production actor, Runner, Gateway and billing receipts.
5. **05 Chat-to-Native dispatch bridge** — blocked until stable, owner-approved merged Runner/Chat ingress exists. Consume its exact version/SHA; no changes to producer branch. Add only a separate bounded consumer adapter and per-run grant checks.
6. **06 team, installer and acceptance expansion** — subordinate child attempts, signed runtime lifecycle, platform acceptance and independent review, using existing team/economic/task-control owners. Production enablement remains a later separately authorized release decision.

## Verification strategy

- For G0/G1: section structure validator, schema/type fixture review, contract-consistency review, and scoped-diff/secret checks. No runtime tests are claimed by documentation.
- For isolated runtime: package signature/digest, Node compatibility, direct-provider egress denial, Gateway invocation and failure/retry/recovery fixtures. Label all mock evidence `SPIKE_NOT_E2E`.
- For general work: live non-production job/attempt/lease receipt, Gateway request and usage identifiers, actual credit ledger reserve/settlement/reconciliation, workspace ACL evidence, artifact digest/provenance, and Task Control projection.
- For dispatch: producer/consumer version compatibility and owner ACK tied to exact merge SHA; desktop token/device credential/per-attempt grant negative tests; replay/idempotency and cancel/reconcile tests.
- For final acceptance: independent SPEC-271 evidence, applicable Runner device acceptance, and SPEC-224 E2E priority preserved. Mocks cannot set live acceptance state or enable production.

## Definition of done

G0/G1 plan is ready when every owner and interface has one source of truth, unknown producer choices are explicit, all section dependencies are accurate, and checks pass for the docs pack. Implementation completeness is not inferred from this plan. SPEC-310 as a whole remains incomplete until all applicable requirements, live receipts and independent acceptance evidence exist; Native production remains disabled until the authorized gates pass.
