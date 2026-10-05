# Spec 224 Local Runner Candidate Implementation Plan

> **For agentic workers:** Execute the plan in order. Every behavioral change starts with a failing focused test and is verified before continuing.

**Goal:** Run Chat-originated Spec 224 changes on the current development server while preserving the selected long-lived workspace and applying only authorized, conflict-free changes from an isolated local candidate.

**Architecture:** The local Rust Runner fingerprints tracked and non-ignored untracked source, snapshots each authorized run below its private data root, and runs the existing local Codex/Claude adapter against that candidate with the provider's native filesystem sandbox. Server-derived policy travels in the existing authenticated `worker_jobs`/lease-bound Runner command. After provider success, the Runner validates the entire file delta, compares changed-path fingerprints against the original workspace, and applies a journaled atomic patch; conflict or failure retains the candidate and never overwrites user edits. Cloudflare can later implement this same candidate contract.

**Tech Stack:** Rust Runner, existing SHA-256 implementation, current Rust process adapters, existing TypeScript contracts/router, `worker_jobs` and Runner WSS.

**Spec:** `specs/feature/224-Autonomous Development Orchestrator Runtime/spec.md` Revision 21; `orchestra/spec224-workspace-first-20261003/contracts.md`.

## Global Constraints

- The existing local development Runner works without Cloudflare.
- The registered workspace remains the stable user-owned source of truth.
- No new queue, approval authority, or build/test/application-run control plane is introduced.
- Code-changing Start continues through the existing Spec 224 authorization and canonical `worker_jobs` lease/fence path.
- No provider process writes directly to the registered workspace.
- No change outside a package's declared `allowedWriteSet` is applied; prompt-only Start explicitly authorizes eligible source files in the selected workspace.
- Do not run `npm run typecheck`, repository-wide builds, full E2E, or full integration suites on the shared host.

## Review Focus

- A file changes after prepare but before dispatch; candidate creation rejects the stale fingerprint.
- A user edits an AI-touched file during execution; apply retains the candidate and leaves the user file intact.
- A user edits an unrelated file during execution; apply preserves it and applies the independent candidate delta.
- A provider writes outside `allowedWriteSet`, via rename/delete/symlink/path traversal, or exits/fails/cancels; no unauthorized or incomplete patch reaches the source workspace.
- Codex/Claude sandbox is unavailable or attempts an unsandboxed fallback; the Runner rejects or terminates before source mutation.

## Files and Responsibilities

- `apps/runner-app/src/workspace_registry.rs`: deterministic workspace source fingerprint and redacted publication.
- `apps/runner-app/src/spec224_candidate.rs` (new): candidate copy, baseline manifest, delta validation, per-path CAS, journaled apply/recovery, bounded cleanup.
- `apps/runner-app/src/external_agent.rs`: select candidate cwd for Spec 224, require native sandbox, finalize candidate after provider exit.
- `apps/runner-app/src/diagnostics.rs`: carry candidate policy through active process and report applied/conflict result via existing receipt.
- `apps/runner-app/src/protocol.rs`: validate bounded Spec 224 policy payload.
- `apps/web/server/services/runnerContracts.ts`: validate the content fingerprint in Runner workspace facts.
- `apps/web/server/services/spec224WorkspaceSpecSet.ts`: pin fingerprint and return selected package write set; prompt-only returns whole eligible-source authority.
- `apps/web/server/routers/spec226DevelopmentControl.ts`: persist server-derived policy in run metadata/manifest.
- `apps/web/server/services/agentControlPlaneContracts.ts`, `spec224DevelopmentRunContracts.ts`, `externalAgentRunnerDispatcher.ts`: validate and send policy via existing command; remove the temporary fail-closed runtime guard only after Runner support is integrated.

## Tasks

### Task 1: Fingerprint Runner workspace source

- [x] Add tests for changes to tracked, dirty, untracked, deleted, executable and symlink entries; ignored files must not affect the digest; absolute paths must not leave the Runner.
- [x] Verify the initial fingerprint test fails because snapshot facts expose only `gitHead`, branch and dirty state.
- [x] Implement deterministic source manifest hashing with normalized relative paths, type/mode and content digest; reject unsafe or unsupported path entries.
- [x] Add validated `contentFingerprint` to the per-workspace Runner capability snapshot and TypeScript `workspaceFactsFromSnapshot` output.
- [x] Run focused Rust workspace registry tests and focused `runnerContracts` / workspace SpecSet tests.

### Task 2: Pin policy at Start

- [x] Add tests proving a work package's write set and source fingerprint survive resolve → prepare → Start → persisted Agent manifest; prompt-only uses explicit whole-source mode.
- [x] Verify the focused contract tests reject missing or malformed values and route assertions pin prompt policy.
- [x] Implement bounded validation for fingerprint, path lists, policy mode and work-package identity across TypeScript contracts; bind the policy to immutable run input metadata.
- [x] Add payload validation in Rust for malformed fingerprint, unsafe paths, too many paths and accepted prompt/package variants.
- [x] Run focused Web manifest/contract/router tests and Rust protocol tests.

### Task 3: Create isolated local candidate and require provider sandbox

- [x] Add Runner tests proving candidate copies tracked dirty + non-ignored untracked source, excludes `.git` and ignored files, and never writes candidate files into the original workspace.
- [x] Add tests that Codex receives `workspace-write` and Claude receives strict sandbox settings; Claude Linux preflight rejects missing sandbox binaries.
- [x] Implement candidate storage under `RunnerConfig.data_root/spec224-candidates/<opaque-run-id>` using safe validated relative paths, resource bounds and atomic initialization.
- [x] Materialize lease-bound Spec 224 input into the candidate instead of the registered workspace.
- [x] Run focused `cargo test --lib spec224_candidate` and external-agent tests.

### Task 4: Validate delta, compare-and-swap and recover apply

- [x] Add tests for allowed add/edit/delete, denied paths, directory-prefix matching, symlink escapes, same-path concurrent user edit, unrelated concurrent edit, and restart during apply journal. Provider failure/cancel retain the candidate and carry an opaque reference in receipt/error evidence.
- [x] Verify candidate behavior against the previous shared-workspace implementation through initial failing tests and focused contract checks.
- [x] Implement complete candidate delta extraction and `allowedWriteSet` validation; any forbidden path rejects the whole delta.
- [x] Implement per-changed-path CAS and a durable journal with staged backups, atomic file replacement, rollback and startup recovery.
- [ ] Retain conflict candidates and expose an opaque recovery reference through the existing Runner receipt; never include local filesystem paths or prompt/spec bytes in control-plane events.
- [ ] Run focused candidate apply, diagnostics receipt and Runner journal tests.

### Task 5: Enable local Spec 224 execution and certify source-level flow

- [x] Update dispatcher test to verify command carries the validated policy.
- [x] Remove the temporary denial after Runner candidate integration and focused tests passed.
- [x] Add candidate apply/conflict/recovery tests using temporary repositories; provider CLI itself has not been live-invoked.
- [x] Run focused Web suite, Rust suite and diff checks; live DB migration/provider evidence remains open.
- [x] Update Spec 224 contract and Orchestra gap ledger. Cloudflare is a future adapter, not a local dependency.
- [ ] Run an opt-in local provider smoke test and verify the updated Runner on the actual development server.
