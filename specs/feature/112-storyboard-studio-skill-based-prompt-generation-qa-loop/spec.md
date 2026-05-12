# Feature Spec: 112-Storyboard Studio Skill-Based Prompt Generation & QA Loop

**Spec ID:** 112-storyboard-studio-skill-based-prompt-generation-qa-loop  
**Created:** 2026-05-10  
**Status:** Draft  
**Owner:** Storyboard Studio / Media Studio / Skill Runtime / QA  
**Depends on:** Existing SmartSpecPro skill runtime, media generation providers, Media Studio, Video Editor, asset library, model provider routing  

---

## 1. Background

SmartSpecPro already has media generation capabilities for images, video, speech, audio, and model-provider backed prompt generation. The missing layer is an end-to-end **Storyboard Studio** that can turn a campaign brief into a reviewed, iterated, quality-controlled production plan before media is generated.

Storyboard Studio should not implement a new image, video, speech, or audio generation engine. It is a director/orchestration layer that uses:

1. Existing skill execution paths.
2. Existing LLM/model provider routing.
3. Existing SmartSpecPro media generation jobs.
4. Existing asset storage and media history.
5. Existing Video Editor / Media Studio handoff paths where applicable.

The core product decision is that every major creative/planning step is a dedicated skill with a matching QA skill. QA results must be structured enough for the orchestrator to decide whether to continue, revise, regenerate, or wait for human review.

---

## 2. Goals

1. Add a Storyboard Studio pipeline that starts from a campaign brief and produces storyboard, prompts, generated media, QA results, and review-ready outputs.
2. Make each important step a separate skill with a clear responsibility.
3. Add QA loops that can send structured feedback back to the previous skill.
4. Support iterative revision until pass threshold or max-attempt limits are reached.
5. Record skill version, input hash, output, QA result, and attempt history for every step.
6. Support human review gates by stage.
7. Support future skill self-improvement suggestions from repeated QA failure patterns.
8. Reuse existing SmartSpecPro media generation systems instead of creating new provider engines.
9. Allow gradual rollout from human-in-the-loop mode to partial auto mode to fully automated mode.

---

## 3. Non-Goals

1. Do not build a new media provider abstraction.
2. Do not replace existing Media Studio generation jobs.
3. Do not require fully automated skill patching in MVP.
4. Do not require video/audio QA in the first sprint MVP.
5. Do not require automatic publishing/export in MVP.
6. Do not bypass user review when human review is configured.
7. Do not mutate active skill instructions without versioning, audit trail, and rollback.

---

## 4. Product Decisions Locked for MVP

1. Storyboard Studio is a new director layer, not a media engine.
2. MVP proves the loop with storyboard and image generation first.
3. Prompt generation must be skillized by target media type.
4. QA output must be structured, not free-text only.
5. Human review is enabled by default for storyboard and image outputs.
6. Skill versioning and run traces are required from the start.
7. Skill improvement suggestions may be generated in MVP, but applying patches remains human-approved.
8. The pipeline must stop on blocking policy/safety issues.
9. Max attempts must be enforced per stage and per scene.
10. Existing provider/media jobs remain responsible for actual image/video/audio generation.
11. Storyboard Studio is a dedicated new UI surface named `Storyboard Studio`.
12. Storyboard Studio must be reachable from the existing Dashboard.
13. The existing `/storyboard-review` surface remains a review workspace and must not be treated as the new Storyboard Studio authoring/orchestration surface.

---

## 5. Conceptual Pipeline

```text
Campaign Brief
  ↓
Storyboard Prompt Skill
  ↓
Storyboard Generation Skill
  ↓
Storyboard QA Skill
  ↓ pass/fail + comments
  ↓
Image Prompt Skill
  ↓
Image Prompt QA Skill
  ↓
Generate Image using existing SmartSpecPro media system
  ↓
Image Quality QA Skill
  ↓ pass/fail + comments
  ↓
Video Prompt Skill
  ↓
Video Prompt QA Skill
  ↓
Generate Video using existing SmartSpecPro media system
  ↓
Video Quality QA Skill
  ↓
Speech Prompt Skill
  ↓
Speech Prompt QA Skill
  ↓
Generate Speech using existing SmartSpecPro media system
  ↓
Audio Quality QA Skill
  ↓
Human Review Gate, if enabled
  ↓
Next Step / Export / Auto Continue
```

The QA loop can route feedback to the previous skill:

```text
Skill produces output
  ↓
QA Skill reviews output
  ↓
If passed: continue
  ↓
If failed: produce structured comments
  ↓
Target skill receives comments
  ↓
Target skill revises output
  ↓
QA Skill reviews again
  ↓
Repeat until pass or max attempts reached
```

---

## 6. Domain Model Overview

### 6.1 Storyboard Core Types

