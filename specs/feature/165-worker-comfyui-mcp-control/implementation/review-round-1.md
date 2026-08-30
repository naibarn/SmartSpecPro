# Implementation review round 1 — contracts and security

Scope: shared Comfy envelopes, profile projections, credential boundaries, and
MCP endpoint validation.

Findings and closure:

- Connection provenance is atomic; partial profile/permission/policy revisions
  are rejected.
- Credentials are now stored/resolved by the native OS keyring. WebView,
  server job JSON, profile projection, and diagnostics receive only an opaque
  `keychain:` reference.
- HTTP MCP rejects query/fragment/userinfo and non-allowlisted HTTP targets;
  Comfy Cloud is fixed to `https://cloud.comfy.org/mcp`.
- SSH forwarding is constrained to loopback `-L`, `-N`, strict host-key
  checking, known-hosts file, and `ExitOnForwardFailure=yes`; only one tunnel
  can be active and its temporary identity file is removed on drop.
- A queue-time MCP schema requires a workflow ID and rejects credential-shaped
  fields in tool arguments.

Proof: `npm --workspace apps/web test -- shared/__tests__/comfyControlContracts.test.ts`
and `cargo test comfy_ --manifest-path apps/worker-app/src-tauri/Cargo.toml`.
