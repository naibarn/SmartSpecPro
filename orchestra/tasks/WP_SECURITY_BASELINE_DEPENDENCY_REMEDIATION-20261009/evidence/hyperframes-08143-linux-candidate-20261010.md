# HyperFrames 0.8.143 Linux candidate evidence — 2026-10-10

## Candidate

- Baseline: PR #405 head `dc86e50fef7646e16ef7265d5f2a2b758c1a2aa3`, based on canonical `96016bd2207f65e97ef89d680d294ae633ad6bad`.
- Candidate package changes: `hyperframes` and `@hyperframes/producer` both pinned to `0.8.143`; lockfile regenerated with pnpm 10.4.1. No advisory suppression or threshold change.
- Source package graph removes the installed `onnxruntime-node` package and vulnerable `global-agent > roarr > sprintf-js` path.

## Verification

- Scoped frozen workspace install (`pnpm install --filter @smartspec/web... --frozen-lockfile --ignore-scripts --network-concurrency=4 --child-concurrency=2`): PASS.
- Four HyperFrames adapter/API/dependency-audit/video-renderer suites: 44 tests PASS. The first run had one setup failure because the Remotion schema package had not been built after the scripts-disabled install; building `@smartspec/remotion-render` resolved setup and the identical suite then passed.
- Production dependency audit (`pnpm audit --prod`): PASS, no known vulnerabilities found.
- Official Linux HyperFrames CLI fixture render: PASS, 48 frames / 2 seconds, audio and video present, duration and safe-area checks passed; CLI and producer both report 0.8.143. Runtime: Linux x64, Node 22.22.3, FFmpeg available.
- Producer package smoke: import and expected render-job exports PASS; package audit PASS.
- `git diff --check`: PASS.

## Scope and residual risk

This is a Linux media-render compatibility test, not ONNX inference. HyperFrames 0.8.143 no longer declares ONNX Runtime in the installed application dependency graph, so the `sprintf-js@1.1.3` advisory is absent from the candidate production audit. However, inspection of the CLI package found an optional on-device search/background-removal path that dynamically installs `onnxruntime-node@1.21.1` on first use. No SmartSpecPro caller of those optional features was found in the searched HyperFrames integration paths. This is not proof that the optional feature is unreachable in every deployment.

The separately versioned/signed WSL2 HyperFrames runtime manifest remains at HyperFrames 0.7.5 and still contains ONNX runtime artifacts. It was not rebuilt or tested. Linux native ONNX loading/inference, Windows native, WSL2, GPU inference, production target, and signed runtime bundle are NOT_TESTED. The existing Security and Media/Runtime owner approval is still required before changing that runtime bundle or claiming platform compatibility.

## Decision

This candidate is a materially safer application package graph and passes available Linux render checks. It is suitable to update the existing PR #405 and run exact-head CI. It does not close the security WorkUnit or authorize merging while the mandatory signed WSL2 runtime and optional dynamic ONNX path have no approved disposition. Keep the WorkUnit open pending exact PR CI and a recorded owner decision on those residuals.