```ts
type Storyboard = {
  id: string;
  title: string;
  brief: string;
  targetPlatform?: string;
  aspectRatio: string;
  targetDurationSeconds: number;
  brandProfile?: BrandProfile;
  productProfile?: ProductProfile;
  scenes: Scene[];
  voiceoverGroups?: VoiceoverGroup[];
  musicPrompt?: MusicPrompt;
  createdAt: string;
  updatedAt: string;
};

type Scene = {
  id: string;
  index: number;
  title: string;
  durationSeconds: number;
  objective: string;
  visualDescription: string;
  firstFramePrompt?: ImagePrompt;
  videoPrompt?: VideoPrompt;
  speechPrompt?: SpeechPrompt;
  cinematographyHints?: CinematographyHints;
  audioHints?: AudioHints;
  transitionHints?: TransitionHints;
  locked?: boolean;
};
```

### 6.2 Shared QA Comment

```ts
type QaComment = {
  id: string;
  severity: "info" | "suggestion" | "warning" | "blocking";
  target: string;
  category: string;
  message: string;
  suggestedFix?: string;
};
```

### 6.3 Provider Hints

```ts
type ProviderHints = {
  preferredProviderId?: string;
  preferredModelId?: string;
  aspectRatio?: string;
  durationSeconds?: number;
  negativePrompt?: string;
  seed?: number;
  extraParams?: Record<string, unknown>;
};
```

---

## 7. Storyboard Skills

### 7.1 Storyboard Prompt Builder Skill

Purpose: create a prompt for an LLM to generate a structured storyboard from campaign brief, brand profile, product info, audience, platform, template, and uploaded assets.

Input:

```ts
type StoryboardPromptBuilderInput = {
  brief: string;
  brandProfile?: BrandProfile;
  productProfile?: ProductProfile;
  targetAudience?: string;
  targetPlatform?: string;
  aspectRatio: string;
  targetDurationSeconds: number;
  templateId?: string;
  uploadedAssets?: AssetSummary[];
  previousQaComments?: QaComment[];
};
```

Output:

```ts
type StoryboardPromptBuilderOutput = {
  prompt: string;
  systemInstruction: string;
  expectedJsonSchema: string;
  qualityChecklist: string[];
  assumptions: string[];
};
```

QA feedback behavior:

1. If QA says the hook is weak, rewrite the planner prompt to force a stronger first-two-second visual hook.
2. If QA says CTA is weak, require final scene CTA and platform-specific urgency.
3. If QA says continuity is weak, require scene-by-scene transitions and object/character continuity.
4. If QA says brand consistency is weak, require explicit brand color, tone, product placement, and logo constraints.

### 7.2 Storyboard Generation Skill

Purpose: call LLM/model provider to create a structured storyboard.

Required output concepts:

- `Storyboard`
- `Scene`
- `ImagePrompt`
- `VideoPrompt`
- `SpeechPrompt`
- `MusicPrompt`
- `VoiceoverGroup`
- `CinematographyHints`
- `AudioHints`
- `TransitionHints`

Output:

```ts
type StoryboardGenerationOutput = {
  storyboard: Storyboard;
  rawModelOutput: string;
  validationWarnings: string[];
};
```

Initial validation:

1. JSON parses.
2. Has at least one scene.
3. Every scene has `firstFramePrompt`.
4. Every scene has `videoPrompt`.
5. Total duration is close to target duration.
6. Final scene has CTA when template requires CTA.

### 7.3 Storyboard QA Skill

Purpose: review storyboard before any media generation starts.

Review criteria:

1. Structure completeness.
2. Story arc.
3. Hook strength.
4. Narrative continuity.
5. Brand consistency.
6. Product visibility.
7. Scene duration realism.
8. CTA clarity.
9. Prompt readiness.
10. Asset usage correctness.
11. Platform suitability such as TikTok, Reels, YouTube Shorts.
12. Risk, policy, or unsupported content.

Output:

```ts
type StoryboardQaResult = {
  passed: boolean;
  score: number;
  threshold: number;
  comments: QaComment[];
  blockingIssues: QaComment[];
  suggestions: QaComment[];
  nextAction:
    | "approve"
    | "revise_storyboard_prompt"
    | "revise_storyboard"
    | "human_review";
};
```

Example comment:

```json
{
  "severity": "blocking",
  "target": "scene_1",
  "category": "hook_strength",
  "message": "Scene 1 does not create a strong visual hook within the first 2 seconds.",
  "suggestedFix": "Rewrite scene 1 to start with a high-contrast problem/benefit visual and direct on-screen text."
}
```

### 7.4 Storyboard Revision Skill

Purpose: receive a storyboard plus QA comments and revise only the failed parts without throwing away good work.

Rules:

1. Do not change locked scenes.
2. Fix only issues identified by QA unless a dependent change is required.
3. Preserve scene IDs when scenes are not removed.
4. Produce a change summary.
5. Mark resolved QA comment ids.

Output:

```ts
type StoryboardRevisionOutput = {
  revisedStoryboard: Storyboard;
  changeSummary: string[];
  resolvedQaCommentIds: string[];
};
```

---

