# Decision Log

## Planning depth

- Chosen depth: `standard`
- Expanded shape: `standard` with extra sectionization because the repository already contains a partially implemented gateway surface that must be reconciled with the worker-runtime plan

## Why this stayed in quick-plan scope

- the request is to add a new feature package and spec, not to redesign the whole platform roadmap
- the feature can be narrowed to one runtime family: `openclaw_gateway`
- the current repo already provides enough surrounding context for worker registration, admin UI patterns, and team integration

## Why this did not promote to full deep-plan

- the revised guideline is broad, but this package intentionally scopes itself to OpenClaw support as the next feature after 059
- unresolved questions remain, but they do not block a concrete implementation plan for registration, routing, artifacts, and admin visibility

## Locked decisions

1. Feature 071 extends Feature 059 rather than replacing it.
   - When Feature 071 conflicts with OpenClaw-specific wording in 059, Feature 071 wins.

2. OpenClaw is modeled as `runtimeType = "openclaw_gateway"`.
   - It is an external general-purpose agent runtime.
   - It is not the default local GPU/media worker.

3. Worker identity is separate from team-member identity.
   - `assistant_profiles.externalRef` remains for backwards compatibility and human-readable URIs.
   - a new nullable worker binding should be added so team members can point at a registered worker without losing loose coupling

4. Worker interoperability uses REST, not tRPC.
   - external runtimes need simple HTTP contracts

5. Communication defaults follow the revised fabric guideline.
   - outbound-only from worker to web
   - polling + lease/claim baseline
   - signed URL artifact uploads

6. OpenClaw feature scope excludes NemoClaw and HiClaw rollout.
   - runtime taxonomy should stay future-proof, but only OpenClaw is implemented here

7. Claw-family gateway support is treated as **HTTP-first** in this phase.
   - `/v1/chat/completions`, `/v1/responses`, `/v1/models`, and `/v1/credits` form the real compatibility baseline
   - `/v1/mcp` is additive and must not be used to overstate parity

8. Placeholder MCP LLM tools are not acceptable as a shipped compatibility claim.
   - the implementation must either:
     - make `smartspec.llm.chat`, `smartspec.llm.embed`, and `smartspec.llm.models` real
     - or remove/hide them from discovery until later

9. Tenant identity must remain explicit across gateway routes.
   - `tenantId = "default"` is not acceptable as the long-term identity path for external API-key/bearer Claw callers

10. Public docs are part of the deliverable, not a postscript.
    - if the gateway is positioned for Claw-family runtimes, the docs and test suite must publish only what is actually supported

11. `openClawExternalRuntime` must default to disabled.
    - worker-runtime rollout stays fail-closed
    - implementation must decide explicitly whether DB-backed tenant checks are sufficient or whether Redis sync is required for fast route guards

## Risks that could still trigger later expansion

- if implementation adds Desktop + ZeroClaw provisioning in the same effort, scope would become a broader worker-fabric project
- if product requires fully collaborative HiClaw orchestration in the same phase, this feature would no longer be isolated enough
- if OpenClaw session semantics require a brand-new workflow model instead of extending typed jobs plus capability routing, more planning depth may be needed

## Self-review rounds

### Round 1

- Check: scope completeness
- Fix: added explicit supersession rule versus Feature 059 so implementers know which OpenClaw wording is authoritative

### Round 2

- Check: security and trust boundaries
- Fix: clarified outbound-only communication, short-lived tokens, admin-only dashboard visibility, and signed upload baseline

### Round 3

- Check: current-codebase fit
- Fix: added explicit bridge from `assistant_profiles.externalRef` to a new canonical worker binding instead of assuming a clean-slate team model

### Round 4

- Check: rollout and backward compatibility
- Fix: preserved unresolved external connectors as a supported state so current team flows do not break during migration

### Round 5

- Check: naming consistency
- Fix: standardized on `openclaw_gateway`, `runtime profile`, `worker policy`, and `external runtime` terminology across the package

### Round 6

- Check: hidden integration risks
- Fix: promoted the gateway compatibility problem into a first-class planning concern instead of leaving it as an afterthought in review notes

### Round 7

- Check: remaining contradictions
- Fix: locked the rule that MCP discovery cannot advertise placeholder LLM parity and that tenant normalization must be explicit on `/v1/responses`

### Round 8

- Check: plan completeness after gateway review
- Fix: expanded the plan to separate HTTP gateway work, MCP work, scheduler/billing work, and rollout/regression work into distinct implementation sections

### Round 9

- Check: remaining contradictions after section expansion
- Result: no meaningful auto-fix identified

### Round 10

- Check: obvious missing improvement
- Result: no meaningful auto-fix identified
