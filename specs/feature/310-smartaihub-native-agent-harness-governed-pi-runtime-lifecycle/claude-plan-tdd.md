# SPEC-310 Focused Verification Ideas

These are implementation test ideas, not evidence that tests ran or passed.

## Section 01 — G0 ownership and provenance

- Parse canonical registry source and generated status; assert no duplicate 310, preserve the distinct local 309 artifact, and compare registry/feature-tree/PR/remote/worktree observations at the same source SHA.
- Assert feature metadata records actual base SHA and marks missing original R1.0 as unresolved instead of claiming full coverage.

## Section 02 — contracts and credentials

- Schema compatibility fixtures for Native run intent and attempt grant; unknown versions fail closed.
- Identity matrix denies: desktop Chat bearer → execution; Runner device credential → user impersonation; `llm:chat` → shell/filesystem/tool/team execution; expired/revoked grant → new attempt.
- Chat send success without a canonical job receipt does not create a task projection; duplicate idempotency key with different payload rejects.
- Non-Git intent with no repository/branch remains valid; workspace refs are authorized by the existing owner.

## Section 03 — managed Pi isolated spike

- Pinned Pi package version/digest and runtime manifest are checked before startup; invalid or changed artifact fails before execution.
- Gateway-only transport: direct provider DNS/HTTP is denied, Gateway is required, and every Native model attempt binds tenant, actor, canonical job, attempt and grant.
- Gateway outage, timeout, cancellation and restart preserve canonical attempt/fence state and never silently fall back to provider credentials.

## Section 04 — non-Git canonical general work

- Read-only report path with no Git provider or Runner local folder where approved transport suffices.
- Local workspace ACL, traversal, symlink race, offline/reconnect and single-writer/candidate-copy cases.
- Verify artifact digest/provenance and real Gateway usage plus credit settlement/reconciliation correlate to the canonical job and attempt.

## Section 05 — gated Chat bridge

- Bridge test suite is not enabled until a producer contract fixture is tied to an owner-approved merged SHA and exact version.
- Contract rejection, stale producer version, missing execution grant, wrong tenant, duplicate request, cancellation acknowledgement without terminal state and unsupported workspace return explicit blocked/reconcile states.
- Verify WP1 read-only `observe`/`action=none`, C0 auth scopes, C1 Chat behavior and C2 projection are unchanged with Native disabled.

## Section 06 — teams, runtime lifecycle and acceptance

- Parent/child attempt depth/fan-out/concurrency/budget bounds; each child has independent grant and accounting under one canonical parent.
- Reviewer independence and non-Git simultaneous writer protection; no use of Orca task graph as canonical status.
- Side-by-side Pi update, signature rejection, active-run pin preservation and rollback/failure injection on actual supported targets.
- Keep simulated Gateway/credit/Windows/cloud evidence marked mock; only actual receipts and SPEC-271 independent evidence can satisfy live gates. SPEC-224 E2E remains unaffected and higher priority.
