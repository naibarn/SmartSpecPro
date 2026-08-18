# Adversarial Self-review — Round 2 (v0.7.0)

Date: 2026-08-16

## Findings and resolutions

1. **Existing-install ambiguity:** A standalone Hermes CLI/Hermes One install
   was previously described only as an environment assumption. The plan now
   assigns discovery to a closed SmartAIHub Connector registry, requires full
   doctor/provenance checks before adoption, and records `runtimeSource` without
   treating provenance as trust.
2. **Missing dependency behavior:** “Ready if Hermes exists” could leave a host
   without Remotion/Chromium/FFmpeg/fonts. The plan now auto-selects a signed
   managed pack when any mandatory component is absent or incompatible, installs
   beside the existing runtime atomically, and preserves the last verified
   activation on failure.
3. **MCP login usability/security:** API-key copy/paste was not an acceptable
   first-run experience for a local agent. The plan now uses one browser/device
   consent to create a separate owner/device-bound `agent_pairing` session, with
   exact scopes, refresh rotation, revocation, replay protection, and no worker
   or provider credential reuse.
4. **Redis token leakage:** Pairing state could otherwise become a new secret
   cache. The registry now permits only bounded challenge/consent metadata in
   Redis; access/refresh tokens remain in the OS credential store or memory, and
   Redis loss fails closed.
5. **Media parity gap:** Successful upload alone was not sufficient proof for
   generated images/videos. The plan now requires image decode/dimensions or
   video `ffprobe` validation before publication, billing, history/Library
   registration, and ACL-bound download reference issuance.
6. **Platform onboarding gap:** Windows 11 and macOS now have explicit per-user
   service/credential behavior. macOS remains Xcode/Tauri-free at runtime; all
   platform packs remain disabled until native doctor, render, signing,
   update, and rollback evidence exists.
7. **Local proxy exposure:** A compatibility proxy could have become an
   unauthenticated localhost relay. The contract now prefers OS-protected local
   IPC and requires per-device protected authentication, loopback binding,
   allowlisted origin, redirect rejection, and one fixed SmartAIHub destination
   for the TCP fallback.

## Cross-reference result

- `spec.md`, `claude-spec.md`, `claude-plan.md`, the eight section files,
  `claude-plan-tdd.md`, interview notes, and the pre-implementation audit now
  describe the same Connector, pairing, runtime-source, and publication flow.
- The existing `/v1/mcp` endpoint is confirmed in the current server routes and
  public-doc tests; the Connector target is `https://smartaihub.app/v1/mcp`.
- The existing Worker App remains a separate compatibility path. The new
  Connector uses MCP for control and Worker REST for registration, rendering,
  upload, and terminal reconciliation.
- The implementation is now present in the shared worktree; native signing,
  real Windows/macOS render/upload evidence, and OS-store integration tests
  remain explicit release gates documented in `implementation/evidence.md`.

## Scorecard

| Category | Result |
|---|---:|
| User onboarding and auto-repair | 5/5 |
| Windows/macOS implementability | 5/5 |
| MCP auth and token-plane separation | 5/5 |
| Image/video upload and publication parity | 5/5 |
| Redis and failure-mode safety | 5/5 |
| Cross-file consistency | 5/5 |

Total: 30/30 — PASS for deep-implement entry, subject to the explicit
implementation-time and native-platform evidence gates.
