# SPEC-310 G1 Owner Decision Packet

**Decision state:** `PROPOSED_NOT_APPROVED` for every row. This packet does not
grant live execution, production use, a credential, or an owner ACK.

**Reviewed canonical consumer base:** `a3d615c11b814db8d2d2529211a3b560e54d01a2`.
The consumer implementation SHA is `NONE`; this branch contains only proposal
artifacts and deterministic offline fixtures. Owner source snapshots below use
the same exact canonical main SHA unless an open producer PR is called out.

| Separate decision | Proposed interface and version | Producer SHA / status | Consumer SHA | Required negative decision tests | Requested owner ACK |
|---|---|---|---|---|---|
| Chat/user intent producer | `NativeRunIntentV1Proposal`, `native-run-intent.v1`; authenticated actor, tenant, conversation, optional Workspace, goal, requested capabilities and idempotency reference. No credential values. | PR #1161 head `27200602c527335dbd4385af84a01e55c4ffe89b`; OPEN, read-only `chat.runOnRunner`, failed `local-contract`; not a Native-work producer. | Proposal base `a3d615c11b814db8d2d2529211a3b560e54d01a2`; no consumer implementation SHA. | `llm:chat` alone yields `EXECUTION_GRANT_REQUIRED`; Runner device cannot impersonate actor; stale/unknown major rejected; duplicate key with changed payload creates no second intent. | SPEC-205/Chat owner to approve an exact future intent producer version and compatible merged SHA, or provide the existing canonical intent contract. |
| Command ingress/job authority | `NativeCommandAdmissionV1Proposal`, `native-command-admission.v1`; translates approved intent to existing SPEC-279/195 admission and `worker_jobs` plus outbox. | Canonical owner-source snapshot `a3d615c11b814db8d2d2529211a3b560e54d01a2`; no unique merged Native-work producer contract SHA identified. | Proposal base `a3d615c11b814db8d2d2529211a3b560e54d01a2`; no consumer implementation SHA. | Chat message success does not imply job admission; missing authority/outbox fails closed; idempotency conflict cannot create a duplicate job; no SPEC-310 job store. | SPEC-279 and SPEC-195 owners to confirm exact admission call/reference, replay key, fence and authoritative status source. |
| Runner/device/execution grant | `NativeAttemptGrantV1Proposal`, `native-attempt-grant.v1`; binds canonical job, attempt, actor, enrolled device, fence, expiry, capabilities, Gateway invocation ref and optional workspace ref. | Canonical owner-source snapshot `a3d615c11b814db8d2d2529211a3b560e54d01a2`; #1161 is an observation producer and is explicitly excluded as execution authority. | Proposal base `a3d615c11b814db8d2d2529211a3b560e54d01a2`; no consumer implementation SHA. | Desktop credential cannot execute; device identity cannot mint a grant; missing/revoked/expired grant, wrong tenant/attempt/fence/device or stale lease has no side effect. | SPEC-205/278 Runner owners to approve distinct device and per-attempt authority references and revocation/fence semantics. |
| Workspace/artifact ACL | `NativeWorkspaceArtifactBindingV1Proposal`, `native-workspace-artifact.v1`; opaque existing Work Context/Workspace and Library artifact refs; workspace omission permitted only where capabilities do not touch files. | Canonical owner-source snapshot `a3d615c11b814db8d2d2529211a3b560e54d01a2`; no unique cross-owner wire producer SHA identified. | Proposal base `a3d615c11b814db8d2d2529211a3b560e54d01a2`; no consumer implementation SHA. | Cross-tenant/foreign Workspace or artifact denied; no workspace does not grant home/repository access; traversal/symlink and digest mismatch denied; read ACL does not imply write ACL. | SPEC-269/292/278/284/293 and Library/artifact owners to name the canonical refs, ACL check and writer-fence API. |
| Gateway authorization and credit settlement | `NativeGatewayInvocationV1Proposal`, `native-gateway-invocation.v1`; per-attempt Gateway grant, model route, tenant/actor/job/attempt correlation, usage and settled-ledger refs. | Canonical owner-source snapshot `a3d615c11b814db8d2d2529211a3b560e54d01a2`; no Native-specific merged Gateway producer contract SHA identified. | Proposal base `a3d615c11b814db8d2d2529211a3b560e54d01a2`; no consumer implementation SHA. | Direct provider URL/key denied; Gateway outage has no fallback or success receipt; missing reservation/attribution or duplicate settlement is rejected/reconciled once. | SPEC-207/280 and Gateway owners to approve auth headers/claims, reservation and settlement correlation, retry and refund behavior. |
| SPEC-269 team delegation | `NativeTeamChildAttemptV1Proposal`, `native-team-child-attempt.v1`; a subordinate Native attempt consumes an existing SPEC-269 plan and canonical job child reference. | Canonical owner-source snapshot `a3d615c11b814db8d2d2529211a3b560e54d01a2`; no dedicated merged producer wire SHA identified. | Proposal base `a3d615c11b814db8d2d2529211a3b560e54d01a2`; no consumer implementation SHA. | Pi cannot schedule or expand a team; child cannot widen parent capability/budget; depth/fanout/concurrency bounds and single-writer fence fail closed; reviewer cannot self-certify. | SPEC-269 owner to approve delegation reference, child bounds, result lifecycle and team-vs-Pi responsibility. |
| SPEC-224/271 independent acceptance | `NativeAcceptanceEvidenceV1Proposal`, `native-acceptance-evidence.v1`; references evidence artifacts and independent verdict only; no runtime self-certification. | Canonical owner-source snapshot `a3d615c11b814db8d2d2529211a3b560e54d01a2`; independent verifier producer SHA must be supplied by owners before use. | Proposal base `a3d615c11b814db8d2d2529211a3b560e54d01a2`; no consumer implementation SHA. | Mocks/docs cannot produce PASS; production flag stays off without real Gateway/credit/execution proof; SPEC-310 cannot lower or displace SPEC-224 E2E or SPEC-271 acceptance. | SPEC-224 and SPEC-271 owners to approve evidence schema, independent verifier and priority/noninterference statement. |

## Boundary decisions

- Approve each row independently; one ACK does not imply any other row.
- ACK means compatibility with the named proposal revision and exact producer /
  consumer SHAs only. It does not authorize dispatch, a live credential, a
  production target, a budget, a Windows install, or a release.
- Consumer SHA stays `NONE` until a separately gated implementation exists.
  The proposal base SHA is recorded for reproducibility and is not a consumer
  implementation.
- The original R1.0 A01–A20 excerpt remains unavailable. Acceptance criteria
  cannot be frozen against it until its actual text is supplied or located.
- Preserve the architecture distinction: Python OpenAI Agents API owns
  canonical orchestration; a Pi-backed model/tool loop may be subordinate
  inside the Native Harness. A conflict in the missing R1.0 wording requires
  owner review, not an inferred interpretation.
