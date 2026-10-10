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

## Decision package for accountable owners — 2026-10-10

This section is a proposal and evidence summary for review. It records no approval,
waiver, or change to the existing mandatory audit policy. The repository owner may
manage PR state and merge mechanics; that role alone does not establish authority
to accept security risk or certify Media/Runtime compatibility. The existing
WorkUnit requires disposition from the accountable Security and Media/Runtime
owners before closure while these residual paths remain unresolved.

### A. SmartSpecPro application runtime (HyperFrames 0.8.143)

- **Exposure:** The production dependency graph at PR #405 head
  `16633e89c89a5f93c9330dd86d87828c37d2bf4a` resolves HyperFrames 0.8.143 and
  no `onnxruntime-node` / `global-agent` / `roarr` / `sprintf-js@1.1.3` chain.
  Feature access defaults off. This is the application graph, not a claim that
  every separately shipped runtime artifact is clean.
- **Exploitability evidence:** The former transitive chain was reachable from
  HyperFrames 0.7.109; no direct app import was found and untrusted-input
  reachability through ONNX proxy logging was not demonstrated. Reachability is
  not a prerequisite for removing a known vulnerable production dependency.
- **Mitigation / verification:** Keep 0.8.143 and the regenerated lockfile;
  do not suppress the advisory or downgrade. Exact PR head production audit and
  compatibility CI passed (run `38036383876`). Linux render evidence at
  `9355ad930c321f1213fe61c607b8f0cfdd6fb93d` covers the same package/lockfile
  bytes as the PR head, with 48 frames and video+audio output; see the linked
  evidence file. Windows/WSL2/GPU/production are not covered by that evidence.
- **Compatibility requirements:** Existing app render/export paths must remain
  functional under the supported Linux target; the exact-head compatibility
  suite remains mandatory. Do not claim native ONNX inference compatibility.
- **Proposed disposition:** Accept this app dependency remediation as the
  mandatory production-audit fix, subject to the existing owners confirming
  whether independent CLI and WSL2 residuals are in the scope of this gate.
  This is not a risk waiver for those residuals.
- **Rollback:** Revert the HyperFrames dependency and lockfile commit only if
  render/export regression is confirmed; first keep the feature disabled and
  restore the prior package only as an emergency code rollback, with the known
  audit finding reopened. Never restore the vulnerable version as a security
  resolution.
- **Approval authority:** Security owner confirms audit scope and residual
  treatment; Media/Runtime owner confirms supported app runtime compatibility.
  Repository admin can perform normal PR workflow but cannot substitute for
  either risk/compatibility decision without a policy delegation explicitly
  granting that authority.

### B. Optional HyperFrames CLI ONNX functionality

- **Exposure:** CLI 0.8.143 dynamically installs `onnxruntime-node@1.21.1` only
  when optional on-device search/background-removal functionality is invoked.
  SmartSpecPro app integration search found no such callsite; this does not prove
  that maintainers or users cannot invoke the CLI feature independently.
- **Exploitability evidence:** The package version is in the advisory's affected
  range and reintroduces the known vulnerable dependency chain when installed.
  Exploitation through attacker-controlled input has not been demonstrated.
- **Mitigation:** Prefer removal/isolation of the optional installer from the
  supported product path, or upgrade it only after an upstream-compatible
  patched release exists. Keep the app default-off feature flags and do not
  execute an optional installer in production. No audit suppression is proposed.
- **Compatibility requirements:** If CLI ONNX functionality is supported, test
  installation, model download integrity, inference, cleanup, and Linux/Windows
  behavior against the declared CLI contract. If it is unsupported by the
  product, document the supported path/packaging boundary and ensure the app
  cannot invoke it.
- **Proposed disposition:** Treat as independently releasable residual only if
  the Security owner confirms it is outside mandatory production dependency
  scope and the Media/Runtime owner confirms it is not part of a supported
  runtime path. Until those decisions are recorded, retain the WorkUnit's
  existing blocker; do not self-classify it as optional for policy purposes.
- **Rollback:** Disable or remove the optional invocation/installation path;
  retain 0.8.143 app rendering. Re-enabling requires fresh dependency audit and
  compatibility evidence.
- **Approval authority:** Security owner for vulnerability scope/risk;
  Media/Runtime owner for CLI support contract. Repository admin alone is not
  sufficient evidence of either approval.

### C. Signed WSL2 runtime pack (currently HyperFrames 0.7.5 + ONNX artifacts)

- **Exposure:** Signed runtime manifests are shipped under the worker runtime
  pack and public WSL2 release artifacts. The runtime validator checks required
  paths and manifest signature/checksum. This is an actual supported distribution
  surface; signature validation establishes artifact integrity, not dependency
  safety or compatibility.
- **Exploitability evidence:** The pack includes ONNX artifacts and is pinned to
  HyperFrames 0.7.5. Its dependency-level exposure must be established from the
  exact signed artifact contents; Linux app audit and render evidence do not
  establish WSL2 safety. No WSL2/GPU exploitability or inference test is present.
- **Mitigation:** Rebuild the pack from a reviewed dependency set, regenerate
  checksums/signature with the authorized signing process, and verify install,
  signature rejection on tampering, startup, and representative inference on an
  authorized Windows/WSL2 runner. Do not replace or re-sign a public artifact
  from this session.
- **Compatibility requirements:** Preserve the declared WSL2/Windows/GPU support
  contract, model/runtime ABI, pack manifest schema, signature trust chain,
  rollback compatibility, and install/upgrade behavior. Require the Media/Runtime
  owner to define supported hardware/driver matrix and acceptance fixture.
- **Proposed disposition:** Keep rebuild/verify as an explicit residual work
  item. It can be independently released only if owners establish that the
  signed WSL2 pack is outside this PR's mandatory security scope and that
  existing supported consumers remain safely served. Current evidence does not
  justify that conclusion.
- **Rollback:** Retain the previous signed artifact and manifest as a versioned
  rollback target. Roll back only through the existing authenticated signing and
  release process; never mutate the active artifact or trust metadata in place.
- **Approval authority:** Security owner decides security scope and acceptable
  exposure; Media/Runtime owner approves compatibility matrix and pack rebuild;
  release/signing authority controls artifact publication. A repository admin
  cannot impersonate the signing or risk-acceptance authority.

### Minimum decision needed to unblock #405

The Security owner and Media/Runtime owner must record one of these outcomes for
B and C: (1) include in this change, with named remediation/test plan and owners;
(2) explicitly establish that a path is outside supported/mandatory scope with
supporting runtime-usage evidence; or (3) approve a narrowly scoped risk
exception if existing policy permits it. Option 3 is not proposed as a default
and cannot replace mandatory gates. For C, artifact publication additionally
requires the existing signing/release authority. Until these decisions are
recorded, #405 remains Draft even though GitHub reports `MERGEABLE` and its
current audit/compatibility checks pass.
