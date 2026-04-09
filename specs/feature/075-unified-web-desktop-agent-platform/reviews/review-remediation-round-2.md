# Review Remediation Round 2

This note records the follow-up fixes applied after a deeper completeness and security review of the Feature 075 planning package.

## Issues remediated

### 1. Pi default boundary contradiction

Problem:

- Some artifacts treated managed Pi as sidecar-first while others still preferred embedded SDK integration.

Fix:

- Locked the managed default to sidecar/RPC-first across `spec.md`, `claude-spec.md`, `claude-plan.md`, `implementation-plan.md`, `decision-log.md`, and Section 04.

### 2. Agency Swarm gateway enforcement gap

Problem:

- Agency Swarm was described as routing through gateway config, but the package did not clearly state fail-closed enforcement against unmanaged provider keys.

Fix:

- Added gateway-only managed startup rules, fail-closed behavior, and matching TDD coverage in the main spec, plan, TDD plan, and Section 05.

### 3. Device-bound credentials were still too bearer-like

Problem:

- The package required device-bound tokens but did not describe proof-of-possession, one-time bootstrap invalidation, re-key, or cloned-device handling clearly enough.

Fix:

- Added device-held key material, proof-of-possession requirements, re-key behavior, and cloned-device suspicion handling to the spec, plan, TDD plan, and Section 07.

### 4. Update trust chain lacked signer lifecycle detail

Problem:

- Signed updates were required, but signer rotation, signer revocation, and replay-resistant metadata were not consistently called out.

Fix:

- Added signer-set rotation, emergency compromised-key response, and replay-resistant update metadata expectations to the spec and plan package.

### 5. Local file derived-data lifecycle was under-specified

Problem:

- Preview/index/vector stores were introduced without enough retention and purge guidance.

Fix:

- Added lifecycle, storage-protection, and root-removal/offboarding purge expectations to the spec, plan, TDD plan, and Sections 03 and 07.

### 6. Rollout phases lacked enforceable exit gates

Problem:

- The package had sequencing but not explicit blockers for phase progression.

Fix:

- Added phase exit gates to `spec.md`, `claude-plan.md`, `claude-plan-tdd.md`, `implementation-plan.md`, and Section 08.

## Outcome

After this remediation round, the package is materially stronger because it now:

- has one consistent answer for managed Pi integration
- applies gateway-only enforcement symmetrically to Pi and Agency Swarm
- requires proof-of-possession-capable device credentials
- treats update signer lifecycle as part of the security model
- governs derived local-file stores as sensitive retained data
- blocks rollout progression until foundational controls are actually live
