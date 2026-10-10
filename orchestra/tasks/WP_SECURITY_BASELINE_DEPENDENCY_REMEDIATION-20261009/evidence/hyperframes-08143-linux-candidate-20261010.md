# HyperFrames 0.8.143 Linux candidate evidence — 2026-10-10

## Exact candidate

- PR #405 code SHA tested: `9355ad930c321f1213fe61c607b8f0cfdd6fb93d` (PR head at test time), based on `origin/main` `e6d33045f0b954444349213d5de88b941a9c5167`.
- `apps/web/package.json` pins both `hyperframes` and `@hyperframes/producer` to `0.8.143`. The frozen lockfile resolves both to `0.8.143`; its HyperFrames component packages resolve to `0.8.144`. The production application lock graph at this SHA contains no `onnxruntime-node` package or `global-agent > roarr > sprintf-js` path.
- Correction to the earlier record: `dc86e50fef7646e16ef7265d5f2a2b758c1a2aa3` predates the package update and still has HyperFrames `0.7.109`. Do not use that SHA as evidence for the updated dependency graph. The update commit is `dd44bfb86b3c568e6358cdc74d372c91bcb100a0`; exact-current-SHA render evidence is below.

## Exact-SHA verification

- Isolated worktree: `/home/dev/worktrees/security405-linux-verify-20261010`, detached at `9355ad930c321f1213fe61c607b8f0cfdd6fb93d`.
- Runtime: Linux x64, Node `v22.22.3`, pnpm `10.4.1`, FFmpeg `7.0.2-static`.
- Install: `pnpm install --filter @smartspec/web... --frozen-lockfile --ignore-scripts --network-concurrency=4 --child-concurrency=2` — PASS; lockfile up to date, 1,560 packages reused, 0 downloaded.
- Render: from `apps/web`, `node scripts/hyperframes-fixture-render.mjs` — PASS using the official CLI. CLI and producer both reported `0.8.143`; 48 frames rendered; MP4 output hash `hf_ea035e6756a179afba2b72a93775b96a99f16e16c8b16b1e`; FFprobe found video and audio, duration exactly 2 seconds (0.25-second tolerance), and safe-area/overflow checks passed (56px inset, zero overflow).
- Exact PR CI run [38035909489](https://github.com/naibarn/SmartSpecPro/actions/runs/38035909489) on the same SHA: full `pnpm audit --prod` PASS (`No known vulnerabilities found`); dependency compatibility regressions PASS (18 files / 238 tests).
- The earlier 44-test HyperFrames suite result is retained as historical candidate evidence; the exact current SHA is covered by the compatibility CI above and the fresh official CLI render above.

## Scope and residual risk

- The Linux render verifies video/audio composition and the installed application package graph. It does not exercise ONNX inference.
- HyperFrames 0.8.143 retains an optional on-device search/background-removal path that dynamically installs `onnxruntime-node@1.21.1`. No SmartSpecPro callsite for those optional CLI features was found in the inspected integration paths; this is not an exhaustive reachability proof.
- The separately versioned/signed WSL2 runtime manifest remains at HyperFrames `0.7.5` with ONNX artifacts and was not modified. Linux ONNX loading/inference, Windows native, WSL2, GPU, production target, and signed runtime bundle remain NOT_TESTED.
- The existing Security and Media/Runtime owner disposition remains required before changing that bundle or claiming WorkUnit completion. No advisory suppression, audit-threshold change, production enablement, or approval was made.