## 8. Media Prompt Skills

### 8.1 Image Prompt Builder Skill

Purpose: create a first-frame image prompt for each scene from storyboard, scene context, brand style, product assets, and QA feedback.

Input:

```ts
type ImagePromptBuilderInput = {
  storyboard: Storyboard;
  scene: Scene;
  brandProfile?: BrandProfile;
  productAssets?: AssetSummary[];
  previousQaComments?: QaComment[];
};
```

Output:

```ts
type ImagePromptBuilderOutput = {
  imagePrompt: ImagePrompt;
  providerHints?: ProviderHints;
  qualityChecklist: string[];
};
```

Prompt requirements:

1. Subject.
2. Product placement.
3. Composition.
4. Camera angle.
5. Lens and depth of field.
6. Lighting.
7. Mood.
8. Background.
9. Brand color anchors.
10. Reference asset usage.
11. Negative prompt when needed.

### 8.2 Image Prompt QA Skill

Purpose: review image prompt before generation.

Checks:

1. Prompt clarity.
2. Required product/asset presence.
3. Composition fit for scene.
4. Aspect ratio/platform fit.
5. Camera/lighting/style specificity.
6. Prompt contradictions.
7. Prompt length and ambiguity.

Output:

```ts
type ImagePromptQaResult = {
  passed: boolean;
  score: number;
  comments: QaComment[];
  suggestedPromptPatch?: Partial<ImagePrompt>;
};
```

If failed, route back to Image Prompt Builder Skill with comments.

### 8.3 Video Prompt Builder Skill

Purpose: create a video prompt from scene plus generated first frame or first-frame prompt.

Prompt must separate still-image continuity from motion instructions:

1. First-frame continuity.
2. Subject motion.
3. Camera motion.
4. Product motion.
5. Scene action.
6. Timing.
7. Transition out.
8. Duration.
9. Motion constraints.
10. Things to avoid.

Output:

```ts
type VideoPromptBuilderOutput = {
  videoPrompt: VideoPrompt;
  providerHints?: ProviderHints;
  qualityChecklist: string[];
};
```

### 8.4 Video Prompt QA Skill

Purpose: review video prompt before video generation.

Checks:

1. Action clarity.
2. Camera motion does not conflict with scene or image.
3. Duration fits the action.
4. First-frame continuity is explicit.
5. Transition from previous scene is appropriate.
6. Prompt avoids model drift/product deformation risk.
7. Prompt does not include too many actions for the duration.

### 8.5 Speech Prompt Builder Skill

Purpose: create voiceover/speech prompt for a scene or voiceover group.

Considerations:

1. Script length compared with duration.
2. Brand tone.
3. Audience.
4. Platform.
5. Pronunciation.
6. Language.
7. Voice style.
8. CTA.

Output:

```ts
type SpeechPromptBuilderOutput = {
  speechPrompt: SpeechPrompt;
  estimatedSpeechDurationSeconds: number;
  qualityChecklist: string[];
};
```

### 8.6 Speech Prompt QA Skill

Purpose: review speech script and voice prompt before generation.

Checks:

1. Script too long for duration.
2. Message clarity.
3. Brand tone match.
4. CTA clarity.
5. Natural readability.
6. Duplicate or ambiguous wording.
7. Language and pronunciation suitability.

### 8.7 Music Prompt Builder Skill

Purpose: create background music or music bed prompt.

Prompt must include:

1. Mood.
2. Genre.
3. Tempo.
4. Instruments.
5. Energy arc.
6. Platform suitability.
7. Vocal/instrumental preference.

### 8.8 Music Prompt QA Skill

Purpose: review whether music prompt matches campaign, scene pacing, voiceover, and brand tone.

---

## 9. Generated Media QA Skills

### 9.1 Image Quality QA Skill

Purpose: review generated image assets.

Input:

```ts
type ImageQualityQaInput = {
  storyboard: Storyboard;
  scene: Scene;
  imageAssetId: string;
  originalImagePrompt: ImagePrompt;
};
```

Checks:

1. Prompt adherence.
2. Product visibility.
3. Product/logo deformation.
4. Brand consistency.
5. Composition quality.
6. Lighting quality.
7. Text artifacts when image contains text.
8. Human anatomy when people appear.
9. Real estate/property consistency when applicable.
10. Aspect ratio and crop safety.
11. Visual hook strength.
12. Scene continuity.
13. Safety/policy risk.

Output:

```ts
type ImageQualityQaResult = {
  passed: boolean;
  score: number;
  threshold: number;
  comments: QaComment[];
  recommendedAction:
    | "approve"
    | "regenerate_same_prompt"
    | "revise_image_prompt"
    | "revise_scene"
    | "human_review";
  suggestedPromptPatch?: Partial<ImagePrompt>;
};
```

Failure route:

```text
Image Quality QA Skill
  ↓ comments
Image Prompt Builder Skill revises prompt
  ↓
Image Prompt QA Skill
  ↓
Generate Image again
  ↓
Image Quality QA Skill
```

