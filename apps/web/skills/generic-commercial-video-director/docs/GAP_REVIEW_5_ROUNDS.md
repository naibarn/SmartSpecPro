# Gap Review — 5 Rounds

Date: 2026-09-01  
Result: **v2 had meaningful gaps; v3 fixes them.**

## Round 1 — Schema/API contract audit

### Gaps found
- `input.schema.json` existed but did not model cast resolution, idea-expansion policy, dialogue mode, Start Frame policy, routing policy, QC thresholds, rights metadata, or detailed asset binding.
- `output.schema.json` was too permissive (`type: object` in many core fields), so invalid agent output could still pass.
- `ui.schema.json` listed sections but did not describe derived review panels, conditional UX, cast mapping, or speaker-line editing.
- No stage-specific schemas existed for specialist agents.

### Fixes
- Expanded all three required schemas.
- Added strict stage schemas for Expanded Intent, Observed Start State, Shot Plan, QC, and Repair.
- Added `skill.manifest.json` linking all contracts.
- Reduced `additionalProperties` in critical structures.

## Round 2 — Creative reasoning / short-idea audit

### Gaps found
- Idea Expansion was present, but it still lacked an explicit **Product Affordance / Interaction Model**.
- Cast resolution happened too late even though Idea Expansion depends on who is already visible in the Start Frame.
- Dialogue mapping was treated mainly as a later lock, but dialogue affects duration and shot design earlier.

### Fixes
- Added `Cast / Asset Semantic Resolution` before expansion.
- Added `Product Affordance / Interaction Model` before Idea Expansion.
- Added early `Dialogue Strategy & Speaker Mapping Draft`, followed by a later hard lock.
- Added camera intent and risk labels to the expanded action chain.

## Round 3 — Provider capability / adapter audit

### Gaps found
- Boolean capability flags were unsafe because support varies by model version, endpoint and provider tier.
- FLUX 3 was previously treated primarily as an image/keyframe model; current official information shows FLUX 3 Video supports native video/audio, image/keyframe starts, dialogue and longer clips in early access.
- Provider-specific resolution/duration constraints were oversimplified.
- Hailuo advanced controls were over-assumed rather than marked endpoint-dependent.

### Fixes
- Replaced booleans with four-state capability support: `verified`, `conditional`, `unsupported`, `unknown`.
- Added verification date and source URLs to every capability profile.
- Corrected Seedance 2.5 BytePlus, Veo 3.1, Kling 3.0, Hailuo 2.3, MiniMax H3, FLUX 3 Video, and Gemini Omni Flash 1.1 profiles.
- Added `model-capability.schema.json`, adapter base contract and runtime registry.
- Routing must fail closed for `unknown` capabilities unless explicitly enabled.

## Round 4 — Production advertising / QC audit

### Gaps found
- Product geometry/branding was a lock, but no explicit fallback existed for exact label/logo fidelity.
- Product claims/compliance were not a first-class gate.
- Native dialogue was conflated with reliable lip sync.
- QC was described but not strongly schema-controlled.

### Fixes
- Added Product / Brand Integrity Lock and post-production packshot/label compositing fallback.
- Added Claim / Compliance Gate.
- Added Audio / Lip-sync Routing as its own stage.
- Added QC thresholds in input and a typed QC report schema.
- Added `CLAIM_COMPLIANCE_FAILURE` and speaker-mapping failures to repair classification.

## Round 5 — Runtime / resumability / security audit

### Gaps found
- No explicit idempotency requirement for paid generation jobs.
- Asset ownership/tenant authorization and rights metadata were not represented in the contract.
- Version lineage and capability-profile verification were not enforceable by tests.
- No package validation script or multi-scenario fixtures.

### Fixes
- Added idempotency, resumable approvals, immutable lineage and tenant asset authorization requirements.
- Added `rightsConfirmed` and source-of-truth asset metadata.
- Added schema/package validation tests.
- Added fixtures covering shampoo, child/toy, cream, presenter phone, and multi-character dialogue use cases.

## Conclusion

The required three files should remain in the Skill package, but production quality requires more than those three. The v3 package therefore treats them as the public contract and adds stage schemas, capability schema, manifest, adapter registry, tests, and a review report.
