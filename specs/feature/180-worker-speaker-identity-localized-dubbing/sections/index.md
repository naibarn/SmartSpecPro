<!-- PROJECT_CONFIG
runtime: typescript-npm
test_command: npm --workspace apps/web test -- shared/verticalDramaMedia/__tests__/unifiedAudio.test.ts
END_PROJECT_CONFIG -->

<!-- SECTION_MANIFEST
section-01-contracts-and-gateway
section-04-voice-consent-and-providers
section-11-reference-voice-lifecycle
section-08-local-runtime-resource-admission
section-09-cloud-routing-and-provider-normalization
section-02-speaker-scan-and-identity-panel
section-03-subtitle-localization
section-05-stem-separation-tts-timing
section-06-edit-map-export-qc
section-10-production-audio-and-skill-integration
section-12-voice-training-evaluation-promotion
section-07-verification-rollout-runbook
END_MANIFEST -->

# Feature 180 v2 Implementation Sections

Read ../spec.md and ../contracts-v2.md. Test path above is a planned section-01 deliverable, not an existing passing test.

| Section | Prerequisites | Deliverable |
|---|---|---|
| 01 | none | Shared contracts, persistence, orchestration and compatibility |
| 04 | 01 | Provider-independent Voice, consent and bindings |
| 11 | 01, 04 | Reference import/profile/transcript/binding lifecycle |
| 08 | 01, 04 | Local runtime, installs and shared GPU lease |
| 09 | 01, 04 | Cloud adapter normalization and routing |
| 02 | 01, existing 179 | Scan evidence and optional identity review |
| 03 | 01; 02 only for scanned input | Versioned localization and review |
| 05 | 04, 08, 09; 03 only for translated input | TTS, alignment, separation and cue review |
| 06 | 01, 05; 02 maps only when scan/edit selected | Canonical mix/export QC |
| 10 | 05, 06, 178 compatible artifacts | Group music and authored/skill integration |
| 12 | 01, 04, 08, 09, 11 | Gated training/evaluation/promotion and rollback |
| 07 | 01–06, 08–12 | Verification, staged rollout and runbook |

Execution order follows manifest. Optional provider promotion is independently gated and does not block the initial local+cloud release. Authored input is a valid early vertical slice after 08/09. Scan/localization can be omitted by the user; implementation coverage still includes them. Shared schema/persistence changes have a single owner in 01; later sections request amendments rather than inventing parallel schemas. Release A proves both targets, Release B proves dubbing and group integration, Release C promotes optional providers.

Normative extension: [Voice lifecycle](../voice-lifecycle-v2.md). Twelve sections are planned; Release D proves training separately. Section 11 is authored before runtime sections, but its real inference exit depends on 08/09. Release A/B can ship with D disabled, while full training scope cannot be claimed complete.
