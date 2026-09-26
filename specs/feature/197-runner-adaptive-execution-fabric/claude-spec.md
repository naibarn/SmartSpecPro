# Feature 197 Synthesized Specification

Implement the Runner/device/local execution fabric described by `spec.md` over Features 195 and 196. Establish Runner identity and capability snapshots, local resolution and claims, control commands/events, ACK/replay/reconciliation, local process safety and user intervention. Use existing Tauri/Rust/Web foundations and preserve one durable Job truth.

The implementation must support disconnect/restart/stale-snapshot/fencing cases and expose truthful Runner state to Chat and MCP/Agent sibling modules without adding Docker/OpenSandbox dispatch or a second control plane.