### 9.2 Video Quality QA Skill

Purpose: review generated video assets.

Checks:

1. Motion quality.
2. Temporal consistency.
3. Product consistency.
4. Character consistency.
5. Camera motion smoothness.
6. Scene follows prompt.
7. No broken frames.
8. No excessive flicker.
9. No distorted text/logo/product.
10. Duration correct.
11. Transition readiness.
12. First-frame continuity.
13. Last-frame suitability for next scene.

Output:

```ts
type VideoQualityQaResult = {
  passed: boolean;
  score: number;
  threshold: number;
  comments: QaComment[];
  recommendedAction:
    | "approve"
    | "regenerate_same_prompt"
    | "revise_video_prompt"
    | "revise_image_prompt"
    | "revise_scene"
    | "human_review";
  suggestedPromptPatch?: Partial<VideoPrompt>;
};
```

### 9.3 Audio Quality QA Skill

Purpose: review generated speech and music.

Checks:

1. Voice clarity.
2. Pacing.
3. Script completeness.
4. Tone match.
5. Pronunciation.
6. Audio artifacts.
7. Background noise.
8. Duration alignment.
9. Music does not overpower voiceover.
10. Language correctness.

Output:

```ts
type AudioQualityQaResult = {
  passed: boolean;
  score: number;
  threshold: number;
  comments: QaComment[];
  recommendedAction:
    | "approve"
    | "regenerate_same_prompt"
    | "revise_speech_prompt"
    | "revise_music_prompt"
    | "human_review";
};
```

---

## 10. Skill Improvement Loop

### 10.1 Runtime Loop Per Asset

Every stage follows the same control loop:

```text
Skill produces output
  ↓
QA Skill reviews output
  ↓
If passed: next step
  ↓
If failed: structured comments
  ↓
Target skill receives comments
  ↓
Target skill revises output
  ↓
QA Skill reviews again
  ↓
Repeat until pass or max attempts reached
```

### 10.2 Skill Self-Improvement Suggestion

When repeated QA patterns are detected, generate a suggestion instead of directly patching active skill instructions:

```ts
type SkillImprovementSuggestion = {
  id: string;
  skillId: string;
  sourceQaRunIds: string[];
  issuePattern: string;
  suggestedInstructionPatch: string;
  suggestedChecklistPatch?: string[];
  expectedImpact: string;
  status: "proposed" | "approved" | "applied" | "rejected";
};
```

Example:

```text
Image Prompt Builder Skill often forgets product placement in scenes 1-2.
Suggested patch: Always specify where the product appears, its scale, and whether logo must be visible.
```

### 10.3 Skill Patch Flow

```text
QA detects recurring issue
  ↓
Skill Improvement Skill summarizes pattern
  ↓
Generate skill patch proposal
  ↓
If autoPatchSkill=false: human approves patch
  ↓
Apply patch to skill config/instruction/checklist
  ↓
Run regression test prompts
  ↓
Enable new skill version
```

MVP may create suggestions but must not auto-apply them.

---

## 11. Skill Versioning and Traceability

Every skill must have a version:

```ts
type SkillVersion = {
  skillId: string;
  version: string;
  instruction: string;
  checklist: string[];
  modelPreferences?: ModelPreferences;
  createdAt: string;
  promotedAt?: string;
  status: "draft" | "active" | "deprecated" | "rollback";
};
```

Every output must record which skill version created it:

```ts
type SkillRunTrace = {
  id: string;
  skillId: string;
  skillVersion: string;
  inputHash: string;
  outputAssetId?: string;
  outputJson?: unknown;
  qaResultId?: string;
  status: "success" | "failed" | "revised";
  createdAt: string;
};
```

Traceability requirements:

1. Every skill run is persisted.
2. Every QA result links to the target artifact and QA skill version.
3. Every revision links back to the prior QA comments it resolves.
4. Every generated media asset links to its prompt skill run and media job id.
5. Every human approval/rejection is persisted.

---

## 12. QA Scoring Rubric

Use 0-100 scores with thresholds per target type:

```ts
type QaRubric = {
  id: string;
  targetType:
    | "storyboard"
    | "image_prompt"
    | "video_prompt"
    | "speech_prompt"
    | "image_asset"
    | "video_asset"
    | "audio_asset";
  threshold: number;
  criteria: QaCriterion[];
};

type QaCriterion = {
  key: string;
  label: string;
  weight: number;
  description: string;
  blockingIfBelow?: number;
};
```

### 12.1 Storyboard QA Default Rubric

| Criterion | Weight |
|---|---:|
| Hook strength | 15 |
| Narrative continuity | 15 |
| Brand consistency | 15 |
| Scene completeness | 15 |
| CTA clarity | 10 |
| Platform fit | 10 |
| Asset usage | 10 |
| Duration realism | 10 |

Default threshold: `80`

### 12.2 Image QA Default Rubric

