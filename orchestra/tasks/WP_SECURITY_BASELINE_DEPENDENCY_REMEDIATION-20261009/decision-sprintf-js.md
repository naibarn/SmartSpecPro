# Open remediation decision — `sprintf-js`

## Advisory and affected path

- Current exact candidate audit has one remaining advisory: GHSA-hp3w-g68c-fv3c, Moderate, installed `sprintf-js@1.1.3`.
- Audit metadata reports affected `<=1.1.3` and patched `<0.0.0`; no upstream patched release is available.
- Production path: `apps/web > hyperframes@0.7.109 > onnxruntime-node@1.21.1 > global-agent@3.0.0 > roarr@2.15.4 > sprintf-js@1.1.3`.
- The vulnerable operation accepts a caller-controlled format string and passes unbounded precision to `toFixed`, `toExponential`, and `toPrecision`. The application has no direct `sprintf-js` import. The chain is in ONNX runtime's proxy logging dependency; external input reachability through this logger has not been proven or disproven.

## Remediation alternatives examined

1. **Do not suppress the advisory.** No pnpm audit ignore, threshold change, or security-policy change was made.
2. **Update the Hyperframes patch line.** `hyperframes@0.7.111` still pins `onnxruntime-node@1.21.1`; it retains the vulnerable chain.
3. **Update ONNX Runtime.** `onnxruntime-node@1.30.0` switches to `global-agent@4.1.3`, which removes the `roarr/sprintf-js` path. The package has 301 MB unpacked size and replaces a native media runtime. The repository has no ONNX model fixture for a focused inference regression, and its packaged Hyperframes WSL2 runtime manifest would also need an exact version/artifact reconciliation. This change requires a dedicated approved runtime build/test authority and media owner acceptance; it is not a lockfile-only safe patch.
4. **Locally patch/fork `sprintf-js`.** Not applied. This adds a maintained security fork and behavior contract without upstream fix or an independently approved patch owner.

## Decision state

`WAITING_APPROVAL` / `WAITING_EXTERNAL`: require the accountable media/runtime owner and security owner to choose one of:

- authorize an isolated ONNX Runtime 1.30.0 compatibility build and exact WSL2 runtime artifact verification, then test media/Remotion paths; or
- explicitly accept the single Moderate `sprintf-js` residual risk with documented scope and expiry while leaving the full audit failing.

No approval is recorded in the repository or CI, so neither option is treated as approved. Until the decision is recorded, the WorkUnit and security PR remain open and the full production audit remains failed. The existing `pnpm audit --prod --audit-level=high` gate passes with 0 Critical/High; it does not replace the full audit.

## Evidence

- Exact candidate audit JSON: `audit-current.json`.
- Baseline package/advisory/path ledger: `advisory-ledger.md`, `advisories.json`.
- Advisory: [GitHub GHSA-hp3w-g68c-fv3c](https://github.com/advisories/GHSA-hp3w-g68c-fv3c).
- Reachability evidence and the approval-gated ONNX/WSL2 validation sequence are in `onnx-wsl2-compatibility-plan.md`.
