# `sprintf-js` remediation decision — updated 2026-10-10

## Original finding

The prior #405 production graph contained `apps/web > hyperframes@0.7.109 > onnxruntime-node@1.21.1 > global-agent@3.0.0 > roarr@2.15.4 > sprintf-js@1.1.3`, GHSA-hp3w-g68c-fv3c (Moderate; affected `<=1.1.3`; advisory lists no patched version). The application has no direct `sprintf-js` import. External input reachability through ONNX's proxy logger was not proven.

## Application dependency remediation candidate

Updated both `hyperframes` and `@hyperframes/producer` to `0.8.143`, with a regenerated lockfile. The installed application dependency graph no longer contains `onnxruntime-node` or the vulnerable `global-agent/roarr/sprintf-js` chain. Candidate `pnpm audit --prod` passed with no known vulnerabilities. Four focused HyperFrames suites passed 44/44, and the official Linux CLI render fixture passed. See `evidence/hyperframes-08143-linux-candidate-20261010.md`.

No audit suppression, threshold change, vulnerable downgrade, or package override was used.

## Residuals and limits

- HyperFrames CLI 0.8.143 retains an optional on-device search/background-removal path that dynamically installs `onnxruntime-node@1.21.1` on first use. No SmartSpecPro callsite of those features was found in inspected integration code; reachability is not exhaustively proven.
- The separately versioned/signed WSL2 runtime manifest remains at HyperFrames 0.7.5 with ONNX artifacts. This candidate does not update that bundle.
- Linux ONNX native loading/inference, Windows native, WSL2, GPU, and production target are NOT_TESTED.

## Status / required authority

The application graph remediation is an exact-head CI candidate, not overall WorkUnit completion. Run required #405 exact-SHA compatibility and production audit CI. Keep the PR and WorkUnit open until CI passes and the accountable Security plus Media/Runtime owner records whether the residual dynamic optional path and signed WSL2 bundle are in scope, with an approved compatibility/rebuild plan or explicit scoped risk disposition. No self-approval or production enablement is implied.
