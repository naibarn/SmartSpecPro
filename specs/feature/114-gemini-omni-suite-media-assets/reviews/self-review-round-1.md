# Self Review Round 1 - Feature 114 Gemini Omni Suite Media Assets

Date: 2026-05-21

## Findings

### 1. Initial spec needed stronger implementation boundaries

Resolution: the plan now separates validation, provider assets, provider contract, skills, admin metadata, UX, orchestration, and rollout into distinct sections.

### 2. Character and Audio must not be treated like ordinary media outputs

Resolution: the plan requires `media_provider_assets` as the source of truth and keeps library items optional/linkable rather than primary.

### 3. Current image/video reference problem is UX and state ownership, not only config

Resolution: the plan keeps existing `referenceImages` and `referenceVideos` as runtime truth and adds a Gemini Omni suite panel instead of relying on locked synced dynamic fields.

### 4. Pricing could regress if source-video presence is not normalized

Resolution: pricing tests must cover all matrix keys and all source-video aliases used by client/server payloads.

### 5. Learning loop could become risky if it edits skills automatically too early

Resolution: Gemini Omni recommendations are pending-review by default. Auto-apply remains behind explicit controls and only for safe instruction-only changes.

### 6. Multi-shot and storyboard semantics needed sharper separation

Resolution: the director skill output contract separates single-shot, multi-shot single video, and storyboard multi-video where each clip has its own shot list.

## Result

The plan is ready for implementation slicing. The riskiest areas are provider asset persistence, UI state boundaries, and orchestration ordering around credits/QA.

