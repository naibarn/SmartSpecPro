# Feature 197 Research

## Research decision

- Codebase: required; inspect Tauri/Rust Worker App, Web worker connection routes, control-plane services and current MCP bridges.
- Web topics: Tauri command/event/websocket boundaries and local runtime security.
- Testing: focused Cargo tests plus Web Vitest/jsdom where UI is affected; no repository-wide typecheck.
- SocratiCode: unavailable; targeted shell discovery is used.

## Codebase findings

- Local runtime foundations are in `apps/worker-app/src-tauri/src/control_plane.rs`, `worker_control_plane.rs`, local MCP clients and media workspace screens.
- Web already exposes `/workers/connect` and connection-related components. Reuse its auth/session conventions for Runner identity and status.
- Feature 195 owns Job admission/lease truth; Feature 196 owns capability and policy semantics. Runner must not invent a queue or authorize itself.
- Existing local process and MCP adapters are partial; add shared identity/snapshot/control contracts without treating local process output as authoritative completion.

## External research

- Tauri commands are typed and can be async; events are asynchronous JSON delivery without return values. Use commands for request/response control and versioned events for streaming status. See https://v2.tauri.app/develop/calling-rust/.
- Tauri WebSocket functionality is platform-supported but permissions and Rust version requirements matter; keep the existing control transport if it satisfies the contract and avoid unnecessary dependency additions. See https://v2.tauri.app/plugin/websocket/.

## Planning implications

Separate durable server Job state, Runner local journal and realtime transport. Implement identity/snapshot/claim fencing before adapters, then ACK/replay/reconciliation, then user intervention and UI. Fail closed on stale snapshots and unknown process state.

