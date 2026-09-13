# Feature 180 implementation usage

เอกสารนี้เป็น runbook สำหรับ vertical slice ของเสียงที่ implement แล้วใน Web + SmartAIHub Worker และใช้คู่กับ `contracts-v2.md` กับ `voice-lifecycle-v2.md`

## Runtime boundaries

- Web เป็นเจ้าของ contract, tenant/workspace scope, consent, revision, idempotency, credit reservation/reconciliation และ cloud adapter
- Worker เป็นเจ้าของ local model admission, reference staging, process cancellation, artifact upload และ runtime readiness heartbeat
- reference audio ไม่ถูกส่งขึ้น cloud โดยอัตโนมัติ; cloud clone รับเฉพาะ managed artifact ที่ผู้ใช้เลือกและผ่าน consent
- Worker ไม่รับ cloud credential และไม่รับ executable/URL จาก job payload

## End-to-end reference flow

1. อัปโหลดเสียงผ่าน managed artifact flow เดิม แล้วเก็บ artifact id/checksum/duration เป็น `referenceAudioArtifactId` และ `artifactRef`
2. สร้าง `audio.createVoiceConsent` โดยระบุ `allowedOperations` อย่างน้อย `inference` หรือ `training` และวันหมดอายุถ้ามี
3. สร้าง `audio.createVoiceProfile` พร้อม `references[]`, `consentIds`, `defaultReferenceAudioArtifactId` และ owner scope
4. ใส่ `referenceTranscript` ได้โดยตรง; ถ้าใช้ transcript artifact ให้เก็บ hash และให้ผู้ใช้ verify ก่อนใช้ `transcript_clone`
5. สร้าง approved `VoiceBinding` ผ่าน `audio.saveVoiceBinding` โดย pin provider/model/runtime/capability snapshot และ approval
6. สร้าง `audio.queueTts` ด้วย `voiceProfileId`, `voiceProfileRevision`, `voiceBindingId`, `voiceBindingRevision`, utterance ที่มาจาก approved plan และ execution policy; trained voice ต้องแนบ model artifact ที่ถูก promote แล้ว
7. Web จะ freeze binding + profile snapshot ลง job payload แล้วส่งผ่าน `queueUnifiedAudioWorkerJob` เพียงเส้นทางเดียว
8. `worker_local` จะตรวจ manifest, ดาวน์โหลด reference ตาม checksum, ส่ง path/transcript ให้ operator adapter และอัปโหลดผลลัพธ์พร้อม provenance
9. `server_cloud` จะเรียก provider adapter ที่ลงทะเบียน, probe duration จาก bytes จริง, เก็บ managed artifact และ reconcile เครดิต
10. revoke consent/binding มีผลกับ job ใหม่และ cache/publication; job ที่กำลังทำงานต้องคืนสถานะตาม durable job reconciliation

สำหรับ `worker_local` unified audio ใช้เส้นทาง `/api/worker-jobs/:jobId/audio-inputs/:artifactId` แบบ snapshot-scoped: server ตรวจ profile/dataset ที่ถูก freeze ใน job, tenant ของ artifact ต้นทาง, สถานะ producing job เป็น `completed` และ checksum ก่อน stream ให้ Worker เสมอ การอ้างอิง `worker_local` แบบ opaque ที่ไม่มี owner-worker transfer proof จะถูกปิดกั้นอย่างชัดเจน

## Provider matrix

| Provider/model | Target | Modes | สถานะ |
| --- | --- | --- | --- |
| VoxCPM2 / `VoxCPM2` | Worker local | reference clone, transcript clone, trained voice (promoted artifact) | เปิดเมื่อ runtime command พร้อม; trained voice ต้องผ่าน evaluation/promotion |
| Confucius4-TTS / `Confucius4-TTS` | Worker local | reference clone | เปิดเมื่อ runtime command พร้อม |
| MOSS-TTS / `MOSS-TTS` | Worker local | reference clone | เปิดเมื่อ runtime command พร้อม |
| Fish Speech / `Fish-Speech` | Worker local | reference/transcript clone | ปิดด้วย license/GPU gate |
| ElevenLabs / `eleven_multilingual_v2` | Server cloud | catalog voice | ต้องตั้งค่า cloud gateway |
| OpenAI / `gpt-4o-mini-tts` | Server cloud | catalog/synthetic design | ต้องตั้งค่า cloud gateway |
| OmniVoice / `omnivoice-tts` | Server cloud | catalog/reference/transcript clone/synthetic design | ต้องตั้งค่า cloud gateway และ consent สำหรับ clone |

