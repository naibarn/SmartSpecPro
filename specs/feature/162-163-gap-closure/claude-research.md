# Gap Closure Research

## Codebase research

SocratiCode MCP was unavailable in this runtime, so the research used targeted
symbol/file inspection. The current implementation already contains shared
media contracts, a Worker Control Plane route, native media execution, a
minimal MCP stdio client, `VerticalDramaStoryboardPanel`, `SeriesWorkspacePanel`,
and a route registry. The audit confirmed the missing links are real:

- `workerSeriesControlPlane.ts` admits Worker jobs, but browser storyboard code
  does not create `shot_video_generation` jobs.
- `verticalDramaSeriesAccessService.ts` resolves only the registered owner and
  does not return per-action capabilities.
- Worker heartbeat metadata advertises an empty workflow list and MCP checks
  only the tool name, not its JSON Schema or protocol capability.
- `media_pipeline.rs` performs probe/basic FFmpeg operations but does not emit
  scene, visual-quality, or subject-track evidence and the UI submits one file
  at a time.
- `WorkerAppShell.tsx` filters to the legacy five tabs; route IDs for the new
  screens are aliases rather than mounted canonical screens.

## External research

- ComfyUI's official server documentation describes `/prompt` admission,
  `/history/{prompt_id}`, queue/interrupt, `/system_stats`, and WebSocket
  execution progress. The Worker must keep those details behind its MCP
  adapter and persist a remote execution ID for reconciliation:
  https://docs.comfy.org/development/comfyui-server/comms_routes
- ComfyUI's official documentation states workflows are API-format graphs and
  execution returns a prompt/job ID that can be monitored and later resolved to
  outputs. This supports a typed registry boundary rather than accepting raw
  browser graphs:
  https://docs.comfy.org/development/cloud/overview
- MCP's official tools specification requires each advertised tool to include a
  valid JSON Schema input definition and supports deterministic `tools/list`
  discovery:
  https://modelcontextprotocol.io/specification/draft/server/tools
- The official MCP July 2026 update describes a newer stateless protocol that
  retires the old initialize/session exchange. The client therefore needs an
  adaptive negotiation path: accept the current protocol and retain a legacy
  initialize path for installed beta servers:
  https://blog.modelcontextprotocol.io/posts/2026-07-28/

## Testing research

The repository uses Vitest for Web/shared tests, TypeScript `tsc --noEmit` for
Web and Worker, and Rust `cargo test --lib` for native Worker behavior. Existing
tests are suitable for contract and service seams; browser evidence must be
added separately for storyboard and Worker route workflows. Schema changes use
hand-authored additive Drizzle SQL in this lineage and must be serialized by
the conductor.

## Decisions from research

1. Use a server-generated typed shot request and immutable workflow resolution;
   never expose Comfy API-format graphs to the browser.
2. Support both current/stateless MCP negotiation and legacy initialize-based
   beta servers, but advertise a lane only after the required tool schema is
   validated.
3. Treat local visual analysis as evidence for an editable plan. Automatic
   decisions remain policy/user-controlled and are never inferred solely from
   a fixed center crop.
