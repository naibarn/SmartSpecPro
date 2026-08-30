# Design: Worker App ComfyUI Control via MCP

**Date:** 2026-08-26  
**Status:** Approved for specification  
**Related feature:** Feature 165  
**Decision owner:** Worker App / Render Control Plane / Vertical Drama

## Decision

SmartAIHub will keep its authenticated Worker control plane and render-job
lease protocol as the system-of-record boundary. The Worker App will use an
MCP client adapter to control ComfyUI. The adapter will support local stdio,
self-hosted remote deployments through a colocated/remote stdio bridge or an
explicitly approved Streamable HTTP MCP endpoint, ComfyUI Cloud Streamable
HTTP, and an explicitly managed SSH-tunnel route. The UI and job payload never
call arbitrary ComfyUI endpoints directly.

This gives the product one stable job/auth/billing contract while allowing the
ComfyUI transport to evolve independently. MCP is not a replacement for the
SmartAIHub control plane and the two boundaries must not be merged:

```text
SmartAIHub Web ── authenticated Worker control plane ── Worker App
                                                        │
                                                        └─ MCP adapter ── ComfyUI
                                                           local / remote / Cloud
```

The Worker App must negotiate capabilities before exposing a workflow or
claiming a job. A connection is not considered usable because a URL or process
exists; it must pass protocol, tool, workflow, input, output, and health checks.

## Why this design

The existing Worker implementation has one loopback URL and one local stdio
command. It cannot safely represent multiple machines, Cloud authentication,
workflow versions, dynamic input schemas, output collection, or per-job
connection selection. The attached ComfyUI MCP notes and current official
documentation describe separate local and hosted MCP servers, stdio and
Streamable HTTP transports, schema discovery, job lifecycle tools, upload and
output retrieval. Those capabilities fit an adapter boundary, but the public
Cloud MCP remains beta and must be treated as a versioned, probed integration.

Official references:

- [ComfyUI MCP](https://docs.comfy.org/agent-tools/mcp)
- [Comfy-Org/comfy-mcp](https://github.com/Comfy-Org/comfy-mcp)
- [MCP transports](https://modelcontextprotocol.io/specification/2025-06-18/basic/transports)

## Decisions and constraints

1. SmartAIHub REST/control-plane APIs remain the supported Worker registration,
   heartbeat, claim, progress, artifact, and series-control boundary.
2. Worker-to-Comfy execution is MCP-primary. A direct ComfyUI REST call is not
   a product fallback. If a future adapter needs an internal HTTP call, it is
   hidden behind the MCP adapter and never receives user-supplied arbitrary
   URLs. A remote self-hosted installation is supported through a configured
   `comfy-mcp` stdio bridge (including its remote ComfyUI target) or a separately
   approved MCP HTTP server; ComfyUI itself is not assumed to expose MCP HTTP.
3. Local first-party `comfy-mcp` uses stdio. Remote and Cloud use Streamable
   HTTP only when an approved MCP endpoint advertises it. Legacy HTTP+SSE is
   compatibility-only and must be disabled unless a tested server explicitly
   advertises it.
4. Connection credentials are stored in the OS secure store on the Worker.
   Server records contain only non-secret profile metadata and a credential
   fingerprint/reference.
5. Workflow identity is `(workflowId, version, checksum)`, not a filename.
   Every job pins this identity and records the selected connection.
6. The active connection is a default, not an implicit permission bypass. A
   job may select an allowed profile explicitly; the server and Worker both
   enforce the allowed profile and workflow policy.
7. ComfyUI Cloud output URLs are temporary delivery locations. The Worker
   downloads through a validated client and stores the result in its local job
   workspace before optional Library upload.
8. Existing `comfy_image_generation`, `comfy_workflow_run`, and
   `shot_video_generation` payloads remain readable. New canonical fields are
   additive and legacy payloads resolve through a compatibility adapter.
9. HyperFrames is out of scope and must not be used as a ComfyUI readiness
   prerequisite.
10. The Worker ships a pinned MCP/runtime compatibility contract for Windows and
    macOS, uses PKCE or keychain-backed API keys for Cloud, and persists remote
    execution references so restart/lease-loss recovery never blindly resubmits.
11. Connection profiles are Worker-scoped server projections, while admin
    policy supplies global defaults/limits and Series policy supplies approved
    overrides. Profile removal is a soft revoke that preserves job provenance.

## Approval gates

- A connection can be saved without a successful test, but cannot be selected
  for production jobs until health and capability checks pass.
- A workflow can be discovered, but cannot be bound to a Series until its input
  and output schemas validate and its test/preflight succeeds.
- A shot submit action creates a SmartAIHub render-job first. The Worker never
  executes an unleased remote job from browser state.
- Automated AI mapping is opt-in and may only fill typed workflow inputs. It
  cannot select an unallowed connection, upload source footage, or invoke an
  unregistered tool.

## Open risks tracked by the feature spec

- ComfyUI Cloud MCP is beta; capability snapshots, protocol version, and tool
  contracts must be stored with each run and checked at startup.
- `comfy-mcp` packaging/licensing must be reviewed before bundling or
  redistributing it with the Windows/macOS Worker.
- Remote ComfyUI availability, GPU capacity, and output URL expiry are not
  controlled by SmartAIHub; timeout, retry, and recovery must be explicit.
