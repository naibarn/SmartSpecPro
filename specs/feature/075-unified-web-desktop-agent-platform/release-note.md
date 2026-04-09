# Release Note

Feature 075 defines SmartSpecPro's next major architecture step: a unified web + desktop agent platform.

The core product decisions are:

- Web remains the control plane and universal surface.
- The existing Tauri shell becomes SmartSpecPro Desktop Host.
- Pi is the primary desktop-local interactive runtime.
- Agency Swarm is the desktop-local complex orchestration runtime.
- OpenClaw remains the external runtime family, not the default desktop-local runtime.
- Managed desktop execution is gateway-only.
- Desktop package sync, local file intelligence, device identity, approval policy, and revocation become first-class platform concerns.

This package also closes the main architectural gaps identified during review:

- it explicitly supersedes older desktop assumptions from Feature 004 where they conflict
- it reconciles Desktop Host with the existing `desktop_zeroclaw_managed` worker-runtime identity
- it adds a device enrollment/token model
- it adds a signed update trust chain
- it adds high-risk approval and provenance rules for local-unverified execution

This is an architecture and planning feature package. It does not implement the platform yet, but it makes the delivery path concrete and internally consistent.