| Criterion | Weight |
|---|---:|
| Prompt adherence | 20 |
| Product visibility | 20 |
| Visual quality | 15 |
| Brand consistency | 15 |
| Composition | 10 |
| Artifact-free | 10 |
| Platform crop safety | 10 |

Default threshold: `82`

### 12.3 Video QA Default Rubric

| Criterion | Weight |
|---|---:|
| Motion quality | 20 |
| Prompt adherence | 15 |
| Product consistency | 15 |
| Temporal consistency | 15 |
| Camera smoothness | 10 |
| Duration correctness | 10 |
| Artifact-free | 10 |
| Transition readiness | 5 |

Default threshold: `80`

### 12.4 Audio QA Default Rubric

| Criterion | Weight |
|---|---:|
| Clarity | 20 |
| Pacing | 20 |
| Script adherence | 15 |
| Tone match | 15 |
| Pronunciation | 10 |
| Artifact-free | 10 |
| Duration fit | 10 |

Default threshold: `80`

---

## 13. Human Review Gate

Storyboard Studio must support configurable user review before advancing to the next stage:

```ts
type HumanReviewConfig = {
  enabled: boolean;
  reviewStages: Array<
    | "storyboard"
    | "image_prompts"
    | "images"
    | "video_prompts"
    | "videos"
    | "speech_prompts"
    | "audio"
    | "final_storyboard"
  >;
  requireApprovalForLowConfidence: boolean;
  lowConfidenceThreshold: number;
  allowAutoContinueAfterStableSkill: boolean;
  stableSkillMinPassRate: number;
  stableSkillMinRuns: number;
};
```

### 13.1 Recommended Default

Initial rollout:

```json
{
  "enabled": true,
  "reviewStages": ["storyboard", "images", "videos", "final_storyboard"],
  "requireApprovalForLowConfidence": true,
  "lowConfidenceThreshold": 85,
  "allowAutoContinueAfterStableSkill": false
}
```

After skill stability improves:

```json
{
  "enabled": true,
  "reviewStages": ["final_storyboard"],
  "requireApprovalForLowConfidence": true,
  "allowAutoContinueAfterStableSkill": true,
  "stableSkillMinPassRate": 0.92,
  "stableSkillMinRuns": 100
}
```

Fully auto mode:

```json
{
  "enabled": false,
  "requireApprovalForLowConfidence": true
}
```

---

## 14. Orchestration State Machine

```ts
type StoryboardRunStatus =
  | "created"
  | "building_storyboard_prompt"
  | "generating_storyboard"
  | "qa_storyboard"
  | "revising_storyboard"
  | "awaiting_human_storyboard_review"
  | "building_image_prompts"
  | "qa_image_prompts"
  | "generating_images"
  | "qa_images"
  | "revising_image_prompts"
  | "building_video_prompts"
  | "qa_video_prompts"
  | "generating_videos"
  | "qa_videos"
  | "revising_video_prompts"
  | "building_speech_prompts"
  | "qa_speech_prompts"
  | "generating_audio"
  | "qa_audio"
  | "awaiting_human_final_review"
  | "completed"
  | "partially_completed"
  | "failed";
```

The orchestrator must be able to run:

1. Whole-storyboard run.
2. Single-stage run.
3. Single-scene stage run.
4. Retry from failed stage.
5. Continue after human approval.
6. Stop on blocking policy issue.

---

## 15. Max Attempts and Safety Controls

```ts
type QaLoopConfig = {
  maxAttemptsPerStage: number;
  maxTotalAttemptsPerScene: number;
  stopOnBlockingPolicyIssue: boolean;
  requireHumanReviewAfterMaxAttempts: boolean;
  allowRegenerateSamePromptAttempts: number;
  allowPromptRewriteAttempts: number;
};
```

Default:

```json
{
  "maxAttemptsPerStage": 3,
  "maxTotalAttemptsPerScene": 8,
  "stopOnBlockingPolicyIssue": true,
  "requireHumanReviewAfterMaxAttempts": true,
  "allowRegenerateSamePromptAttempts": 1,
  "allowPromptRewriteAttempts": 2
}
```

Rules:

1. A blocking policy issue stops the relevant run immediately.
2. Max attempts route to human review if configured.
3. Reusing the same prompt is allowed only for likely provider/transient quality failures.
4. Prompt rewrite is required when QA identifies unclear instructions, missing product placement, weak composition, or continuity issues.
5. Scene revision is required when prompt-level fixes cannot solve storyboard-level flaws.

---

## 16. Database Additions

### 16.1 `storyboard_skill_runs`

```sql
id
storyboard_id
scene_id
skill_id
skill_version
stage
input_json
output_json
output_asset_id
status
attempt_number
created_at
completed_at
error_message
```

### 16.2 `storyboard_qa_results`

```sql
id
storyboard_id
scene_id
target_type
target_id
qa_skill_id
qa_skill_version
score
threshold
passed
comments_json
blocking_issues_json
recommended_action
created_at
```

### 16.3 `storyboard_qa_comments`

