# Implementation Plan TDD

## Test-first strategy

Lock the most dangerous boundaries first:

1. device identity and package trust contracts
2. desktop-host policy wrappers over raw file and Docker primitives
3. package sync and revocation
4. local file intelligence boundaries
5. execution router and runtime-specific behavior
6. security, audit, and offboarding

## 1. Contracts, schema, and feature-flag tests first

Add or update tests that prove:

- device registry tables and shared types exist
- desktop package trust classes and package states are represented consistently
- capability-manifest vocabulary is shared between server and desktop-host contracts
- feature flags for desktop-host rollout and advanced local mode default fail-closed
- run label vocabulary for surface/runtime/trust/locality/workspace is stable
- the supersession matrix keeps 004 compatibility behavior explicit instead of implicit
- worker-fabric projection uses `desktop_zeroclaw_managed` only where intended, while Pi/Agency Swarm stay internal desktop-host runtime labels

Expected initial failing condition:

- device tables, shared contracts, and package-trust schema do not yet exist

## 2. Desktop-host wrapper and policy tests

Add tests for:

- managed roots enforcement on file access
- denial of non-approved absolute path access in managed mode
- managed workspace profile generation from approved mounts instead of raw volume strings
- Docker egress and environment policy generation
- audit events for file-root registration, file access, and workspace creation
- approval / step-up behavior for destructive writes, shell escalation, connector outbound, and unverified package execution

Expected initial failing condition:

- current Tauri commands are still raw primitives with no desktop-host policy layer

## 3. Package sync, signing, and materialization tests

Add tests for:

- signature verification success and failure
- compatibility-range checks
- revocation and quarantine handling
- materialization from signed package metadata into local runtime bundle layout
- local-unverified package restrictions
- provenance and trust-taint propagation for artifacts created by local-unverified packages
- server-side package catalog and download authorization

Expected initial failing condition:

- no signed desktop package registry or materializer exists yet

## 4. Local file intelligence tests

Add tests for:

- root consent registration and removal
- metadata indexing and freshness updates
- full-text search behavior
- preview/snippet retrieval
- optional vector index gating by policy
- sensitive-root blocking or warning defaults
- writeback mode enforcement

Expected initial failing condition:

- no dedicated local file service or index contract exists yet

## 5. Execution router and Pi tests

Add tests for:

- route selection for platform skill vs Pi vs Agency Swarm vs OpenClaw
- gateway-only enforcement in managed mode
- Pi runtime tool registration through Desktop Host adapters
- explicit failure when Pi needs a forbidden capability
- run labels and router rationale persistence
- truthful `Local` vs `Hybrid` labeling aligned with Feature 070 rules

Expected initial failing condition:

- no canonical desktop execution router or Pi runtime adapter exists yet

## 6. Agency Swarm and connector runtime tests

Add tests for:

- agency pack materialization into local runtime format
- hybrid handoff from Pi discovery to Agency Swarm orchestration
- connector enablement and secret injection scoping
- denial of unapproved connector/network use in managed mode
- long-running desktop-local run recovery and status reporting

Expected initial failing condition:

- no desktop Agency Swarm host or managed connector runtime exists yet

## 7. Web/desktop UX alignment tests

Add tests for:

- shared package labels and trust badges
- cross-surface object handoff
- run detail cards showing the same surface/runtime/trust/locality/workspace semantics
- first-run bootstrap states for sign-in, policy validation, root selection, and package sync

Expected initial failing condition:

- desktop and web do not yet share a unified surface/runtime labeling contract

## 8. Security, audit, and offboarding tests

Add tests for:

- device disable blocking new runs
- device enrollment bootstrap, token rotation, and stolen-device recovery
- revocation freshness TTL behavior while offline
- audit emission for package sync, runtime choice, file-root access, and outbound decisions
- quarantine state blocking execution
- secure cleanup triggers on next contact after offboarding
- document parser isolation and suspicious-file handling
- signed updater and runtime-bundle downgrade protection

Expected initial failing condition:

- no end-to-end desktop device governance or quarantine flow exists yet

## Fixtures and setup

- desktop device registration fixtures
- signed package metadata fixtures
- local-unverified package fixtures
- managed root fixtures with allowed and blocked paths
- workspace profile fixtures for restricted vs advanced mode
- router fixtures for task shapes and runtime availability
- connector fixtures with device-scoped secret references

## Suggested test commands

- `npm --prefix apps/web test`
- `npm --prefix apps/tauri-shell test`
- `pytest python-backend/tests -q`

Targeted suites should be added for:

- shared desktop-host contracts
- package trust and revocation
- local file service
- workspace manager
- execution router
- Pi runtime adapter
- Agency Swarm materializer
- device governance and audit
