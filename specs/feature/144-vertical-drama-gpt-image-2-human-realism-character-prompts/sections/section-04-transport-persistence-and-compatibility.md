# Section 04 — Transport, persistence, and compatibility

## Scope

Preserve Section 03's normalized request at every external transport and
persistence boundary. Target GPT Image 2, Nano Banana, and Seedream requests
must carry exactly one provider prompt and no `negative_prompt` property.
Legacy/non-target requests retain their existing payload and stored data.

This section does not resolve capability independently, author creative text,
or decide target status from model names. It consumes the trusted normalized
request from Section 03 and adds defense in depth where direct media callers or
transport branches could otherwise leak a negative field.

## Files owned

- `apps/web/server/services/mediaGenerationService.ts` — sync and async
  payload construction and internal request context;
- `apps/web/server/services/mcpMediaAdapter.ts` — MCP envelope preservation if
  its shared payload includes negative data;
- `apps/web/server/services/mcpProviderModelAliases.ts` only if the normalized
  route metadata must pass through its existing alias boundary;
- `apps/web/server/services/hermesMediaScheduler.ts` — normalized prompt passed
  to Hermes queue;
- `apps/web/server/services/hermesMediaReferences.ts` — only if task-envelope
  construction carries the prompt/negative shape;
- `apps/web/shared/verticalDramaSeries/characterProfile.ts` and related
  candidate snapshot serialization only if optional marker fields require type
  updates;
- `apps/web/server/services/mediaGenerationService.test.ts`;
- `apps/web/shared/verticalDramaSeries/characterProfile.test.ts`;
- focused Hermes/MCP/Vertical Drama router payload tests.

Do not rewrite unrelated media transport behavior.

## Media service defense in depth

At the common sync and async image payload boundary in
`mediaGenerationService.ts`:

1. accept the trusted internal character contract/capability context from the
   normalizer or resolve it through the same existing model context only when
   the internal marker is present;
2. if the marker and target capability are present, omit `negative_prompt`
   entirely from the provider object;
3. do not emit `undefined`, empty string, or legacy preset value;
4. preserve the existing negative mapping for all non-target/direct legacy
   requests;
5. keep model, reference-image, provider `apiConfig`, `extraParams`, aspect
   ratio, and retry fields unchanged.

Apply this to both synchronous and `generateImageAsync` payload paths. The
guard is a defense in depth; routers still normalize before credit reservation.
It must be idempotent and safe on retries.

## MCP and Hermes

The Vertical Drama router must pass the normalized request into all three
transport families. For MCP:

- keep existing connection/approval/tenant metadata;
- use the normalized prompt and reference fields;
- omit target negative data from the MCP tool argument/envelope;
- do not change provider alias resolution.

For Hermes:

- keep existing connection resolution, reference ordering, idempotency keys,
  task metadata, and DNA persistence;
- pass the normalized prompt to `queueHermesMediaJob` and the existing task
  envelope builder;
- do not include target negative data in settings or envelope metadata;
- preserve legacy behavior if a non-target caller reaches the scheduler.

Do not add a second capability decision inside these adapters. If a branch
cannot consume the normalized request, adapt its input type at this boundary
without reconstructing the prompt.

## Persistence compatibility

Keep optional legacy negative fields in approved snapshots, character profiles,
and candidate drafts. Add the optional current prompt-contract marker only in
existing JSON/type surfaces when needed:

```text
vd_character_natural_human_v1
```

Compatibility rules:

- old records without the marker deserialize successfully;
- old negative values are readable and never bulk-deleted;
- current target records can persist/read the marker;
- target reuse is allowed only for current compatible marker/profile;
- stale records regenerate in the existing skill-generation service or fail
  with an actionable error before provider/credit work;
- target provider request has no negative property even if stored legacy data
  contains one;
- non-target/legacy reuse keeps current shape and behavior.

Avoid a database migration unless an existing JSON type cannot represent these
optional values. Any catalog refresh is idempotent and must not delete models or
character prompts.

## TDD-first tests

### Media payload tests

Extend `mediaGenerationService.test.ts` or its focused payload suites:

- sync target payload contains prompt and no `negative_prompt` property;
- async target payload contains prompt and no `negative_prompt` property;
- non-empty, empty, and undefined legacy negative values are all omitted for
  target requests;
- legacy/non-target sync and async payload snapshots retain negative mapping;
- retries cannot restore target negative data;
- model/reference/provider config fields are unchanged.

Assert property absence rather than only checking a value is undefined.

### Hermes/MCP tests

- target MCP tool arguments/envelopes omit negative property;
- target Hermes settings/task envelope omit negative property;
- reference ordering, connection metadata, task idempotency, and existing
  error mapping remain unchanged;
- non-target Hermes/MCP request behavior remains compatible.

### Persistence tests

Extend `characterProfile.test.ts` and candidate serialization tests only when
types change:

- old snapshot without marker round-trips;
- old negative value remains readable;
- current marker round-trips;
- target reuse never sends stored negative;
- stale marker selects regeneration/rejection at the Section 02/03 boundary;
- no destructive migration behavior is introduced.

## Failure handling and security

- Existing authentication, tenant isolation, MCP approval, Hermes connection,
  and credit authorization remain authoritative.
- Transport failure keeps existing provider retry/credit settlement semantics.
- Prompt capability/length errors are raised before the transport and never
  consume provider work.
- Do not log full prompt, negative text, reference data, or secrets. Bounded
  metadata may record model ID, family, cap, prompt length, profile, retry count,
  `negative_prompt_submitted=false`, and contract version.
- Public media input cannot spoof the internal character marker/capability.

## Exit criteria

- Sync/async media, Hermes, and MCP target payloads omit `negative_prompt`.
- Legacy/non-target payloads and persisted records remain compatible.
- Stale records never bypass the prompt-contract regeneration/rejection rule.
- Focused transport and persistence tests prove property-level omission and no
  paid work on preflight errors.

## Implementation notes

- Added a server-only `characterPromptContext` to image-generation requests.
  The common sync and async Python payload builders use it as defense in depth:
  a trusted target request omits `negative_prompt` as a property, while direct
  legacy requests keep the existing mapping.
- Vertical Drama portrait, candidate, and sheet gateway/MCP-facing requests
  now carry the marker/context only after the shared normalizer has completed;
  Hermes receives the already-normalized prompt and no negative field.
- Approved snapshots and candidate visual-bible JSON retain optional legacy
  negative data and now accept optional prompt contract/profile metadata without
  requiring a migration or deleting historical records.
