# Implementation review round 3 — admission, execution, and recovery

Scope: job type routing, capability matching, lease events, output handling,
publication, and the local execution ledger.

Findings and closure:

- Added the dedicated `comfy_video_generation` progress/failure contract and
  generic MCP admission for image, video, and workflow-run dispatches.
- MCP queue input is validated before persistence, gets the Comfy capability
  families, and remains behind the existing tenant feature gate, billing, and
  idempotency path.
- Worker claims advertise MCP/image/video/workflow families only when the MCP
  readiness path is available; legacy REST remains compatibility-only.
- Execution records are atomically written for claimed, collected, saved,
  published, and failure paths. Artifact upload remains checksum-bound and
  lease-bound.
- Start/reference frame references remain IDs/revisions/fingerprints; no local
  path is accepted through the server envelope.

Proof: focused Web scheduler/registry tests and Rust Comfy tests passed. The
existing repository-wide schema/type baseline remains separately reported.
