# Claude Plan TDD

This document mirrors `claude-plan.md` and defines the tests to write before implementation work for each section.

The project uses a mixed testing stack. Unless a section explicitly requires otherwise, prefer:

- Vitest for shared contracts, server services, label logic, and feature-flag behavior
- Cargo tests for Tauri-side policy enforcement, package sync/materialization, runtime adapters, and workspace services
- Pytest only for legacy `python-backend` compatibility flows that remain intentionally supported during migration

## Architecture Shape

Write the following baseline contract tests before feature implementation begins:

- Test: desktop-host shared contracts serialize and round-trip across web and desktop code without enum drift.
- Test: runtime, locality, trust, and workspace labels reject unknown values and preserve forward-compatible parsing rules.
- Test: compatibility-only 004-era flows are explicitly marked and cannot be treated as canonical by default helpers.
- Test: Desktop Host projection into worker fabric preserves `desktop_zeroclaw_managed` without redefining Pi or Agency Swarm as worker-runtime registry types.

## Section 01: Canonical Surface, Device, and Contract Foundation

- Test: device registration payload validation rejects malformed capability payloads, stale protocol versions, and missing required identity fields.
- Test: policy snapshot objects include freshness metadata and fail validation when required policy fields are absent.
- Test: desktop feature flags default to disabled in the absence of explicit tenant enablement.
- Test: shared run-label enums render stable product labels for `Platform Skill`, `Pi`, `Agency Swarm`, `Cloud Agent`, and `OpenClaw Gateway`.
- Test: supersession matrix helpers mark the 004 localhost path as compatibility-only rather than active-default.
- Test: shared contract snapshots remain compatible with the existing worker runtime contract where compatibility is intended.

## Section 02: Package Trust, Sync, and Materialization

- Test: package metadata validation rejects missing signer, digest, compatibility range, capability-manifest digest, or package type.
- Test: signature verification fails closed when package metadata or payload digest is tampered with.
- Test: revocation feed handling blocks materialization when a package or signer is revoked.
- Test: compatibility checks reject packages outside the desktop-host supported runtime range.
- Test: current local-skill bundle metadata can still be wrapped inside the new package envelope without losing reviewed-entry or provenance signals.
- Test: desktop materializer returns explicit runtime destination, resolved capabilities, and freshness metadata for a valid package.
- Test: `local-unverified` or `project-local` outputs are marked trust-tainted and cannot publish into shared verified surfaces without promotion.

## Section 03: Local File Intelligence and Workspace Manager

- Test: managed root registration rejects sensitive or blocked roots by default.
- Test: managed file-search APIs only return results inside approved roots.
- Test: preview and snippet retrieval reject paths outside approved roots even if the caller provides absolute paths.
- Test: staged attachment APIs preserve provenance back to root and file identifiers.
- Test: workspace profiles reject non-approved mounts, egress classes, or resource overrides in managed mode.
- Test: writeback mode `read/search only` blocks writes completely.
- Test: writeback mode `managed output folder` permits only the configured output target.
- Test: user-confirmed writeback requires approval state before root writes proceed.
- Test: preview/index parser workers fail safely on malformed or hostile documents without compromising the Desktop Host process.
- Test: root removal purges derived preview, snippet, and index data for that root.
- Test: offboarding cleanup removes or invalidates derived local-file stores according to policy.

## Section 04: Execution Router and Pi Runtime Host

- Test: route selection prefers Platform Skill, Pi, Agency Swarm, Cloud Agent, or OpenClaw based on explicit policy and task metadata cases.
- Test: route selection persists a machine-readable rationale for the chosen runtime.
- Test: managed Pi startup uses the sidecar/RPC boundary by default and does not silently switch to embedded mode.
- Test: managed Pi provider injection accepts only gateway-issued configuration and rejects unmanaged provider keys.
- Test: Desktop Host Pi tool adapters deny capability requests outside the resolved manifest.
- Test: Desktop Host platform access uses HTTP-first behavior for core flows and does not require MCP when HTTP contracts exist.
- Test: locality labels resolve to `Local` only when the execution and data path satisfy Feature 070 truthfulness rules.
- Test: degraded gateway or stale policy conditions block managed Pi execution instead of silently falling back to direct-provider access.

## Section 05: Agency Swarm and Connector Runtime

