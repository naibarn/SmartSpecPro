# Deep-plan research — Feature 170

## Research decision

- **Codebase:** required. This is an existing git repository with TypeScript,
  Python, Drizzle, React, worker contracts, provider adapters, and focused test
  suites.
- **Web:** required. Provider capabilities and model versions are time-sensitive
  and the spec names Gemini Omni Flash 1.1, Seedance 2.0/2.5, and MiniMax H3.
- **Testing:** existing Vitest tests for the web app and pytest tests for the
  Python media/provider layer. Use focused tests first, then the narrowest
  relevant workspace suites; do not claim a full monorepo pass from a timeout.
- **SocratiCode:** the MCP transport was unavailable in this session. Research
  used targeted `rg`, symbol-oriented line reads, existing tests, migrations,
  and provider source/configuration as a fallback.

## Codebase findings

### Prompt generation and finalization

- `apps/web/server/services/verticalDramaVideoMotionPromptGeneration.ts`
  currently centers video prompt authoring on a primary image URL and optional
  image URLs. Its vision builder returns image-only `{url, label}` inputs.
- `apps/web/server/services/verticalDramaStoryBible.ts` currently builds
  vision-aware LLM content from image parts; video/audio need a capability-aware
  inspection representation rather than being falsely presented as images.
- The motion prompt path has multiple retries/repairs/judges. They must receive
  the same resolved bundle fingerprint and must not fall back to a pre-finalized
  prompt.
- `apps/web/server/services/verticalDramaVideoPromptFormatter.ts` and the
  render path can add text around persisted prompts. Feature 170 must move all
  semantic composition before the terminal skill and make post-finalization
  formatting text-preserving.
- The latest image-prompt code contains skill-first prompt-mode selection and
  prompt finalization behavior that should be extracted/reused where possible,
  rather than introducing a second final-prompt ownership rule.

### Frames, references, and persistence

- `apps/web/shared/verticalDramaSeries/contracts.ts` already has start/stop
  fields and motion clips with `startFrameAssetId`/`endFrameAssetId`.
- `syncStopFramesOntoMotionPromptClips` projects an approved stop asset ID but
  does not itself prove that an actual stop image is resolved and sent to the
  video provider.
- `apps/web/server/routers/verticalDramaEpisodes.ts` resolves start assets and
  image references in the paid render path, but generic mixed references and
  stop-image transport are incomplete.
- `resolveMediaAssetUrlsByIds` is the existing tenant-scoped resolver and should
  remain the authority for actual media existence, storage precedence, expiry,
  and authorization.
- `apps/web/server/services/verticalDramaShotReferences.ts` stores canonical
  media asset IDs with ordered roles/sources, but the contract and projections
  are image-oriented. Existing `start_frame` rows must project to the temporal
  start slot; `reference`/`barrier_reference` rows become typed references.
- `VerticalDramaStoryboardPanel.tsx` has an image-only shot reference strip with
  image-only drop/upload/preview behavior. It is the primary UI seam for the
  multimodal drop zone while start and stop slots remain separate.
- The generated reference-frame flow is image-only. Its output should map to
  `references[]` with `source: "reference_frame"`, not become a fourth frame
  role.

### Worker and media transport

- `apps/web/shared/verticalDramaMedia/contracts.ts` currently has image frame
  arrays plus singular `referenceVideoAssetId`/`referenceAudioAssetId` fields.
  The new contract needs versioned typed arrays while retaining an old-payload
  reader.
- `apps/web/server/services/mediaGenerationService.ts` already accepts separate
  image/video/audio reference arrays. The canonical ordered bundle should be
  projected to these transport arrays and accompanied by a mapping audit.
- The Python Kie provider already resolves separate reference image/video/audio
  inputs and selects provider modes. Feature 170 should centralize mode
  selection/capability metadata instead of adding model-version branches in
  prompt code.

### Current provider routing evidence

- Existing H3 migration/routing distinguishes text-to-video, image-to-video,
  and reference-to-video. Current app behavior maps no attachments to text,
  one/two images to image-to-video, and three-plus images or any video/audio to
  reference-to-video. The official MiniMax docs confirm H3 supports text,
  image, video, audio, first/last-frame, and multimodal-reference scenarios;
  exact account/provider limits remain runtime configuration.
