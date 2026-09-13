# Feature 180 section implementation status

สถานะนี้สรุปจาก source และ focused proof ใน workspace ปัจจุบัน โดยไม่ถือ fixture หรือ mock เป็นหลักฐานว่า provider จริงพร้อมใช้งาน

| Section | สถานะ | หลักฐาน |
| --- | --- | --- |
| 01 Contracts and gateway | Complete | `unifiedAudio.ts`, `ttsProviderRegistry.ts`, `unifiedAudio.ts` router, additive migration 0286, shared scheduler |
| 02 Speaker scan and identity panel | Integrated | existing `speakerAwareContracts.ts`, `speakerAwareWorkflow.ts`, `SpeakerAwareWorkflowPanel.tsx`, Worker speaker-aware runner; contract/render tests pass |
| 03 Subtitle localization | Integrated boundary | existing localization/skill gateway and subtitle contract paths remain source-authoritative; no direct LLM call or source subtitle mutation added |
| 04 Voice consent and providers | Complete | consent create/revoke, capability registry, binding validation/revoke, provider-specific target/mode gates |
| 05 Stem separation, TTS and timing | Integrated | existing audio pipeline/QC/timeline modules consume durable audio artifacts; TTS now records decoded duration or fails closed |
| 06 Edit map, export and QC | Integrated | existing edit-map/mix/QC modules remain authoritative; worker artifacts carry checksum/provenance for downstream export |
| 07 Verification and rollout | Complete | focused Web 70-test suite, Worker Rust 236-test suite, runtime packaging checks and this 50-round audit; full typecheck is documented as memory-blocked |
| 08 Local runtime/resource admission | Complete with operator gate | Rust provider admission, command-specific heartbeat readiness, reference staging, cancellation and fixed command allowlist; real model/GPU proof is deployment-gated |
| 09 Cloud routing/provider normalization | Complete with gateway gate | server cloud routing, immutable snapshots, managed output, actual duration probe, usage/billing reconciliation and fail-closed provider matrix |
| 10 Production audio and Skill integration | Integrated | existing `verticalDramaAudioPipelineCoordinator.ts`, audio QC and Skill-first contracts stay source/plan authoritative; unified TTS artifacts are consumable by the same worker lane |
| 11 Reference voice lifecycle | Complete | profile/revision/reference/consent persistence, managed artifact id, optional transcript, binding pinning and inference consent checks |
| 12 Training/evaluation/promotion | Complete contract + truthful runtime gate | dataset freeze/hash/consent, durable training queue, VoxCPM2 LoRA allowlist, candidate reconciliation, promoted `trained_voice` binding and evaluation/promotion; missing training command returns `TRAINING_UNAVAILABLE` |

“Integrated” หมายถึงใช้ implementation ที่มีอยู่ก่อนแล้วและเชื่อม contract ใหม่โดยไม่สร้าง schema/queue ซ้ำ ส่วน “operator gate” หมายถึงต้องติดตั้งโมเดล/คำสั่ง/สิทธิ์และทำ live proof ใน environment เป้าหมายก่อนเปิด production
