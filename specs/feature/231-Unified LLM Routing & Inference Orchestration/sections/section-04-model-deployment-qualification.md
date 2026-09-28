# Section 04 — Model and deployment qualification

## Goal

Route on immutable logical model profiles and qualified provider deployments rather than mutable provider-native aliases.

## Implementation

1. Extend the existing model catalog and provider map with stable profile/deployment revisions, provider account owner, endpoint surface, allowed regions, retention/ZDR, capabilities, price snapshot/FX source and certification evidence.
2. Define qualification probes for actual streaming, schema/tool, modality, context, reasoning and usage/model attribution behavior.
3. Make stale catalog values, unknown price, unsupported surface, unhealthy deployment and alias drift ineligible for AUTO.
4. Retain manual-only/internal-only/deferred model handling from the existing catalog.
5. Keep provider-native IDs behind the route adapter; callers refer to logical IDs.

The qualification evaluator requires successful baseline request/response,
context/output-limit, region/retention, and credential-ownership checks for every
deployment. It requires streaming, tool continuation, strict-schema, reasoning,
multimodal, and cross-surface parity probes only when the model profile declares
the corresponding feature, modality, tool contract, or parity capability. Every
required check still needs current `live_probe` evidence; capability metadata
alone cannot satisfy a probe.

## Tests first

- Catalog schema and immutable revision tests.
- Probe freshness, fail-closed qualification, capability mismatch and mutable alias drift.
- Tenant ZDR/residency filters and unknown-pricing rejection.

## Acceptance

- Every eligible AUTO route has current qualification, immutable model/deployment identity and pricing evidence.
- Staging probe records use redacted synthetic prompts and scoped credentials.
- Source-level capability metadata never counts as a live provider probe.

## Current implementation gap

The Admin offers connectivity and capability probes. The capability suite tests basic response, the candidate's declared context window and maximum output, strict JSON Schema, reasoning usage attribution and exact credential-to-provider-map binding against the pinned candidate. Context evidence requires provider-reported input usage near the declared context boundary, both start/end sentinels, and enough remaining room for the declared output. Maximum-output evidence requires a synthetic generation to reach exactly the declared cap with no reported overshoot. A conservative cost estimate uses the higher of current billing-map/catalog pricing and the candidate's price snapshot; the default per-run ceiling is USD 0.25, configurable through `INFERENCE_CAPABILITY_PROBE_MAX_COST_USD_MICROS`, with hard request limits of 2,000,000 input characters and 65,536 output tokens. A skipped or unmeasured limit check keeps the candidate ineligible. These price estimates are not invoice evidence. For declared tool capability on Chat Completions, the suite validates two distinct parallel call IDs/names/arguments and one continuation round trip returning both tool results. This synthetic fixture does not certify each model-declared tool contract. Evidence is immutable, redacted and target-bound.

Runtime registry loading now rejects any active profile without a server-owned immutable certification record and matching immutable `capability_suite` receipt in PostgreSQL. The receipt must match the exact profile version, model/deployment revisions, provider-map IDs, probe suite, observation time, evidence reference, check values and declared capability references. Candidate publication cannot set active lifecycle or live-probe state. The Admin certification action reads only the latest suite for the current candidate head, requires a passed and fresh receipt, checks every policy-required probe and capability reference, and then writes an immutable certified projection and moves the active head in one transaction. An incomplete or mismatched receipt leaves both heads unchanged. The local probe implementation can now measure declared context/output limits within its configured caps, but live provider behavior has not been tested; region/retention, stream cancellation, multimodal and cross-surface gates remain unavailable, so candidates missing those proofs cannot be certified or enter AUTO.

Immediately before provider I/O, runtime resolution now recomputes the binding fingerprint from the current provider-map row, base URL, effective probe price and encrypted credential ciphertext and compares it with the value in the matching capability receipt. A rotated credential, changed endpoint or price change is rejected as `RUNTIME_PROBE_BINDING_MISMATCH` until the deployment is probed and qualified again. The hash never includes raw credentials in a returned value or log.

## UI/UX Contract

### Target User / JTBD
Admins can promote a provider candidate into the active registry only after the latest provider evidence satisfies every required qualification check.

### Existing Pattern Reference
N/A — no UI surface is added or redesigned in this change.

### Surface Inventory
The existing Admin LLM Providers inference panel adds a certification action to candidate probe rows and a read-only list of certified active profiles with their evidence references. Certification appears only when the latest capability-suite receipt reports `passed`; the server remains authoritative and rejects expired or mismatched evidence.

### Component Map
`AdminInferencePolicyPanel` invokes the admin-only certification mutation and refreshes candidate and active-profile queries after the result. Active profile rows expose model, provider, region and evidence reference, never credentials.

### State Matrix
No passed suite: hide certification. Passed suite: show a busy action while checking. Success: show an active-registry message. Stale, incomplete or mismatched evidence: keep the candidate and show a blocked message. Mutation failure: show a generic error.

### Responsive Matrix
N/A — no layout changes.

### Accessibility Acceptance
N/A — no UI changes.

### Visual Direction and Tokens
N/A — no UI changes.

### Copy Contract
Certification copy distinguishes a probe pass from profile activation and says required evidence must match the current candidate.

### Browser Evidence Required
Browser verification must confirm hidden/visible certification states and refresh behavior. Current proof is Vitest/jsdom only.
