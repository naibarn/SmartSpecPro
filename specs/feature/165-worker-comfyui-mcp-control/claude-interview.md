# Feature 165 Planning Interview

This planning interview records the already-confirmed product decisions from
the request and prior design review. No additional blocking question was
needed: the user explicitly asked for autonomous planning and implementation,
preservation of existing data, and immediate closure of discovered gaps.

## Q1. What is the required ComfyUI connection model?

**Answer:** Worker App must support local same-machine ComfyUI, remote/LAN
ComfyUI, SSH-tunneled ComfyUI, and ComfyUI Cloud. Multiple connections are
saved per Worker installation, one can be active, and a user can choose an
allowed alternative per job.

## Q2. Which protocol boundary is authoritative?

**Answer:** Worker App to ComfyUI must use MCP, including local stdio and
remote/Cloud Streamable HTTP where supported. SmartAIHub's authenticated
Worker control-plane for pairing, job claim/lease, progress, artifact upload,
and monitoring remains its existing authenticated HTTP/REST boundary. The
Worker must not expose a broad unauthenticated REST server.

## Q3. What must happen to permissions?

**Answer:** Permissions granted during Worker installation/pairing are shown as
already granted. Later changes can revoke or disable selected scopes/profile
capabilities, with server acknowledgement and audit evidence. Revoked scopes
must block only their affected operations; the Worker cannot self-grant a new
scope.

## Q4. What is the required job experience?

**Answer:** Image and video generation, including storyboard shot generation
with start frame, last frame, and ordered reference frames, must create
dedicated render jobs. The first eligible Worker to acquire the lease owns the
job. Worker Overview must show active job details prominently, including the
same ID/type/time/Series/Worker/progress information visible on the Web, while
new work waits visibly when the Worker is busy.

## Q5. What are the output and data-safety rules?

**Answer:** Comfy output is collected, validated, and saved to the Worker
machine first. Upload to the SmartAIHub Library is optional and must use the
existing authenticated artifact flow with a server-authorized target. Original
local footage, local paths, credentials, and secrets must not be uploaded or
logged implicitly. Existing data and legacy jobs must remain readable and
functional.

## Q6. What is the UI direction?

**Answer:** Keep the Sidebar as the primary navigation and remove duplicate
Quick Actions. Connections, Workflows, Comfy Jobs, Queue, Runtime, Series,
and Media Workspace each have one responsibility. All Worker screens and
controls support Thai/English consistently, with explicit loading, empty,
offline/stale, denied, unavailable, validation, and server-error states.

## Q7. What is the HyperFrames boundary?

**Answer:** HyperFrames is not part of the current Feature 165 capability and
must not be added as a dependency, readiness requirement, job route, or UI
default. Existing compatibility paths may remain untouched.

## Auto-Decisions

- Follow existing Rust/Tauri, TypeScript/Zod, Drizzle, tRPC, Worker lease, and
  Vitest/Cargo conventions found in the repository.
- Use additive migrations and compatibility adapters; do not rewrite or delete
  legacy settings, jobs, artifacts, or historical provenance.
- Use capability negotiation and versioned workflow registry records instead of
  hardcoding MiniMax H3 or any one provider workflow.
- Make the server authoritative for identity, tenant/Series authorization,
  job resolution, leases, permissions, billing, and publication targets.
- Make the native Worker authoritative for secrets, local paths, staged bytes,
  local output validation, and Comfy transport execution.
- Review all generated plan sections for interface, dependency, UI contract,
  and migration consistency before implementation.