```sql
id
qa_result_id
severity
category
target_path
message
suggested_fix
resolved
resolved_by_skill_run_id
created_at
```

### 16.4 `skill_improvement_suggestions`

```sql
id
skill_id
source_qa_run_ids_json
issue_pattern
suggested_instruction_patch
suggested_checklist_patch_json
expected_impact
status
reviewed_by_user_id
applied_skill_version
created_at
updated_at
```

### 16.5 `storyboard_human_reviews`

```sql
id
storyboard_id
scene_id
stage
reviewer_user_id
status
comments_json
approved_at
rejected_at
created_at
```

### 16.6 Migration Notes

1. Use JSON columns for early iteration where schema may evolve.
2. Index `storyboard_id`, `scene_id`, `stage`, `skill_id`, and `created_at`.
3. Keep skill run output immutable after completion.
4. Store revision runs as new rows rather than overwriting prior output.

---

## 17. API Additions

### 17.1 Skill Run APIs

```http
POST /api/storyboards/:id/run
POST /api/storyboards/:id/run-stage
POST /api/storyboards/:id/scenes/:sceneId/run-stage
```

### 17.2 QA APIs

```http
POST /api/storyboards/:id/qa/storyboard
POST /api/storyboards/:id/scenes/:sceneId/qa/image-prompt
POST /api/storyboards/:id/scenes/:sceneId/qa/image
POST /api/storyboards/:id/scenes/:sceneId/qa/video-prompt
POST /api/storyboards/:id/scenes/:sceneId/qa/video
POST /api/storyboards/:id/scenes/:sceneId/qa/speech-prompt
POST /api/storyboards/:id/scenes/:sceneId/qa/audio
```

### 17.3 Human Review APIs

```http
POST /api/storyboards/:id/reviews
PATCH /api/storyboards/:id/reviews/:reviewId
```

### 17.4 Skill Improvement APIs

```http
GET /api/skills/:skillId/improvement-suggestions
POST /api/skills/:skillId/improvement-suggestions/:suggestionId/apply
POST /api/skills/:skillId/versions
POST /api/skills/:skillId/versions/:versionId/promote
POST /api/skills/:skillId/versions/:versionId/rollback
```

### 17.5 API Contract Requirements

1. Run APIs must return current run status and next expected stage.
2. QA APIs must persist QA results before returning response.
3. Human review approval must resume the blocked run only if the run is still waiting on that review.
4. Skill improvement apply/promote/rollback must require permission checks.
5. All mutation APIs must enforce tenant/user ownership.

---

## 18. UI Additions

### 18.1 Storyboard Studio Page

Add a new first-class Storyboard Studio page.

Required route:

```text
/storyboard-studio
```

Required page title:

- English: `Storyboard Studio`
- Thai: `Storyboard Studio`

Primary purpose:

1. Start a campaign/storyboard run from a brief.
2. Configure target platform, aspect ratio, duration, template, uploaded assets, and human review settings.
3. Show the skill pipeline, QA status, generated assets, and revision loops in one place.
4. Hand off approved media/prompt outputs to existing Media Studio, Storyboard Review, or Video Editor flows as needed.

This page is not the same as the existing Storyboard Review page. Storyboard Review can remain the downstream review workspace for already-created clips/tasks. Storyboard Studio is the upstream authoring, orchestration, QA, and iteration workspace.

Add these panels:

1. Pipeline Status
   - current stage
   - attempt count
   - pass/fail per stage
   - blocked/waiting-human states

2. Skill Runs Panel
   - skill name
   - version
   - input/output viewer
   - status
   - duration/time

3. QA Results Panel
   - score
   - threshold
   - comments
   - blocking issues
   - suggested fixes

4. Human Review Panel
   - approve
   - request changes
   - comment
   - skip if allowed

5. Skill Improvement Panel
   - recurring issue patterns
   - suggested patch
   - approve/apply
   - rollback

### 18.2 Dashboard Integration

Storyboard Studio must be connected from the existing Dashboard.

Dashboard requirements:

1. Add a primary or secondary quick action named `Storyboard Studio`.
2. The action links to `/storyboard-studio`.
3. The action should sit near `Media Studio` and existing `Storyboard Review` because this is part of the same content-production workflow.
4. Keep the existing `Storyboard Review` entry if it is still useful for reviewing generated clips.
5. Add localized labels and descriptions in both English and Thai dashboard locale files.
6. If `STORYBOARD_STUDIO_ENABLED` is false, hide the Dashboard entry.
7. If the feature is enabled but the user lacks access, show a disabled/upsell/permission-safe state according to existing Dashboard conventions.

Suggested Dashboard labels:

English:

- Label: `Storyboard Studio`
- Description: `Plan campaign scenes, run skill QA, and generate approved media step by step.`

Thai:

- Label: `Storyboard Studio`
- Description: `วางแผนฉากแคมเปญ ตรวจ QA ด้วย skill และสร้างสื่อที่ผ่านการอนุมัติทีละขั้น`

