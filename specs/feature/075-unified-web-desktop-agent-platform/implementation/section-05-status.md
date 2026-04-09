# Section 05 status

- Status: implemented, uncommitted
- Completed this round:
  - Agency Swarm runtime planning with gateway-only provider posture
  - connector authorization with DLP-aware confirmation behavior
  - Pi-to-Agency handoff metadata
  - chat-surface handoff entrypoints for agencies
- Targeted tests passed:
  - `npm --prefix apps/web test -- server/services/__tests__/desktopAgencyMaterializer.test.ts`
  - `cargo test --manifest-path apps/tauri-shell/src-tauri/Cargo.toml --test agency_swarm_runtime_tests`
