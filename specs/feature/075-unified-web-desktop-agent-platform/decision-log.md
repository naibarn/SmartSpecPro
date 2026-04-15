# Decision Log

## Planning depth

- Chosen depth: `promoted`
- Resulting package shape: full-plan-style feature package with sectionized implementation guidance

## Why this promoted beyond quick-plan depth

- the request is cross-team and cross-runtime: web control plane, Tauri desktop host, local file access, package lifecycle, Pi integration, Agency Swarm integration, security, and device governance
- the current repo already has partial solutions in several directions, so the main challenge is architectural unification rather than a narrow isolated feature
- trying to keep this as a 2-5 section quick plan would hide important trust, migration, and runtime-boundary decisions

## Why this is a new feature instead of an edit to 071-074

- Features 071-074 focus on the external worker fabric and delegated platform access
- the new request is broader: it defines SmartAIHub itself as a unified web + desktop product with a governed desktop-host model
- OpenClaw remains part of the story, but it is only one runtime family inside the larger platform direction

## Locked decisions

1. Feature 075 extends the current lineage instead of replacing it wholesale.
   - `004-desktop-app` remains the historical desktop baseline.
   - `070` remains the local AI / small-model baseline.
   - `071-074` remain the external worker-runtime baseline.

2. The existing Tauri shell is the desktop foundation.
   - Feature 075 does not invent another desktop product line.
   - the Tauri shell evolves into **SmartAIHub Desktop Host**

3. SmartAIHub remains one product with two surfaces.
   - web is the control plane and universal surface
   - desktop is the local execution-rich surface

4. Pi is the primary interactive local agent runtime.
   - it handles workspace-centric agent work, coding, file exploration, and custom tool orchestration

5. Agency Swarm is the complex multi-agent local orchestration runtime.
   - it is not replaced by Pi
   - it is not replaced by OpenClaw

6. Feature 070 local AI is supporting infrastructure, not the main desktop-agent runtime.
   - Gemma 4 local inference remains useful for local preprocessing, lightweight chat, and media assistance
   - it does not replace Pi or Agency Swarm for desktop-local agent execution

7. Managed mode is gateway-only for LLM access.
   - desktop may not silently fall back to direct provider keys in managed enterprise mode

8. Server-authored packages must be signed and revocable.
   - organization and built-in desktop packages are signed
   - local-unverified packages are desktop-only, clearly labeled, and excluded from server execution by default

9. Raw Tauri file and Docker commands are implementation primitives, not the product contract.
   - Feature 075 replaces them with managed roots, local-file APIs, workspace profiles, and policy-controlled mounts/egress

10. Local file intelligence belongs to the desktop host.
    - discovery and indexing happen through a consented local-file subsystem
    - Pi and Agency Swarm consume file APIs and staged attachments rather than whole-disk crawling by default

11. Device registration and offboarding are first-class control-plane concepts.
    - desktop sessions, packages, revocation freshness, and cleanup policies attach to device identity

12. OpenClaw stays supported as an external runtime family.
    - Feature 075 must integrate with the worker fabric where appropriate
    - it must not redefine OpenClaw as the default desktop-local runtime

13. Advanced local mode must be explicit and org-disableable.
    - maximum local freedom belongs on desktop, but it is still governed by policy in managed enterprise mode

14. The 004 localhost `python-backend` proxy path becomes compatibility-only.
    - Feature 075 does not rely on it as the canonical desktop-host control-plane contract
    - if any 004-era flow still needs it during migration, that dependency must be documented as temporary compatibility

15. Desktop Host may project into the worker fabric as `desktop_zeroclaw_managed`.
    - this keeps compatibility with the existing worker-runtime family
    - Pi and Agency Swarm remain internal runtime labels inside Desktop Host, not new worker-runtime enum values

16. Desktop Host is HTTP-first and MCP-second for platform access.
    - durable HTTP contracts remain the primary product truth
    - MCP remains valuable for tool/workspace semantics where it is genuinely stronger

17. High-risk approval gates are mandatory in managed mode.
    - destructive writes, connector outbound actions, unverified package execution, and privileged workspace changes cannot rely on generic "advanced mode" wording alone

18. The desktop binary and bundled runtime support chain must be signed.
    - package signing alone is insufficient for enterprise desktop trust

19. Outputs from local-unverified packages are trust-tainted by default.
    - they require explicit policy before promotion into shared verified surfaces

20. Managed Pi integration starts sidecar-first.
    - embedded Pi is not the default managed posture
    - embedded integration can be revisited only after it achieves equivalent policy and isolation guarantees

21. Managed Agency Swarm runs are gateway-only for model access.
    - unmanaged provider keys are rejected for managed runtime start

22. Device credentials must be proof-of-possession capable.
    - bearer-only desktop refresh/runtime credentials are not sufficient for the managed security model

23. Derived local-file stores need lifecycle governance.
    - preview cache, snippet cache, and index stores must support retention, purge, and offboarding cleanup

24. Desktop update trust requires signer rotation and key-compromise response.
    - signed updates alone are not sufficient if signer lifecycle cannot be managed safely

## Risks that could still trigger later expansion

- if product requires a full desktop-native publishing and package marketplace UX in the same implementation slice, this feature may need to split into additional follow-on packages
- if Pi integration proves to require a separate sidecar-management program across Windows/macOS/Linux, more platform-specific planning may be needed
- if Agency Swarm materialization needs a wholly new package/build pipeline, the package lifecycle section may need its own child feature

## Self-review rounds

### Round 1

- Check: scope fit versus existing spec lineage
- Fix: clarified that this feature sits above 070 and 071-074 rather than replacing them

### Round 2

- Check: current-codebase fit
- Fix: pulled the Tauri file, Docker, and local skill runtime realities into the research and implementation guidance instead of keeping them abstract

### Round 3

- Check: security completeness
- Fix: locked the rule that raw filesystem and Docker commands become host-internal primitives behind governed APIs

### Round 4

- Check: product truthfulness
- Fix: made Local AI explicitly secondary to Pi / Agency Swarm for desktop agent execution

### Round 5

- Check: interoperability with worker fabric
- Fix: preserved OpenClaw as an external runtime family and kept the desktop host distinct from a plain worker node

### Round 6

- Check: obvious missing improvement
- Fix: added explicit supersession, worker-runtime reconciliation, update-chain, and approval-gate decisions

### Round 7

- Check: contradiction scan
- Fix: aligned desktop-host transport and locality-label posture with the existing worker-family and Feature 070 truthfulness rules
