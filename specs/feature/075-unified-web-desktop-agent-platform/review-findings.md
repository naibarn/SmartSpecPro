# Review Findings

## Purpose

This note records the main completeness, conflict, and security gaps found while reviewing Feature 075 against:

- the current SmartSpecPro codebase
- the older desktop baseline in Feature 004
- the local AI truthfulness rules in Feature 070
- the worker-runtime family in Features 071-074

It also records the concrete upgrades applied to the package afterward.

## Findings and resolutions

### 1. The original draft still conflicted with the active desktop spec

Finding:

- Feature 075 set a new desktop-host direction, but the older desktop spec in Feature 004 still looked like the active canonical truth
- the first draft did not clearly state whether the localhost `python-backend` proxy model was still required or only a compatibility path

Resolution:

- added a supersession matrix in `spec.md`
- explicitly marked the 004 localhost proxy model as compatibility-only for older flows until retirement
- reflected that compatibility rule in rollout/migration guidance

### 2. Runtime identity was not fully reconciled with the worker-runtime family

Finding:

- Feature 075 introduced Pi and Agency Swarm as desktop-local runtime labels
- the repo and worker-family specs already have `desktop_zeroclaw_managed` as a real worker-runtime identity
- without a reconciliation rule, scheduler/admin/fleet models could drift

Resolution:

- added a hard compatibility rule:
  - Desktop Host may project into worker fabric as `desktop_zeroclaw_managed`
  - Pi and Agency Swarm remain internal Desktop Host runtime labels

### 3. Device governance was too high-level to be secure

Finding:

- the first draft required device registration and offboarding, but did not define enrollment bootstrap, token classes, rotation, or stolen-device recovery

Resolution:

- added `Device enrollment and token model`
- required distinct token classes for bootstrap, refresh, runtime-scoped execution, and temporary scoped access
- added update-plan and TDD coverage for enrollment and rotation

### 4. Package trust was stronger than binary/update trust

Finding:

- the first draft required signed packages but did not define a signed desktop update chain for the app binary and bundled runtime support components

Resolution:

- added `Desktop update trust chain`
- extended architecture, API contracts, and implementation plan to include signed release metadata, update policy, updater bridge, and downgrade protection

### 5. Approval rules were too soft relative to the current Tauri shell reality

Finding:

- current Tauri commands already expose direct file writes/deletes and flexible Docker creation
- the first draft said advanced local mode was explicit, but did not define when actions are blocked, warned, stepped up, or allowlisted

Resolution:

- added `High-risk approval and step-up posture`
- added workspace escalation rules and machine-readable approval/denial recording
- expanded TDD guidance to cover destructive writes, shell escalation, connector outbound, and unverified package execution

### 6. Locality labels could have drifted from Feature 070 truthfulness rules

Finding:

- Feature 075 added runtime/locality labels, but the first draft did not explicitly inherit Feature 070's `Local` vs `Hybrid` truthfulness constraints

Resolution:

- added `Truthful locality labels`
- required a shared run-label matrix across desktop, web, and worker surfaces
- added TDD guidance so desktop-mediated flows are not mislabeled as `Local`

### 7. Desktop-to-platform transport posture was still ambiguous

Finding:

- Features 072 and 074 already establish HTTP-first / MCP-second as the truthful production contract for worker automation
- the first draft of 075 did not explicitly say Desktop Host should follow the same model

Resolution:

- added `Desktop-to-platform transport posture`
- required Desktop Host adapters to remain HTTP-first and MCP-second
- reflected this in the Pi and Agency sections and in the implementation plan

### 8. Artifact provenance for local-unverified outputs was missing

Finding:

- the first draft correctly restricted execution of local-unverified packages
- but it did not define what happens when those packages generate outputs that try to flow back into shared library, knowledge, or server execution

Resolution:

- added `Trust propagation for outputs`
- defined trust-tainted output behavior, publication restrictions, and approval/quarantine expectations
- extended package lifecycle guidance and tests to include artifact provenance

## Outcome

After the review pass and fixes, Feature 075 is materially stronger because it now includes:

- a clear supersession story relative to Feature 004
- a runtime identity reconciliation with the worker-runtime family
- an enforceable device enrollment and token model
- a signed update trust chain, not only signed packages
- explicit approval and escalation policy hooks for dangerous local actions
- truthful locality labeling aligned with Feature 070
- explicit HTTP-first / MCP-second desktop transport posture
- provenance and trust propagation for unverified local outputs

## Residual non-blocking gaps

These are still worth follow-on work, but they are not structural blockers for the spec package:

- recommended connector family order for rollout still needs product prioritization
- the exact minimum package manifest format should be settled in the package-registry follow-on slice
- update UX for forced security upgrades vs user-deferred upgrades still needs product detail work
