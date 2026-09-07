# Section 11 — Reference Voice Lifecycle

Dependencies: 01, 04. Read ../contracts-v2.md and ../voice-lifecycle-v2.md.

Implement voice-lifecycle-v2.md sections 1–4 and 6 for reference flow. Ownership: proposed voice lifecycle services/router and Voice Library UI; request shared schema/migration changes through section 01 owner. Reuse artifact import APIs, do not build another upload store.

Deliver exact VoiceReference/Profile/Binding/TtsRequest/Provenance schemas and import/profile/transcript API contracts. Model-independent profile precedes provider binding; local/cloud adapters consume the same snapshot. Native path stays private. Map VoxCPM modes explicitly; checkpoint-specific MOSS/Fish fixtures are required before their optional promotion.

TDD first: duplicate finalize, local-only no-upload, profile revision conflicts, transcript-required/verification invalidation, multiple refs, consent/cache revocation, stale binding and immutable provenance. UI covers upload/import progress, quality review, transcript editing, binding and preview, accessible error repair and navigation persistence.

Exit: complete user flow from imported sample to genuine local and configured cloud audio with exact provenance. Section 08/09 supply execution; this section's service/schema/UI work may start before them. Runtime completion is checked in section 07.

## Convergence audit requirements

Apply lifecycle sections 8–10 and contracts recovery clarifications; they refine earlier general wording. Use VoiceOwnerScope for profiles/datasets, AudioScope for executions. Include applicable C5-01 through C5-07 regression cases in ../claude-plan-tdd.md. Release reporting distinguishes core A+B, optional providers C and training D.
