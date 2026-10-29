<!-- PROJECT_CONFIG
runtime: rust-cargo
test_command: cargo test --manifest-path apps/runner-app/Cargo.toml
END_PROJECT_CONFIG -->

<!-- SECTION_MANIFEST
section-01-runner-copilot-adapter
section-02-canonical-dispatch
section-03-task-control-selection
section-04-verification-handoff
END_MANIFEST -->

# Implementation Sections Index

## Dependency Graph

| Section | Depends On | Blocks | Parallelizable |
|---------|------------|--------|----------------|
| section-01-runner-copilot-adapter | - | 02, 03 | No |
| section-02-canonical-dispatch | 01 | 03, 04 | No |
| section-03-task-control-selection | 01, 02 | 04 | No |
| section-04-verification-handoff | 01, 02, 03 | - | No |

## Execution Order

1. section-01-runner-copilot-adapter
2. section-02-canonical-dispatch
3. section-03-task-control-selection
4. section-04-verification-handoff

## Section Summaries

### section-01-runner-copilot-adapter
Requirement IDs: R1, R2, R4, R7. Objective: add a verified official-SDK Copilot adapter and fail-closed runtime/model/session/event/permission behavior. Scope: `apps/runner-app/Cargo.toml`, `Cargo.lock`, relevant `src/adapters.rs`, discovery and execution modules plus tests. Prerequisites: inspect exact pinned SDK APIs and supported targets. Completion predicate: adapter reports ready only after current install/auth/version/model probes, supports bounded lifecycle operations, redacts events and denies ungranted tools. Verification: focused Cargo tests/build. Evidence: SDK version/API, probe and lifecycle test outcomes. Fallback: unavailable SDK/auth remains unavailable; do not invent protocol or auto-install. Blocker strategy: pin the compatible official SDK or keep the adapter unsupported with precise evidence; no permission bypass. Reactivation: SDK compatibility/auth environment changes.

### section-02-canonical-dispatch
Requirement IDs: R3, R4. Objective: route Copilot through canonical existing agent dispatch and preserve worker-job authority. Scope: provider contracts, runtime admission, dispatcher, Runner command validation and associated tests. Prerequisites: section 01's stable adapter ID and model capability. Completion predicate: Copilot command binds selected fresh model, job/attempt/lease/fence/idempotency/approval/budget/workspace and execution projection, with duplicate/stale operations rejected. Verification: focused Vitest suites and contract tests. Evidence: command snapshot assertions and regression results. Fallback: reject unsupported Copilot mode; no new ledger or endpoint. Blocker strategy: adjust only additive provider allowlists; preserve Codex/Claude behavior. Reactivation: adapter contract changes.

### section-03-task-control-selection
Requirement IDs: R5. Objective: expose Runner-advertised Copilot and dynamic model options in existing Task Control. Scope: `Spec224WorkspacePanel.tsx`, its API projection types and focused tests. Prerequisites: sections 01 and 02. Completion predicate: only fresh available models can be selected; auth/runtime states are actionable; normal Goal dispatch is used. Verification: focused UI/API tests. Evidence: selection and unavailable-state assertions. Fallback: hide/disable selection when no verified catalog exists. Blocker strategy: use existing catalog projection; no second registry. Reactivation: Runner catalog schema change.

### section-04-verification-handoff
Requirement IDs: R6, R7. Objective: complete focused regression, security checks, and evidence handoff. Scope: task-owned tests and `orchestra/tasks/copilot-harness-20261029` artifacts. Prerequisites: sections 01–03. Completion predicate: focused Rust/web checks pass, owned diff has no secrets or unsafe grants, live E2E status is evidence-backed, and outstanding SPEC authority is accurately stated. Verification: scoped Cargo/Vitest tests and task diff scan. Evidence: command outputs, revision, live auth availability. Fallback: mark only unavailable live E2E as blocked; continue all offline tests. Blocker strategy: document precise missing external auth/runtime condition and reactivation command. Reactivation: authorized Copilot test credentials become available.