Provider capability เป็น allowlist จาก registry เท่านั้น; provider/model ที่ไม่อยู่ใน registry ถูกปฏิเสธ และ `prefer_cloud` ไม่ทำให้ binding local ถูกเปลี่ยนเงียบ ๆ

## Worker installation

Runtime release ต้องบรรจุ `runtime-pack/tts-runtime/provider_registry.py` ผ่าน `package-runtime-release.mjs` และต้องมี Python runtime ที่ตรวจพบได้จาก runtime pack หรือ `python3`/`python.exe` ที่ operator อนุญาต

Worker จะประกาศ capability ของ provider เฉพาะเมื่อพบไฟล์ command ที่ตั้งค่าไว้จริงใน environment; training ใช้ capability แยกจาก inference ดังนั้นงานจะรอ Worker ที่พร้อมแทนการรับงานแล้วล้มเหลวภายหลัง

ตั้งคำสั่ง adapter เป็น executable path แบบ fixed environment เท่านั้น:

```text
SMARTSPEC_TTS_VOXCPM2_COMMAND=/opt/smartspec/bin/voxcpm2-tts
SMARTSPEC_TTS_CONFUCIUS4_COMMAND=/opt/smartspec/bin/confucius4-tts
SMARTSPEC_TTS_MOSS_COMMAND=/opt/smartspec/bin/moss-tts
SMARTSPEC_TTS_VOXCPM2_TRAIN_COMMAND=/opt/smartspec/bin/voxcpm2-train-lora
```

คำสั่งรับ JSON ทาง stdin และรับ output path เป็น argument เดียว ต้องสร้างไฟล์ที่ไม่ว่างด้วย format ที่ job ขอ; งาน `trained_voice` จะได้รับ `stagedTrainedModelPath` ซึ่งชี้ไปยัง promoted model artifact ที่ตรวจ checksum แล้ว คำสั่งต้องตรวจ/โหลด model ตาม provider contract เอง หากไม่ตั้งค่าหรือ command ล้มเหลว Worker รายงาน `TTS_PROVIDER_UNAVAILABLE` หรือ `TRAINING_UNAVAILABLE` ตามประเภทงาน ไม่มี mock/synthesized fallback

## Training lane

`audio.createVoiceDataset` ต้องสร้าง dataset ที่มี split รวมเท่ากับ `sampleCount`; งานฝึกต้องใช้ dataset revision ที่ frozen/current, consent ทุกตัวต้องอนุญาต `training`, และ recipe ต้องเป็น `voxcpm2` + `VoxCPM2` + `lora` ใน initial lane การสร้าง candidate ไม่ทำให้เป็น production voice โดยอัตโนมัติ ต้องเรียก `audio.recordTrainingEvaluation` ด้วย held-out metrics ก่อน แล้วจึง `audio.promoteTrainedVoiceModel` ได้

Cloud training ที่ไม่มี official adapter และ local training ที่ไม่มี operator command จบด้วย `TRAINING_UNAVAILABLE` อย่างชัดเจน

## Operational checks

- ตรวจ Worker heartbeat ว่ามี `unifiedAudio.ready`, provider ids และ reason ตามจริง
- เปิด feature flags `verticalDramaSeries` และ `verticalDramaSeriesVoiceChain` เฉพาะ tenant ที่ทดสอบแล้ว
- ตรวจ `worker_jobs`, `worker_artifacts`, billing ledger และ provenance ก่อนประกาศผลสำเร็จ
- training completion จะ materialize เป็น private `audio_trained_voice_models` candidate ที่ผูกกับ artifact ของ job; evaluation และ promotion ยังต้องทำแยกกัน
- ใช้ migration `0286_feature_180_unified_voice_lifecycle.sql` แบบ additive ผ่าน `db:migrate`; ไม่ใช้ `db:push` และไม่รัน migration ใน test/diagnosis โดยอัตโนมัติ
- ก่อน Release A ต้องมี live local และ configured cloud artifact proof; provider ที่ยังไม่มี model/license/official adapter ต้องแสดง unavailable
