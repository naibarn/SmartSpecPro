# Orchestra Plan

## Task
Run a defensive security review of the current SmartSpecPro codebase, then immediately remediate safe repo-local findings after user approval.

## Task Classification
- Scope: medium
- Risk: high
- Affected domains: web backend, Python backend, dependencies, CI/infrastructure, secrets/configuration
- Estimated file count: multi-file remediation plus audit records
- Chosen route: installed-skill-flow with Orchestra security audit and remediation waves
- Bug route: true
- Classification notes: Security-sensitive and cross-domain. Remediation is limited to changes that can be made safely in the current repository; credential rotation, git history rewriting, and infrastructure redesign remain explicit follow-ups.

## SocratiCode Preflight
- Status: active and green
- Indexed chunks: 84091
- Code graph: 5137 files, 9182 edges

## Impact And Surfaces
- directly changed files: Python Kie webhook/callback handlers, Python media pipeline, voice-agent tRPC router, package manifests/lockfile, CI workflows, `.gitignore`, audit artifacts
- dependent files/tests: Kie webhook handler tests, media pipeline sandbox tests, web typecheck, npm audit
- risk-sensitive surfaces: webhook authentication, SSRF controls, sensitive logging/storage, dependency supply chain, CI supply chain, voice-agent abuse controls
- confidence level: high for tested repo-local fixes, medium for dependency audit residuals
- unknowns: live HTTP security headers, Docker runtime behavior, external secret rotation state, git history cleanup state

## Wave Plan
- Wave 1: Inventory and automated read-only scans
- Wave 2: Specialist static review of web backend/frontend, Python backend, and supply-chain/config
- Wave 3: Integrate findings into risk register and run completion checks
- Wave 4: Apply immediate repo-local remediation
- Wave 5: Validate targeted changes and update residual backlog
