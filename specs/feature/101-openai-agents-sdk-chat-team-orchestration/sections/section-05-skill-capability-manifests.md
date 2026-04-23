# Section 05: Skill Capability Manifests

## Purpose

Make skill selection capability-driven. The runtime should choose skills based on structured metadata, not free-form names or prompt hints.

## Depends On

- `section-01-shared-contracts-flags`

## Blocks

- Chat integration
- Team integration
- Rollout gates

## Files Owned By This Section

- `apps/web/shared/agentRuntime/skillManifest.ts`
- `apps/web/server/services/skillCapabilityManifestService.ts`
- existing skill registry files that currently define skill metadata
- manifest fixture files if the repo uses static metadata files
- `apps/web/shared/__tests__/skillCapabilityManifest.test.ts`
- `apps/web/server/services/__tests__/skillCapabilityManifestService.test.ts`
- tests for the initial high-priority skill manifests

## Manifest Schema

Every runtime-selectable skill must declare:

- `skillSlug`
- `skillName`
- `manifestSchemaVersion`
- `purpose`
- `surfaceSupport`
- `supportedOriginSurfaces`
- `supportedEntryPoints`
- `taskTypes`
- `requiredContext`
- `preferredContext`
- `inputs`
- `outputs`
- `supportedArtifactTypes`
- `evidenceRequired`
- `reviewChecklist`
- `failureModes`
- `doNotUseWhen`
- `requiredConnectors`
- `writeScope`
- `sideEffectClass`
- `dataSensitivity`
- `executionMode`
- `isReadOnly`
- `riskTier`
- `latencyBudget`
- `tokenBudget`
- `defaultToolBudget`
- `humanApprovalRequired`
- `allowedModelFamilies`
- `completionSignals`
- `selectionSignals`
- `negativeSignals`
- `requiredEvidenceKinds`
- `reviewerProfile`
- `repairStrategy`
- `supportsRepairLoop`
- `ownerTeam`
- `ownerCodeownersPath`
- `ownerReviewCadence`

## Registry/Loader

Implement a manifest service that can:

- load manifests for candidate skills
- validate manifests
- filter by surface
- filter by task type
- filter by risk and approval policy
- detect missing required fields
- produce a candidate bundle for `AgentRuntimeRequest`
- produce diagnostics when a skill is missing manifest data

If the existing skill registry already has metadata, extend that registry. Avoid creating a disconnected second source of truth.

## Initial Skill Coverage

Prioritize manifests for:

- planning/decomposition
- research
- writing/copy
- storyboard/script
- video prompt generation
- image/media prompt generation
- Media Studio prompt enhancement and custom skill execution paths
- review/QA
- final handoff/publishing
- general article/writing skills that currently get selected incorrectly
- schema-enforced structured-output skills used by Responses/shared runtime callers

Explicitly exclude from Feature 101 active routing in round one:

- skills whose primary responsibility is submitting or polling actual media generation jobs
- direct image/video/audio generation pipeline stages

## Selection Explanation

The runtime needs enough metadata to explain:

- why this skill was selected
- which alternatives were rejected
- which selection signals matched
- which negative signals were avoided
- what evidence was missing
- whether approval was required

The manifest service should support producing this explanation data or enough data for the adapter to return it.

## Active Mode Readiness

Active Chat/Team runtime must fail closed when a required manifest is missing for a selected runtime path.

Shadow mode can record diagnostics instead:

- missing manifest
- incomplete manifest
- missing negative signals
- missing review checklist
- missing required evidence kinds
- missing owner or code ownership metadata
- unsupported `originSurface` or `entryPoint` for the caller path

## TDD Tests To Write First

Schema tests:

- Test valid manifest passes.
- Test missing `failureModes` fails.
- Test missing `doNotUseWhen` fails.
- Test mutating skill without `sideEffectClass` fails.
- Test connector-dependent skill without `requiredConnectors` fails.
- Test invalid surface support fails.
- Test invalid risk tier fails.
- Test missing `ownerTeam` fails.
- Test missing `ownerCodeownersPath` fails.
- Test Media Studio prompt skill without `supportedOriginSurfaces` or `supportedEntryPoints` fails.

Service tests:

- Test loader returns manifests for known skill ids/slugs.
- Test loader filters by Chat surface.
- Test loader filters by Team surface.
- Test loader filters by Responses surface.
- Test loader filters by shared skill surface.
- Test loader filters by Media Studio origin surface for prompt/custom-skill entry points.
- Test loader filters out missing approval for mutating skill.
- Test diagnostics are produced for incomplete manifest.

Selection tests:

- Test matching task type increases suitability.
- Test required context mismatch rejects or lowers suitability.
- Test `doNotUseWhen` prevents selection.
- Test negative signals reduce ranking.
- Test required evidence kinds influence selection.
- Test explanation includes selected skill and rejected alternatives.

Coverage tests:

- Test high-priority Chat/Team/Responses/shared-skill skills have manifests.
- Test Media Studio prompt-enhancement and custom-skill paths have manifests before active shared-skill mode can be enabled for that origin.
- Test active mode blocks missing manifest.
- Test shadow mode records missing manifest diagnostic.

## Implementation Notes

- Keep the schema strict enough to improve quality, but allow incremental rollout by gating active mode.
- Do not write SDK code in this section.
- Do not implement final ranking as a black box. Persist enough explanation data for debugging.
- Avoid hardcoded model ids; use model families or capabilities.

## Acceptance Criteria

- Manifest schema exists and is tested.
- Candidate manifest loading exists.
- Missing/incomplete manifest behavior differs correctly between shadow and active modes.
- Initial high-priority skills have manifests or explicit tracked diagnostics.
- Initial Media Studio prompt-skill manifests are covered, while real media-generation skills remain explicitly excluded from Feature 101 active routing.
- Skill selection becomes explainable from structured metadata.
- Active manifests carry ownership metadata and explicit origin/entry-point support where applicable.
