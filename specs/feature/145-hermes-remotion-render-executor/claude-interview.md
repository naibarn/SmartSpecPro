# Deep-plan Interview Transcript

## Interview mode

No additional stakeholder round was required. The user explicitly instructed
the agent to follow the recommended deep-plan workflow and continue at length.
The preceding conversation already establishes the business constraints: remove
the need to build the Worker App/Xcode on macOS, support Windows 11 and macOS
rendering, make Hermes MCP access complete for supported manual operations,
preserve Worker App upload/auth parity, support authorized Library/R2/media-history
downloads, and close all security gaps.

## Q1 — What is the primary outcome?

**Answer (from user requirements):** Hermes Agents must be able to request and
monitor supported image/video and Remotion work through MCP, while a standalone
executor performs Remotion rendering on Windows 11 or macOS. The result must be
published and downloadable with the same authorization and artifact semantics as
the existing Worker App path.

## Q2 — Is macOS expected to require another Xcode/Tauri build?

**Answer:** No. The supported solution is a standalone Node executor/runtime.
Tauri/Worker App remains a compatible legacy path, but the new executor must be
installable and runnable without building the Worker App through Xcode. Release
signing/notarization may be handled separately from runtime implementation.

## Q3 — What does “complete MCP functionality” mean?

**Answer:** Complete means every operation published by the server-owned Hermes
capability manifest: capability/manual usage discovery, connection authorize/
status/probe/disconnect, supported image/video generation and references, status,
cancel, result retrieval, and authorized Library/media-history downloads. It does
not mean arbitrary CLI command or shell execution.

## Q4 — What security and data boundaries are mandatory?

**Answer:** MCP identity, Hermes provider identity, worker identity, and executor
identity remain separate. Authentication must be equivalent to the current Worker
App control-plane protections; tenant/user ownership and scopes are checked on
every operation; raw R2 keys, signed URLs, credentials, refresh tokens, device
secrets, and local paths are never exposed. Every file/media-history download must
use canonical ACL evaluation and an opaque short-lived reference.

## Auto-Decisions

1. Use the existing worker REST control plane for executor registration, claim,
   heartbeat, progress, artifact init/upload/complete, and terminal reconciliation.
2. Use MCP only as the Hermes/user-facing control surface; do not use MCP for
   binary transfer or worker heartbeat traffic.
3. Reuse `@smartspec/remotion-render` and the existing `remotion_render_video`
   contract; do not create a parallel render job type.
4. Use PostgreSQL/R2 for durable jobs, media, artifacts, billing, and ownership.
   Use Redis only for bounded ephemeral coordination with explicit TTLs and outage
   behavior; do not store media bytes or full durable payloads in Redis.
5. Add a dedicated default-off feature flag and a separate runtime identity so
   `hermes_agent_gateway` does not become a general renderer.
6. Treat Windows native x64 and macOS arm64/x64 as mandatory first-release proof
   targets; treat WSL2 as a separate compatibility pack with separate proof.
7. Resolve technical ambiguity in the implementation plan using existing codebase
   patterns. Do not block deep-plan on another approval round because the user has
   already asked to continue autonomously.

## Q5 — Which Hermes installations are in scope?

**Answer (from user requirements):** Support standalone Hermes CLI/agent and
Hermes One on Windows and macOS. The Connector should detect an existing usable
installation, adopt it without modifying it, and automatically provision any
missing/incompatible managed component from a signed pack.

## Q6 — How should connection and media return work?

**Answer (confirmed direction):** A single browser approval creates separate
worker and MCP agent credential lineages. Hermes uses the remote SmartAIHub MCP
endpoint through a credential broker, while rendering uses the existing Worker
REST data plane. Generated images and videos must pass the same upload validation,
publication, billing, media-history/Library registration, ACL and download path as
web/manual generation; no token, raw R2 key, provider URL or binary is returned
through MCP.