### 18.3 Navigation and Menu Integration

The new page should be reachable through normal app navigation, not only by deep link.

Requirements:

1. Register route `/storyboard-studio` in the client router.
2. Add menu metadata for `Storyboard Studio` near Media Studio / Storyboard Review where the app menu supports it.
3. Add i18n keys for page title, route label, empty states, actions, and status text.
4. Preserve `/storyboard-review` as an existing route.
5. Add tests that the Dashboard exposes Storyboard Studio when the feature flag is enabled.

### 18.4 Storyboard Studio Landing / Empty State

The first screen should be the actual creation workspace, not a marketing landing page.

Initial visible controls:

1. Campaign brief textarea.
2. Target platform selector.
3. Aspect ratio selector.
4. Target duration input.
5. Template selector.
6. Asset upload/library picker.
7. Human review gate settings.
8. `Create Storyboard` action.

The empty state should make the next action obvious without explaining the whole product in long text.

### 18.5 Scene-Level UX

Each scene should show:

1. Storyboard status.
2. Image prompt status.
3. Image asset status.
4. Video prompt status.
5. Video asset status.
6. Speech/audio status.
7. QA score badges.
8. Attempt count.
9. Last blocking issue.
10. Retry/revise actions when permitted.

### 18.6 Existing Surface Relationship

Use these boundaries:

| Surface | Role |
|---|---|
| Dashboard | Entry point, recent run summary, quick start |
| Storyboard Studio | New authoring, skill pipeline, QA loop, human review configuration |
| Storyboard Review | Downstream review workspace for generated storyboard clips/tasks |
| Media Studio | Existing generation surface and provider-backed media job execution |
| Video Editor | Timeline assembly, editing, render/export |

Storyboard Studio may link to Storyboard Review after media assets exist, but it must not depend on Storyboard Review for the primary run state machine.

---

## 19. Example End-to-End Flow

### Step 1: User Creates Storyboard

User submits:

```text
Create a 20s vertical ad for a luxury condo targeting young professionals.
```

### Step 2: Storyboard Prompt Is Built

Storyboard Prompt Builder Skill creates planner prompt.

### Step 3: Storyboard Generated

Storyboard Generation Skill creates 5 scenes.

### Step 4: Storyboard QA

Storyboard QA finds:

```text
Scene 1 hook is weak.
CTA lacks urgency.
Scene 3 duration is too short for described action.
```

### Step 5: Revision Loop

Storyboard Revision Skill updates only the affected scenes.

### Step 6: QA Again

Storyboard passes threshold.

### Step 7: Human Review Gate

If enabled, user approves storyboard.

### Step 8: Image Prompts

Image Prompt Builder Skill creates a prompt per scene.

### Step 9: Image Prompt QA

If prompt is unclear, the prompt is rewritten before generation.

### Step 10: Image Generation

Storyboard Studio calls existing SmartSpecPro media generation service.

### Step 11: Image QA

If image has logo deformation:

```text
Image Quality QA
  ↓ comments
Image Prompt Builder
  ↓ revised prompt
Generate Image again
```

### Step 12: Continue To Video/Audio

Only after previous stage passes or the user approves an override.

---

## 20. Implementation Phases

### Phase 1: Skillized Planning Foundation

1. Add Storyboard Studio schema.
2. Add skill definitions.
3. Add Storyboard Prompt Builder Skill.
4. Add Storyboard Generation Skill.
5. Add Storyboard QA Skill.
6. Add Storyboard Revision Skill.
7. Add human review gate for storyboard.

### Phase 2: Skillized Prompt Generation

1. Add Image Prompt Builder and QA.
2. Add Video Prompt Builder and QA.
3. Add Speech Prompt Builder and QA.
4. Add Music Prompt Builder and QA.

### Phase 3: Media QA Loop

1. Add Image Quality QA.
2. Add Video Quality QA.
3. Add Audio Quality QA.
4. Add retry/rewrite/regenerate loop.
5. Add scene-level attempt controls.

### Phase 4: Skill Improvement System

1. Add skill run trace.
2. Add QA pattern detection.
3. Add skill improvement suggestions.
4. Add approval/apply/rollback flow.
5. Add skill versioning dashboard.

### Phase 5: Auto Mode

1. Add stability metrics.
2. Enable auto-continue by stage.
3. Enable auto skill patch only after high confidence.
4. Add production safety guards.

---

## 21. Key Design Decisions

### 21.1 Prompt Generation Must Be Skillized

Planner should not create all media prompts in one fixed pass because image, video, speech, and music each need different checklists and QA criteria.

### 21.2 QA Must Be Structured

QA output must include score, passed status, comments, severity, target path, and recommended action so the orchestrator can make deterministic decisions.

### 21.3 Human Review Is Configurable

Early rollout should include more user review points to collect feedback and stabilize skills. Later rollout can reduce review points when pass rates are consistently high.

### 21.4 Skill Patching Must Be Versioned

