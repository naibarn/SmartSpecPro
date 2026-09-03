# Feature 173 research record

## Research decision

- Codebase research: required. The repository is an existing TypeScript/Vitest
  application with a large Vertical Drama router and client page.
- Web research: required for the named OpenAI Agents SDK integration. The
  authoritative source consulted was the OpenAI Agents SDK Python guide:
  https://openai.github.io/openai-agents-python/agents/
- Testing research: the application uses Vitest for server, shared-contract,
  and React tests (`npm --workspace apps/web test -- ...`). The target skill
  package has Python tests, but the current environment does not provide the
  `pytest` command; package-level Python verification therefore remains a
  separate readiness gate.

## Codebase findings

### Existing Vertical Drama boundary

- `apps/web/shared/verticalDramaSeries/contracts.ts` owns shared field-only
  contracts. `VerticalDramaMotionPromptPack` currently projects prompt,
  negative prompt, dialogue, audio, model target, motion profile, QC, and
  `videoTask` fields into one clip object.
- `apps/web/shared/verticalDramaShotMedia.ts` already provides the Feature 170
  `VideoShotMediaBundle` with typed image/video/audio references, start/stop
  frames, ordered references, and a deterministic SHA-256 fingerprint. Feature
  173 must reuse it rather than creating a second media contract.
- `apps/web/server/routers/verticalDramaEpisodes.ts` contains the existing
  `generateShotVideoPrompt`, split-shot persistence, `updateEpisodeDraft`,
  active-job polling, model selection, and many motion-pack writers. The
  existing Legacy mutation and client callback are compatibility boundaries.
- `apps/web/client/src/pages/VerticalDramaEpisodePage.tsx` owns the existing
  Legacy per-shot submit/poll state and passes storyboard data to
  `VerticalDramaStoryboardPanel`. The safest UI extension is additive: a
  separate Enhanced state machine and mutation while retaining the Legacy
  handler and payload.
- Existing `updateEpisodeDraft` accepts a JSONB-shaped motion pack. This allows
  additive storage, but a shared validator and clip-scoped merge helper are
  required so older whole-pack writers cannot erase variant metadata.
- Existing tests include dedicated Legacy generation, split-shot generation,
  prompt-language, model-selection, media-reference, contract-preservation,
  and UI component coverage. New tests should follow the same direct-router
  handler mocking and React Testing Library patterns.

### Skill package findings

- `apps/web/skills/generic-commercial-video-director/skill.manifest.json` and
  `pyproject.toml` declare `openai-agents>=0.22.0,<0.23`, while the app runtime
  is independently pinned to `openai-agents==0.21.1` in the current server
  environment. This is a real readiness blocker for in-process execution.
- The package is hybrid and schema-driven. It has stage schemas, Pydantic
  envelopes, guardrails, tracing, checkpoint, provider adapters, and declared
  read-only tools. The package config exposes tool flags, but the current
  `build_read_only_tools()`/`AgentFactory` path constructs all four tools
  without a Core-owned per-request allow-list, so the adapter must enforce the
  allow-list outside package defaults before enabling production use.
- The package input defaults are intentionally permissive for a generic
  commercial workflow (`modelRouting=auto`, fallback allowed, research auto,
  `plan_only` default). Vertical Drama must override these fields with one
  exact server-selected video model, no fallback/cross-provider fallback, and
  canonical Drama dialogue/media.
- The package has provider-specific prompt compilers and capability profiles;
  these should be used only after the Agent returns provider-neutral structured
  intent. The Agent must not emit provider API payloads or paid side effects.

### User-provided guide findings

The attached Generic Commercial Video Director v11 guide defines the same
authority split needed here: SmartAIHub Core owns workflow/database/credits/
approval/provider jobs; Agents SDK supplies bounded stage reasoning; stage
schemas are structured contracts; provider profiles/adapters are provider truth.
It also requires explicit model resolution, read-only tools, no free-form state
machine handoff, durable checkpoints, asset authorization, idempotency, plan
hashes, separate token and provider-credit budgets, and bounded repair.

The guide explicitly distinguishes image/start-frame, authoring/reasoning, and
video-generation models. A same-provider connection is not evidence that the
models are interchangeable. Feature 173 adopts this distinction and persists
the three roles separately.

### Official OpenAI documentation finding

The official Agents SDK guide documents that an Agent is configured with
instructions, tools, guardrails, and structured `output_type`; `Runner` manages
bounded turns while the application remains responsible for orchestration. It
also documents that tools can be constrained and lifecycle hooks can observe
usage. Source: https://openai.github.io/openai-agents-python/agents/

This supports using the SDK only behind an isolated adapter and using a
structured output contract. It does not justify moving authorization, billing,
or provider submission into the Agent.

## Research decisions applied to the plan

1. Additive JSONB metadata is preferable to a new migration in v1 because the
   existing episode motion pack is already JSONB and Legacy must remain
   byte-compatible.
2. Store the canonical variant store on each clip; derive any group projection
   for the UI from the ordered clips. This avoids a second source of truth.
3. Keep generation and Apply as separate operations. Generation writes only a
   preview; Apply performs CAS-guarded projection and is free.
4. Keep image, authoring, and video model IDs and capability snapshots separate.
5. Keep runtime readiness fail-closed. A package/SDK mismatch disables only
   Enhanced and never silently invokes Legacy.
6. Use a bounded single staged run in v1; do not fan out nine shots or run
   best-of-N generation from the Enhanced button.

## Verification limitations

- SocratiCode MCP was unavailable in this session, so targeted `rg` and
  line-range reads were used after the failed active-index check.
- No live provider call, production deployment, browser session, or Python
  package test was used as evidence during planning. Those are implementation
  and rollout gates, not assumptions.
