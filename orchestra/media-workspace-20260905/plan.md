# Worker Media workspace review and repair
Authorization: user requests at least five review rounds and immediate safe fixes.
Mode: standard light, direct conductor; preserve pre-existing dirty work.
Discovery: SocratiCode unavailable (no exposed codebase tools); bounded shell fallback.
Design: repair existing contracts and state boundaries, validate project imports, isolate untrusted overlays, prevent mock/unsupported outputs from being presented as real. No new provider calls, DB mutations, dependencies or release.
Rounds: 1 persistence/IPC; 2 timeline mathematics/export; 3 async/resource lifecycle; 4 untrusted content and incomplete features; 5 regression/build/impact review. Additional convergence review after fixes.
Evidence: baseline Worker typecheck passes; save/export Rust return String, client expects object; export parameter names disagree. Data state for these deterministic contract errors: source definitions verified; runtime invocation mocked in regressions.
Proof: focused Vitest with mocked Tauri/DOM, pure project tests, Worker typecheck and production build. Desktop hardware/provider/Windows installer proof separate.
