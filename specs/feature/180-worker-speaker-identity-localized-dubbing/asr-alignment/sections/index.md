<!-- PROJECT_CONFIG
runtime: typescript-npm
test_command: npm --workspace apps/web test -- --run
END_PROJECT_CONFIG -->

<!-- SECTION_MANIFEST
section-01-contracts-and-mapping
section-02-lifecycle-security-admission
section-03-runtime-packs-and-readiness
section-04-faster-whisper-whisperx
section-05-vibevoice-asr
section-06-script-alignment-and-subtitles
section-07-workspace-skills-drama-integration
section-08-verification-and-rollout
END_MANIFEST -->

# ASR/alignment implementation sections

Status: core implementation slice complete; optional model/provider runtime gates remain disabled. Parent Feature 180 sections and their status remain separate.

Read [plan](../claude-plan.md), [test plan](../claude-plan-tdd.md) and [review](../reviews/plan-review.md).

| Section | Dependencies | Scope |
|---|---|---|
| [01](./section-01-contracts-and-mapping.md) | none | contracts-and-mapping |
| [02](./section-02-lifecycle-security-admission.md) | 01 | lifecycle-security-admission |
| [03](./section-03-runtime-packs-and-readiness.md) | 01 | runtime-packs-and-readiness |
| [04](./section-04-faster-whisper-whisperx.md) | 01,02,03 | faster-whisper-whisperx |
| [05](./section-05-vibevoice-asr.md) | 01,02,03 | vibevoice-asr |
| [06](./section-06-script-alignment-and-subtitles.md) | 01,02,03,04 | script-alignment-and-subtitles |
| [07](./section-07-workspace-skills-drama-integration.md) | 01,02,04,06; 05 only for optional profile | workspace-skills-drama-integration |
| [08](./section-08-verification-and-rollout.md) | 01,02,03,04,06,07; 05 for VibeVoice promotion | verification-and-rollout |

Execution waves: 01 → (02 + 03) → (04 + optional 05) → 06 → 07 → 08. Teams may overlap only across disjoint ownership paths; shared Worker lifecycle edits require one integrator. Section 05 does not block Faster-Whisper rollout.
