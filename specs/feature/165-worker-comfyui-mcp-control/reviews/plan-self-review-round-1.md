# Plan self-review round 1 — implementation anchors

Status: PASS after fixes.

- Found a vague transport-module instruction and replaced it with the concrete
  Rust ownership files `comfy_profiles.rs`, `comfy_mcp_transport.rs`,
  `comfy_ssh_tunnel.rs`, and `comfy_execution_ledger.rs`.
- Found a vague Series UI instruction and anchored it to the existing Drama
  pages/components and the existing worker media policy seam.
- No implementation section is left without an owner or exit criterion.
