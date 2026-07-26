# Deep-plan interview transcript

## Q1 — Where must the user approval checkpoints occur?

**User answer:**

โดยแต่ละขั้นตอนควร มี step รอ user approve หรือตรวจสอบก่อน ใช้เครดิตสร้างภาพ เช่นรอให้ตรวจสอบ prompt แต่ละช็อตก่อนยืนยันให้สร้างภาพ ตรวจสอบเนื้อเรื่องก่อนทำงานต่อถัดไป

**Captured product decision:**

Feature 141 must not progress through a credit-bearing storyboard pipeline solely
because an earlier worker stage completed. The user must inspect and explicitly
approve the story before downstream prompt work, inspect and approve each shot's
image prompt before image-provider spend, inspect/accept the resulting image before
downstream video work, inspect/approve each video prompt before video-provider
spend, and approve separate audio/TTS and final assembly/render work before those
providers are charged. Approval is per shot for shot-scoped work; bulk approval is
only a convenience that persists one approval record per shot and cannot bypass
hash/revision validation.

## Auto-decisions

- Interpret “each step” as every external credit-bearing stage: image, video,
  separate audio/TTS, and paid render/publish, while text-only LLM authoring may
  execute to produce the reviewable artifact before its next media checkpoint.
- Use durable server-side checkpoint state, not browser-only modal state.
- Bind every approval to content hash, plan/shot revision, model, ordered
  references, safety verdict, estimated credits, approving user, and timestamp.
- Re-check the approval immediately before enqueue/provider submission and fail
  closed on drift.
- Preserve the existing legacy mandatory text-plan gate unchanged; the new
  checkpoint policy is part of the future `staged_two_skill_v2` architecture.
