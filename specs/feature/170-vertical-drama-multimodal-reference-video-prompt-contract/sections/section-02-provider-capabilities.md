# Section 02 — Runtime capability profiles and provider adapters

## Objective

Map the canonical bundle to provider-native modes using runtime capability data,
not model-family/version conditionals. Every accepted/omitted label, native
field, limit, temporal guarantee, and block reason must be auditable.

## Files and boundaries

- Extend capability types and parsing in `apps/web/server/services/modelRegistry.ts`.
- Extend mode derivation in `apps/web/server/services/verticalDramaProviderRouting.ts`.
- Adapt request projection in `apps/web/server/services/mediaGenerationService.ts`.
- Reconcile `apps/web/shared/geminiOmni.ts` only after provider contract tests.
- Update `media_models.configJson` seed/template paths with declarative profiles.
- Update Python request/routing contracts in `python-backend/app/llm_proxy/models.py`,
  `kie_ai_provider.py`, and the relevant Seedance provider module.

## Capability contract

Parse profile version/source, display name, provider family, modes, accepted
modalities/roles, per-modality and total limits, payload/duration limits,
temporal preservation, transport family, and native field map. Require exact
runtime model key. Unknown/incomplete profile or transport is blocked.

Use mode classes `text_to_video`, `first_last_to_video`,
`start_plus_references`, `mixed_reference_to_video`, and `unsupported`.
Never silently convert stop to a generic reference. Preserve canonical global
order in a mapping audit when transport arrays are split by modality.

H3 keeps text, image, first/last, and multimodal-reference modes. Validate the
known audio prerequisite and runtime limits. Omni Flash 1.1 requires a contract
reconciliation: current app validation may be stale because current official
Google guidance describes simultaneous multimodal input, while multimodal input
does not by itself guarantee native stop semantics. Seedance 2.0 and 2.5 use
separate profile fixtures (published baselines 9/3/3 and 30/10/10 for
image/video/audio) and exact runtime/access-channel verification.

Register future versions using an existing transport through data/config only;
do not add version branches. Block a genuinely new transport until an adapter
exists.

## TDD-first tests

Write profile parsing, deterministic mode selection, H3, Omni reconciliation,
Seedance 2.0/2.5 limits, synthetic future-version registration, unknown-profile
failure, role/limit rejection, canonical-order mapping, and unchanged outbound
prompt tests before implementation.

## Exit criteria

Focused Vitest and Python provider tests pass. Runtime catalog evidence is
recorded for every enabled model/mode; no unsupported mode reaches paid
admission.

## UI/UX Contract

### Target User / JTBD
N/A — provider capability resolution is server/runtime behavior; readiness UI is section 05.

### Existing Pattern Reference
N/A — no new UI surface; consume existing model-selection/readiness patterns in section 05.

### Surface Inventory
N/A — no browser surface is changed by this section.

### Component Map
N/A — no browser components are owned here.

### State Matrix
N/A — capability states are API contract fixtures; UI rendering is section 05.

### Responsive Matrix
N/A — no layout is changed here.

### Accessibility Acceptance
N/A — accessibility acceptance is in section 05.

### Copy Contract
N/A — provider block reasons are structured codes; localized copy is section 05.

### Browser Evidence Required
N/A — browser evidence is required in section 05.

### Implementation status

Implemented in `apps/web/server/services/verticalDramaVideoCapabilityProfile.ts`,
`apps/web/server/services/modelRegistry.ts`, and migration
`apps/web/drizzle/0272_vertical_drama_video_capability_profiles.sql`.
Capability modes are data-driven and fail closed for unsupported temporal or
mixed-media combinations; focused profile tests pass.