- Existing Gemini Omni Flash 1.1 code has a restriction around combining
  first/last fields with generic references. Current official Google guidance
  describes Gemini Omni Flash as supporting simultaneous text, image, audio,
  and video inputs. This is a required compatibility reconciliation, not a
  reason to preserve potentially stale application validation.
- Static source did not expose a complete Seedance 2.5 registry entry in every
  path, so exact runtime model keys and access-channel fields must be verified
  from the runtime model catalog before paid enablement.

## Web research

### ByteDance Seedance 2.0

Official announcement:
https://seed.bytedance.com/en/blog/official-launch-of-seedance-2-0

Relevant findings: Seedance 2.0 is described as accepting text, image, audio,
and video; its official announcement states mixed references of up to 9 images,
3 video clips, and 3 audio clips, with natural-language instructions. Use this
as the 2.0 capability-test fixture, but keep runtime provider/account config as
the authority for actual enablement.

### ByteDance Seedance 2.5

Official announcement:
https://seed.bytedance.com/en/blog/one-take-creation-flexible-referencing-introducing-seedance-2-5

Official model page:
https://seed.bytedance.com/en/seedance2_5

Relevant findings: the announcement states up to 30 images, 10 video clips,
and 10 audio clips as reference materials in one pass; the model page describes
reference-video understanding and editing. The API rollout/access channel is
separate from the model announcement, so implementation must verify the exact
runtime model key and provider transport before enabling paid generation.

### MiniMax H3

Official API overview:
https://platform.minimaxi.com/docs/api-reference/api-overview

Relevant findings: MiniMax documents H3 as supporting text-to-video,
image-to-video, first/last-frame, and multimodal-reference video generation,
with text/image/video/audio inputs. The application’s existing H3 routing and
limits must be reconciled with the live provider contract and represented as
capability modes, not inferred from a generic model-family label.

### Gemini Omni Flash and frame control

Official Google video-generation guide:
https://ai.google.dev/gemini-api/docs/video

Relevant findings: Google describes Gemini Omni Flash as a multimodal video
model supporting simultaneous text, image, audio, and video input. The same
guide distinguishes Veo for precise first/last-frame control. Therefore the
adapter must separate “multimodal references” from “native temporal first/last”
and must not assume that Omni Flash’s multimodal input automatically guarantees
stop-frame semantics.

## Architecture decisions derived from research

1. A canonical server-resolved bundle is required because existing client and
   provider transports split modality arrays and existing frame state is partly
   JSON/materialized.
2. Capability profiles must be runtime data with explicit modes, limits, native
   field mapping, and temporal guarantees. Family/version string matching is not
   sufficient.
3. Seedance 2.0 and 2.5 receive separate profiles because their published
   reference ceilings differ substantially.
4. Omni Flash requires a compatibility test against current provider behavior;
   stale app restrictions must be removed or retained only when the runtime
   contract proves they are necessary.
5. Prompt authoring needs two skill boundaries: attachment inspection first and
   terminal provider-specific optimization last. Derived evidence must carry an
   explicit status so the prompt never claims direct inspection.
6. Upload and Library paths must converge to canonical managed media IDs before
   inspection, prompt persistence, or paid dispatch.

## Testing approach

- Web: Vitest with existing `apps/web/server/**/__tests__`, router/service tests,
  and client component/lib tests. Use `npm --workspace apps/web test -- <focused
  test-file>` for targeted proof and `--environment jsdom` for browser-facing
  tests where required.
- Python: pytest in `python-backend/tests`, especially Kie mode routing,
  request-model validation, media security, and provider transport tests.
- Contract tests must cover old/new worker payloads, tenant authorization,
  prompt hash equality, stale revisions, mixed modalities, provider mode
  mapping, and no-paid-dispatch failure paths.
- Browser evidence is required for the drag/drop, Library linking, invalid frame
  drops, pending/error states, and responsive/a11y behavior before claiming the
  UI portion complete.
