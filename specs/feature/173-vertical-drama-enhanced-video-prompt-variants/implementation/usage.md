# Enhanced video prompt variants — usage guide

## Start Frame continuity behavior

Enhanced analyzes the approved Start Frame as authoritative State #0 before it
authors motion. A regenerated Enhanced preview therefore continues from the
visible pose, hand occupancy, object location, camera, and blocking instead of
replaying storyboard actions that have already happened in the image.

If a Legacy prompt already contains `frameAnalysis`, Enhanced passes it as
supporting evidence only; the current approved image remains authoritative.
Shots with no canonical dialogue are emitted as silent acting beats. Existing
Enhanced variants are not rewritten automatically—press **สร้างพรอมต์วิดีโอ
(Enhanced)** again to produce a variant with the current continuity policy, then
review it before selecting **ใช้ prompt นี้**. Legacy remains unchanged.

## Quick start

The feature is deliberately off by default. Configure it from Admin UI only:

1. Admin Settings → Infrastructure → Vertical Drama Enhanced Runtime:
   choose an authoring model marked Vision + Structured Output, save the
   settings, run the runtime probe, and approve the current runtime.
2. Admin → Tenants → Feature Flags: enable
   `verticalDramaEnhancedVideoPromptUi`,
   `verticalDramaEnhancedVideoPromptJobs`, and
   `verticalDramaEnhancedVideoPromptApply` for the intended tenant.

Enhanced does not require `VD_ENHANCED_*` values in `.env`. The server owns the
bridge command and skill path, probes the isolated SDK runtime, and resolves
provider credentials from the encrypted Provider Settings store only for the
short-lived bridge process.

### Local Beta prerequisite (Debian Linux)

The current Beta target is a local Debian Linux node-api process; Cloud Run is
not required. Install `uv` on the host, then let the skill's isolated project
install its locked dependencies:

```bash
cd apps/web/skills/generic-commercial-video-director
uv sync --frozen --no-dev
uv run --frozen --project . python -m smartaihub_video_director.enhanced_bridge --health
```

The expected health response reports SDK `0.22.0`, adapter `1.0.0`, and skill
`11.0.0`. Restart the local `node-api` process after installing or changing
the skill. System-level `pip` is not required because `uv` owns the isolated
environment. The Dockerfiles retain the same installation and health gate for
a future packaged deployment, but they are not part of the current Beta run.

## UI flow

1. Open a Vertical Drama episode Storyboard.
2. Use the existing Legacy button or the adjacent Enhanced button.
3. Enhanced produces a preview in the same prompt surface and does not change
   the active render projection.
4. Select a variant to view it, then explicitly Apply or Restore Legacy.
5. For split shots, use group Apply; incomplete or stale groups are rejected
   atomically.
6. The server shows a conservative estimate, blocks insufficient balance
   before the Agent call, and settles actual bridge-reported token usage.

## Server entry points

- `verticalDramaEpisodes.getEnhancedVideoPromptReadiness`
- `verticalDramaEpisodes.generateEnhancedShotVideoPrompt`
- `verticalDramaEpisodes.getEnhancedShotVideoPromptJob`
- `verticalDramaEpisodes.getActiveEnhancedVideoPromptJobs`
- `verticalDramaEpisodes.updateVideoPromptVariant`
- `verticalDramaEpisodes.finalizeVideoPromptVariant`
- `verticalDramaEpisodes.applyVideoPromptVariant`
- `verticalDramaEpisodes.applyVideoPromptVariantGroup`
- `verticalDramaEpisodes.restoreLegacyVideoPromptVariant`

## Model policy

Image/reference models and the video target are separate roles. The Enhanced
authoring model must be vision-capable and support structured outputs; the
target must be a server-selected, catalogued video model with a provider
profile and capability fingerprint. The
Enhanced request includes transient authorized Start/Stop/image references for
vision grounding, but persists no provider URLs. It carries no fallback model
and never silently falls back to Legacy.

## Verification

Run the focused suite with:

```bash
JWT_SECRET=test-jwt-secret-32-chars-minimum-1234567890 \
  npm --workspace apps/web test -- \
  shared/verticalDramaSeries/videoPromptVariants.test.ts \
  shared/verticalDramaEnhancedVideoPromptFlags.test.ts \
  server/services/__tests__/verticalDramaEnhancedVideoPrompt.test.ts \
  server/services/__tests__/verticalDramaShotVideoPromptJobs.test.ts
```

The isolated skill runtime regression can be run with:

```bash
uv run --project apps/web/skills/generic-commercial-video-director \
  python apps/web/skills/generic-commercial-video-director/tests/test_agent_runtime_v11.py
```
