# Section 06 — Structured/External Drivers and Checkpoint Integrity

## Goal and boundaries

Implement M5 provider-neutral adapters for structured ACP sessions and external harness sessions, with explicit handles and trustworthy checkpoint restore.

## Requirements

- Implement the Section 01 driver interface for ACP and provider/harness reattach adapters. Scope handles to tenant, job, session generation, driver and remote provider; store no provider credential in a manifest.
- Require pinned driver version/digest, authenticated provenance, trust tier and tested continuity profile. Driver code cannot self-assert stronger isolation/fencing than deployment policy permits.
- Checkpoint manifests bind job/session/generation, workspace generation, driver/version, creation/commit status, digest, artifact refs, allowed restore scope and ancestry. Only a fully committed, integrity-verified checkpoint restores.
- Handle provider disconnect, expired handle, non-replayable side effect, checkpoint mismatch, revocation and provider partial failure with safe status and evidence.
- External harness authority remains bounded by canonical job/Execution Authority Grant and mediated effect policy.

## Likely owned files

- New Rust driver modules under `apps/runner-app/src/` and driver contract/certification tests.
- New web service contracts only if remote handles/checkpoint references require persistence not provided by Section 01; keep binary/provider secrets outside client DTOs.
- `apps/runner-app/README.md` for supported driver/continuity profile.

## Acceptance and tests

Cover AC-25, AC-34, AC-39. Test tenant/session scope, provenance mismatch, checkpoint partial commit, digest/scope/lineage mismatch, expiry/revocation and downgrade. Provider mocks validate our adapter contract only, not real provider SLA.

## Dependencies

Requires Sections 01 and 03. Supplies checkpoint semantics to Section 07.

## Implementation record

- Added driver certification ceiling and checkpoint manifest scope/digest/lineage validation in `session_driver.rs`. Deployment trust comes from a separately supplied driver/version/source-digest allowlist; certificate content cannot assert its own trust.
- Follow-up fix: restore validation now recomputes the canonical lineage digest from the committed manifest and rejects a substituted checkpoint ID even when an attacker preserves the supplied lineage field. Added a regression case for manifest tampering.
- Added `checkpoint_store.rs`: bounded content-addressed checkpoint bytes and immutable committed manifests, exclusive process locking, mode-restricted control root/files, symlink rejection, fsynced temporary writes atomically installed without clobbering, scope/digest/lineage validation on reopen, and checkpoint/store quotas. Tests cover reopen, cross-scope rejection, ID conflicts, blob tampering and symlinked roots.
- Status: **PARTIAL / BLOCKED**. Local durable checkpoint storage now exists, but there is no ACP/external provider adapter, authenticated driver provenance/registry, revocation feed, or external provider contract proof.