- Test: agency-pack materialization produces topology, policy, and adapter metadata required for local runtime execution.
- Test: Agency Swarm runtime initialization prefers Docker-contained execution in managed mode.
- Test: Agency Swarm startup accepts only Desktop Host-injected gateway configuration in managed mode and rejects unmanaged provider keys.
- Test: thread persistence callbacks are owned by Desktop Host and can restore prior local run state.
- Test: shared MCP or file adapters exposed to Agency Swarm are filtered by Desktop Host capability resolution.
- Test: connector action requests require connector-specific policy approval before outbound calls are attempted.
- Test: connector secrets are injected only for the runtime and duration required, then cleaned up after use.
- Test: Pi-to-Agency hybrid handoff preserves run lineage, runtime labels, and prepared file context without relabeling the flow incorrectly.

## Section 06: Unified UX, Cross-Surface Handoff, and Run Labels

- Test: run badges render consistent surface, runtime, trust, locality, and workspace labels across web and desktop surfaces.
- Test: package detail views render signer, trust class, revocation state, and capability summary from the same shared helpers.
- Test: desktop bootstrap states handle sign-in, device registration, policy fetch, root selection, package sync, and failure states without broken transitions.
- Test: `Open in Desktop` deep links resolve to the correct project, run, skill, or agency context.
- Test: `View on Web` links resolve back to the same canonical object identifiers from desktop-originated runs.
- Test: UI never displays `Local` for runs whose saved metadata classifies them as `Hybrid`.

## Section 07: Security, Governance, Audit, and Offboarding

- Test: capability enforcement occurs at sync, materialization, run start, tool call, connector call, and secret-issuance checkpoints.
- Test: secret-store adapters reject retrieval when device, runtime, or capability scope does not match the request.
- Test: refresh and runtime token issuance require device proof-of-possession rather than bearer-only replay.
- Test: device re-key invalidates the old credential path and flags suspicious concurrent use.
- Test: device disable immediately blocks new run starts after the next policy refresh.
- Test: token refresh and runtime-scoped token issuance honor device binding and expiry semantics.
- Test: quarantine state prevents package execution even when a cached local bundle already exists.
- Test: updater metadata verification rejects bad signatures and unauthorized downgrades.
- Test: signer rotation and compromised-signer revocation are enforced without needing unsafe client bypass.
- Test: audit logging redacts sensitive payloads and records metadata references instead of raw secrets or full document contents.
- Test: approval matrix enforcement covers destructive file writes, shell escalation, connector outbound actions, non-default mounts, and unverified package execution.
- Test: DLP-aware enforcement covers connector messages, sensitive prompt bodies, trust-tainted output publication, and managed-workspace exports.

## Section 08: Rollout, Migration, and Regression Matrix

- Test: rollout flags keep Desktop Host features disabled by default for tenants that are not enrolled.
- Test: legacy 004 localhost compatibility flows remain functional only where the rollout matrix says they are still supported.
- Test: worker-runtime family behavior from 071-074 remains intact when Desktop Host compatibility projection is enabled.
- Test: docs and UI helpers consistently label compatibility-only, local, hybrid, external, and server-side flows.
- Test: stale policy or revocation freshness expiry blocks trust-sensitive managed execution while still allowing safe local browsing or history inspection.
- Test: degraded gateway mode never falls back to unmanaged public-provider access.
- Test: migration sequencing supports incremental enablement without requiring a big-bang switch of all existing Tauri capabilities.
- Test: each rollout phase has an explicit exit gate and later-phase flags cannot enable early if those gates are unmet.

## Delivery Sequence and Ownership

Write sequencing-focused regression stubs before implementation wave planning:

- Test: Section 02 features cannot be enabled unless Section 01 shared contracts and device identity are present.
- Test: runtime enablement flags for Pi and Agency Swarm remain off when package trust or policy snapshot prerequisites are missing.
- Test: org rollout enablement blocks when signed updater requirements are not satisfied.

## Testing and Verification Strategy

- Test: Vitest suites cover shared contracts, route decisions, policy services, and label helpers.
- Test: Cargo suites cover package sync, workspace policy, local-file enforcement, runtime adapters, and secret handling.
- Test: Pytest coverage exists only for explicitly retained localhost compatibility behaviors and does not expand the legacy compatibility footprint.
- Test: denial-path coverage is present before happy-path enablement for any trust-sensitive area.

## Major Risks to Manage During Implementation

- Test: raw low-level Tauri commands are not exposed as the default managed UX contract once Desktop Host services exist.
- Test: runtime taxonomy stays aligned between shared contracts, UI labels, and worker-fabric projection helpers.
- Test: `local-unverified` outputs remain isolated from shared verified publication paths by default.
- Test: signed update trust chain and device offboarding controls are in place before broad managed rollout.
- Test: truthfulness regressions are caught when any new UI or API path tries to overstate locality or governance.
