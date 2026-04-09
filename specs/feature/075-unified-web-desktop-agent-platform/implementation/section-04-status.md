# Section 04 status

- Status: implemented, uncommitted
- Completed this round:
  - deterministic desktop runtime routing with truthful locality labels
  - Pi sidecar/RPC-first session planning
  - HTTP-first / MCP-second policy bridge validation
  - fail-closed package materialization contract for Pi
- Targeted tests passed:
  - `npm --prefix apps/web test -- server/services/__tests__/desktopRunRouter.test.ts`
  - `cargo test --manifest-path apps/tauri-shell/src-tauri/Cargo.toml --test pi_runtime_tests`