Skill instruction changes must create a new version with audit trail and rollback. Active instructions must not be overwritten in place.

### 21.5 Media Generation Remains External

Storyboard Studio owns planning, orchestration, QA, and review. Media Studio and existing provider systems own actual image/video/audio generation.

---

## 22. Rollout / Feature Flags

Suggested flags:

1. `STORYBOARD_STUDIO_ENABLED`
2. `STORYBOARD_STUDIO_IMAGE_QA_ENABLED`
3. `STORYBOARD_STUDIO_VIDEO_AUDIO_QA_ENABLED`
4. `STORYBOARD_STUDIO_SKILL_IMPROVEMENT_ENABLED`
5. `STORYBOARD_STUDIO_AUTO_CONTINUE_ENABLED`

Safe defaults:

1. Feature hidden unless `STORYBOARD_STUDIO_ENABLED=true`.
2. Human review enabled by default.
3. Auto-continue disabled by default.
4. Auto skill patching disabled by default.
5. Existing Media Studio flows remain unchanged when flags are off.
6. Dashboard quick action is hidden when `STORYBOARD_STUDIO_ENABLED=false`.
7. Existing `/storyboard-review` remains available independently unless its own existing policy says otherwise.

---

## 23. MVP Recommendation

MVP should implement:

1. Storyboard Prompt Builder Skill.
2. Storyboard Generation Skill.
3. Storyboard QA Skill.
4. Storyboard Revision Skill.
5. Image Prompt Builder Skill.
6. Image Prompt QA Skill.
7. Image Quality QA Skill.
8. Human review gate for storyboard and image.
9. Skill run trace persistence.
10. QA result persistence.
11. Max-attempt loop controls.

Video/audio QA should not be required in the first sprint because image QA proves the loop architecture quickly.

---

## 24. MVP Definition of Done

MVP is complete when:

1. User can create a Storyboard Studio run from a campaign brief.
2. Storyboard Prompt Builder Skill creates a structured prompt.
3. Storyboard Generation Skill returns valid structured storyboard JSON.
4. Storyboard QA Skill scores and comments on the storyboard.
5. Storyboard Revision Skill can revise failed storyboard items using QA comments.
6. Human review can pause and approve/reject storyboard.
7. Image Prompt Builder Skill creates one image prompt per scene.
8. Image Prompt QA Skill can approve or request prompt rewrite.
9. Existing SmartSpecPro media generation creates images from approved prompts.
10. Image Quality QA Skill reviews generated image assets.
11. Failed image QA can trigger same-prompt regenerate or prompt rewrite according to recommended action.
12. Max attempts are enforced.
13. Skill run traces and QA results are persisted.
14. Existing Media Studio generation flows remain unchanged.
15. A new `/storyboard-studio` UI page exists.
16. Dashboard links to `Storyboard Studio` when the feature flag is enabled.
17. Dashboard hides `Storyboard Studio` when the feature flag is disabled.
18. Existing `/storyboard-review` remains usable and distinct from Storyboard Studio.
19. English and Thai i18n strings exist for the Dashboard entry and Storyboard Studio page.
20. Targeted tests cover state transitions, QA routing, human review pause/resume, persistence, route registration, and Dashboard entry visibility.

---

## 25. Full Definition of Done

The full feature is complete when:

1. All storyboard, image, video, speech, music, and generated media QA skills are available.
2. Every prompt type is created by a dedicated skill and reviewed by a dedicated QA skill.
3. Video and audio generated assets are reviewed before continuation.
4. Skill improvement suggestions are generated from repeated QA patterns.
5. Human-approved skill patches create new skill versions.
6. Skill rollback works.
7. Human review can be configured per stage.
8. Stable skills can auto-continue by policy.
9. The pipeline can complete a multi-scene campaign with storyboard, images, videos, speech, audio, QA results, and final review.
10. The system can export or hand off the completed storyboard/media package to existing SmartSpecPro destinations.

---

## 26. Success Criteria

The feature is successful when:

1. Users can create storyboard from brief.
2. Storyboard passes QA before media generation.
3. Every prompt type is produced by a separate skill.
4. Every prompt type is QA-reviewed before generation.
5. Generated media is QA-reviewed before advancing.
6. Failed QA can produce comments and drive rewrite/regenerate loops.
7. Users can review and approve when configured.
8. Skill improvement suggestions are generated from recurring failure patterns.
9. Skill versioning and rollback are usable.
10. Pipeline can gradually move from human-in-the-loop to auto mode after skills stabilize.

---

## 27. Final Architecture Summary

```text
Storyboard Studio = Director Layer
Media Studio = Generation Layer
Skill System = Modular Intelligence Layer
QA Loop = Quality Control Layer
Human Review = Governance Layer
Skill Versioning = Continuous Improvement Layer
```

This makes SmartSpecPro more than a multi-provider media generation surface. It becomes a campaign/story production system with quality control, iterative improvement, traceability, and a path toward safe automation.
