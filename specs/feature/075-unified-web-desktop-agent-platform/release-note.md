# Release Note

## Feature 075

Unified Web + Desktop Agent Platform

## Summary

Feature 075 turns SmartAIHub Desktop into a governed extension of the main product instead of a separate local tool.

The result is a single web + desktop platform with:

- one shared contract model
- one trust and package model
- one run-label model
- one device-governance model
- one rollout path for enterprise-managed local execution

In simple terms:

- Web stays the control plane.
- Desktop becomes the local execution-rich surface.
- Pi becomes the main local interactive runtime.
- Agency Swarm becomes the local multi-agent runtime.
- Managed local execution stays gateway-only.

## What Was Delivered

### 1. Platform foundation

- Added a shared Desktop Host contract layer for devices, packages, policy snapshots, trust classes, run labels, and rollout gates.
- Reconciled Desktop Host with the existing worker-runtime vocabulary by keeping `desktop_zeroclaw_managed` for worker-fabric projection while using Pi and Agency Swarm as internal desktop runtime labels.
- Added fail-closed feature flags and control-plane policy handling so managed rollout can be turned on gradually.

### 2. Package trust and sync

- Added signed desktop package lifecycle concepts for skills and agencies.
- Added desktop package catalog, revocation feed handling, materialization descriptors, and trust-aware package state reporting.
- Added fail-closed rules that prevent local-unverified outputs from being silently promoted into trusted shared surfaces.

### 3. Local file intelligence

- Added governed local roots instead of relying on raw whole-disk access.
- Added local search, metadata, preview, snippets, staging, purge, and derived-store lifecycle helpers.
- Added isolated rich-document parsing with bounded limits for PDF, Office, and image flows.
- Added optional stronger extraction when trusted host tools are present, including:
  - `pdftotext`
  - `pdftoppm` or `mutool`
  - `pdfinfo`
  - `soffice`
  - `tesseract`
- Added parser capability reporting so the product can truthfully show what each desktop device can and cannot do.

### 4. Runtime routing

- Added deterministic routing between platform skill, Pi, Agency Swarm, and external worker paths.
- Locked managed Pi posture to sidecar/RPC-first.
- Kept transport posture HTTP-first with MCP as controlled fallback.
- Added truthful locality labels so desktop work is not mislabeled as fully local when it is actually hybrid.

### 5. UX and UI

- Added Desktop Host surfaces in Settings with live device posture, policy, package, and parser details.
- Added tenant admin governance screens for desktop devices.
- Added clearer web discoverability so admins can reach Desktop Host from:
  - a dedicated Desktop Governance panel on the main Dashboard
  - the main Dashboard next-best-actions area
  - Admin Command Center drill-down cards
  - Admin Settings shortcuts
- Added `Open in Desktop` and `View on Web` handoff routes.
- Added managed local-root actions such as reindex, purge, and revoke.
- Added richer admin device cards that now show:
  - device owner identity
  - last-contact presence and stale posture
  - access state such as active, re-auth required, quarantined, or disabled
  - pending device-level actions
- Added per-device governance controls for:
  - policy overrides that can narrow tenant defaults
  - force re-auth
  - runtime-token revocation
  - active-run cancellation
  - temporary quarantine and resume
- Added user-visible posture for:
  - proof-of-possession
  - attestation/storage mode
  - package trust state
  - rollout gates
  - parser capability level

### 6. Security and governance

- Added cryptographic device enrollment and proof-of-possession using Ed25519.
- Added shared-secret compatibility helpers for controlled migration flows.
- Added device identity init, read, and rotate lifecycle.
- Added OS-protected secret storage support where available, including keychain/DPAPI-backed paths.
- Added attestation evidence ingestion from external helpers and explicit broker posture reporting.
- Added device disable/offboarding actions and cleanup planning.
- Added signed update verification helpers and stricter release-time trust handling.
- Added audit hooks and cleanup planning for package caches and derived stores.

### 7. Rollout and release discipline

- Added rollout-gate evaluation and managed-phase blocking.
- Added help docs and migration messaging for managed mode.
- Added release workflow gating so desktop release builds must pass Desktop Host hardening suites before artifacts are produced.

## User Impact

For standard users:

- Desktop feels more like part of SmartAIHub, not a separate power-user shell.
- Local file access is more explainable and more governable.
- Device and package posture are easier to understand in Settings.

For admins:

- Desktop devices can be found from the web UI more easily instead of being hidden behind deep settings paths.
- Desktop devices can be reviewed with owner identity, last-seen posture, access state, and policy context in one place.
- Desktop devices can be reviewed, disabled, quarantined, forced to re-auth, and governed more clearly.
- Managed rollout has explicit gates instead of relying on informal readiness.
- Package trust, signed updates, and offboarding are much more concrete.

For developers:

- Desktop Host now has a clearer contract surface.
- Runtime selection rules are less ambiguous.
- Release-time checks are stronger and closer to the real managed product posture.

## Verification

Targeted web and Tauri test suites were added and passed for:

- shared Desktop Host contracts
- Settings and governance UI
- device registry and route behavior
- device identity and secret storage
- attestation support reporting
- local file parser behavior
- runtime capability reporting

The section package for Feature 075 also passes completeness checks at `8/8`.

## Current Limitations

This feature is now much more complete, but a few hardening gaps still remain.

### Device identity limitations

- There is still no universal native hardware-backed or platform-attested key broker across every supported OS.
- Some attestation posture still depends on helper mediation or platform hints rather than a single built-in cross-platform attestation layer.

### Rich-document limitations

- Rich-document parsing is bounded and much stronger than before, but it is not yet a full deep-document analysis stack.
- Basic macro detection, embedded-media counting, and layout posture are available, but not full macro analysis or full embedded-content extraction.
- Advanced structural OCR/rendering for very complex files is still limited.

### Delivery limitations

- Work is implemented and verified in the repo, but it remains uncommitted in this working tree because unrelated dirty changes already existed and should not be mixed together automatically.

## Recommended Next Steps

### Near-term

- Add a universal platform-native attestation broker strategy per OS.
- Deepen document analysis for complex PDF and Office files.
- Add richer embedded-content extraction and more advanced OCR/layout recovery.

### Mid-term

- Add stronger release automation around desktop trust-chain artifacts and post-build validation.
- Add more device-health diagnostics and remediation guidance in the admin UI.
- Extend parser/reporting surfaces into richer run-detail and support workflows.

### Long-term

- Move from helper-assisted attestation posture to stronger native platform-backed identity where feasible.
- Expand desktop hardening from “bounded and governed” to “high-assurance by default” across all supported platforms.

## Final Takeaway

Feature 075 is no longer just an architecture idea.

It now has a concrete implementation slice across web, desktop, security, packaging, UX, rollout, and release validation.

The most important outcome is that SmartAIHub now has a credible path to ship a unified managed web + desktop agent platform with strong local power and much better enterprise controls than the old desktop model.
