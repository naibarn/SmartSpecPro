# Spec 215 Deep-Plan Interview

## Q1 — Scope and completion target

**Question:** What should be included in “complete every section” for this Spec 215 work?

**User answer:** “ทำ deep-plan สำหรับ spec 215 ให้แล้วเสร็จ แล้วทำ deep-implement ต่อให้ครบทุก sections แล้ววน loop ตรวจสอบมี gap หรือไม่อย่างน้อย 10 รอบหากมีให้ปรับปรุงให้สมบูรณ์”

**Interpretation:** Create a complete sectionized implementation plan that accounts for every normative Spec 215 section and amendment; implement every generated section that can be completed safely in this repository; run at least ten evidence-backed gap-review rounds and repair confirmed local gaps. Cross-spec ownership, missing external services, deployed production data, credentials, provider accounts, and target runtime evidence remain explicitly gated rather than fabricated.

## Auto-decisions

- Use the current canonical `workflowStudio`/Spec 215 path and Feature 195/186 `worker_jobs` control plane. Never reactivate the retired custom workflow engine or `/workflows` surface.
- Keep a logical workflow run/node/attempt state model in the existing Spec 215 domain persistence; do not create a second physical jobs table or queue.
- Use additive migrations and an inventory/backfill/rollback gate for existing persisted runs and definitions.
- Use focused Vitest/Python tests matching touched surfaces. Skip root typecheck per repository policy.
- Do not commit per section in this already-dirty `main` worktree; preserve existing user changes and leave scoped output reviewable. No push/deploy is authorized by this request.
