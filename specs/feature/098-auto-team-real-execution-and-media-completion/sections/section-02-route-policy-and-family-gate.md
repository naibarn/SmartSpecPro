# Section 02: Route Policy and Family Gate

## Goal

Classify each Auto-Team objective into a route class and prevent the wrong family of skills or providers from doing production work. This is the section that directly prevents a video request from being completed by article-writing skills.

## Dependencies

- Section 01 must provide shared route/capability contracts and schema exports.

## Files to Create or Modify

- Create `apps/web/server/services/autoTeamRoutePolicy.ts`
- Modify `apps/web/server/services/teamRunSkillExecutor.ts`
- Modify `apps/web/server/services/unifiedOrchestrator.ts` only if capability-family mapping needs small alignment
- Create `apps/web/server/services/__tests__/autoTeamRoutePolicy.test.ts`
- Create `apps/web/server/services/__tests__/teamRunSkillExecutor.routeGate.test.ts`

## TDD First

Write tests before implementation.

### Route Classification Tests

In `autoTeamRoutePolicy.test.ts`, cover:

- "create a 24-30 second Songkran video using Veo 3.1" returns `media.video`
- objective with "generate image", "cover image", or "illustration" returns `media.image`
- objective with "coordinate multiple agents", "multi-team", or similar complex cross-role work returns `agency.swarm` when agency is available
- objective with "research and summarize" returns `research.synthesis`
- objective with "write article/report" returns `document.writing`
- unsafe or empty objective returns `unknown.blocked`
- route classification extracts provider/model hints such as `veo 3.1` without losing them
- route decision includes `allowedCapabilityFamilies`, `routeConfidence`, `decisionReason`, and `language`

### Family Gate Tests

In `teamRunSkillExecutor.routeGate.test.ts`, cover:

- `writing.article` skill is rejected for `media.video`
- video prompt family is allowed for prompt/storyboard stage but not final completion
- media video provider family is allowed for media submit stage
- image prompt family is allowed for image prompt stage but not final completion
- wrong family returns `route_skill_family_mismatch` with sanitized user message
- `executeUnified()` receives `capabilitiesAllowed` that match the route and stage

## Route Policy Design

`autoTeamRoutePolicy.ts` must export:

- `classifyAutoTeamRoute(input)`
- `getAllowedCapabilityFamilies(routeClass)`
- `getRequiredStagePlan(routeClass)`
- `assertCapabilityAllowedForStage(input)`
- `buildRouteDecisionIdempotencyKey(input)`
- `toRouteBlockedReason(error)`
- `extractProviderModelHints(input)`

Inputs must include:

- `tenantId`
- `teamId`
- `roomId`
- `runId`
- `workRequestId`
- `workCaseId`
- `objective`
- `requestTitle`
- `requestSummary`
- `workType`
- `language`
- requested provider/model hints
- `availableCapabilities`
- `teamPersonas`

Classification must be deterministic and testable. Start with explicit rules and only use an LLM classifier later if the repo already has a safe classification boundary. Regex/keyword rules are acceptable for the first implementation because they close the production failure quickly.

## Route Class Rules

### `media.video`

Match if objective/request indicates:

- video, clip, storyboard-to-video, Veo, Runway, Kling, Pika, Sora, or similar video generation
- duration like seconds/minutes attached to visual generation
- request asks to create/generate/render video

Allowed production families:

- `media.video`
- `video.prompt`
- `research.synthesis`
- `writing.review`

Disallowed as primary/final:

- `writing.article`
- `document.writing`
- generic chat-only output

### `media.image`

Match if objective/request indicates:

- image, picture, illustration, poster, cover, thumbnail, logo, visual, mockup
- prompt-to-image generation

Allowed families:

- `media.image`
- `image.prompt`
- `research.synthesis`
- `writing.review`

### `agency.swarm`

Match if objective/request indicates:

- complex multi-agent collaboration
- many roles or departments
- tool chains that should be delegated to Agency Swarm
- an existing agency template is clearly better than a single skill turn

Allowed families:

- `orchestration.swarm`
- `research.synthesis`
- `writing.review`

### `workflow.automation`

Match if objective/request indicates:

- repetitive workflow execution
- API/integration automation
- non-media operational actions

Allowed families:

- `workflow.automation`
- `research.synthesis`
- `writing.review`

### `research.synthesis`

Match if objective/request asks only to research, compare, summarize, or synthesize.

Allowed families:

- `research.synthesis`
- `writing.review`

### `document.writing`

Match if objective/request asks for written deliverables without media execution.

Allowed families:

- `document.writing`
- `research.synthesis`
- `writing.review`

### `unknown.blocked`

Use when objective is empty, unsafe, impossible, or route cannot be confidently selected.

Allowed families:

- none for production execution

## Family Mapping

Align with `unifiedOrchestrator.ts` capability classification. If existing names differ, add a normalizer in `autoTeamRoutePolicy.ts` rather than scattering string conversions.

Examples:

- `media.video`: video provider execution
- `video.prompt`: video prompt/storyboard skill
- `media.image`: image provider execution
- `image.prompt`: image prompt skill
- `writing.article`: article/blog/general writing skill
- `document.writing`: report/document generation
- `writing.review`: critique/reviewer skill
- `orchestration.swarm`: agency/swarm execution
- `research.synthesis`: research/summarizer skill

## Integration With `teamRunSkillExecutor.ts`

Before executing a skill/provider turn:

1. Load or receive the route decision for the run.
2. Determine the current stage's expected capability family.
3. Resolve the candidate skill/provider as current code does.
4. Normalize the candidate capability family.
5. Call `assertCapabilityAllowedForStage()`.
6. If allowed, call `executeUnified()` with `capabilitiesAllowed`.
7. If blocked, return a structured blocked result and do not call the wrong skill.

The blocked result must include:

- `ok: false`
- `code: "route_skill_family_mismatch"`
- `routeClass`
- `expectedCapabilityFamily`
- `actualCapabilityFamily`
- sanitized `userMessage`
- diagnostic metadata for server logs

## Route Decision Persistence

This section can expose a route-decision object but actual persistence can be owned by Section 03's execution service. Keep the boundary clean:

- Section 02 classifies and validates.
- Section 03 persists and coordinates.

## Security Requirements

- Do not trust client-supplied route class.
- Do not trust client-supplied capability family.
- Server must derive route and capability family from trusted request/run/skill metadata.
- Never leak provider secrets in blocked diagnostics.
- Sanitize blocked reasons shown in room messages and Work OS.

## Acceptance Criteria

- A video request cannot execute or complete through article writing.
- Route classification is deterministic and tested.
- Wrong capability family produces a durable block reason for Section 03 to persist.
- `executeUnified()` receives a route-specific `capabilitiesAllowed` value for gated calls.
- Tests prove the exact prior failure route is blocked.

## Recommended Verification

Run:

```bash
npm --prefix apps/web test -- server/services/__tests__/autoTeamRoutePolicy.test.ts server/services/__tests__/teamRunSkillExecutor.routeGate.test.ts
npm --prefix apps/web run check
```
