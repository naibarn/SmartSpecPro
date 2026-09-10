# GPT Image 2.5 Unified Media Models Design

Date: 2026-09-09
Status: approved for implementation

## Goal

Add two Kie.ai image model choices to the SmartAIHub media catalog:

- GPT Image 2.5 Flare
- GPT Image 2.5 Sunburst

Each choice is one catalog row. The user does not choose a separate
Text-to-Image or Image-to-Image row. The provider operation is selected from
the request shape: no attached image uses the text-to-image Kie model; one or
more attached images uses the image-to-image Kie model.

Both rows use the same flat price as GPT Image 2: 70 credits per image.

## Existing context

The repository already has the required two-way routing contract:

- `modelRegistry.ts` and `seed-media-models-kie-ai.ts` describe one canonical
  model and its optional reference-image input.
- `mediaGenerationService.ts` forwards the model `apiConfig` to the provider.
- `kie_ai_provider.py` resolves `kie_model_id_with_references` when the
  normalized reference-image list is non-empty, otherwise it retains the base
  `kieModelId`.
- GPT Image 2 and Seedream 5 Pro provide established catalog, migration, and
  focused-test patterns for this behavior.

The worktree is intentionally dirty with unrelated user changes. The
implementation must edit only task-owned catalog, migration, and test files,
and must not rewrite the active character-prompt design or existing feature
artifacts.

## Model contract

| Catalog row | Canonical Kie model | Reference-image Kie model | Price |
| --- | --- | --- | --- |
| GPT Image 2.5 Flare | `gpt-image-2-5-flare-text-to-image` | `gpt-image-2-5-flare-image-to-image` | 70 |
| GPT Image 2.5 Sunburst | `gpt-image-2-5-sunburst-text-to-image` | `gpt-image-2-5-sunburst-image-to-image` | 70 |

The canonical SmartAIHub model IDs are the text-to-image IDs above. The
image-to-image IDs are aliases and provider-only routing targets, not separate
catalog rows.

Each row declares:

- provider `kie.ai`, image model type, enabled status, and a stable priority;
- Kie create-task endpoint and market payload format;
- `generateType: "text-to-image"` for catalog compatibility;
- optional `input_urls` reference images, represented as an image URL array,
  with a maximum of 16 files;
- the GPT Image 2.5 aspect-ratio set documented by Kie and resolution values
  `1K`, `2K`, and `4K`;
- the existing provider reference routing config using
  `kie_model_id_with_references`, `reference_image_input_key: "input_urls"`,
  and array input type.

The rows may expose a background/transparent control only where the Kie
contract and the existing catalog form support it. This feature does not add a
new cross-model UI abstraction for that control.

## Data flow

```text
Media Studio / API request
  -> canonical SmartAIHub model row
  -> mediaGenerationService forwards apiConfig
  -> provider normalizes reference_image_urls
       -> empty:  gpt-image-2-5-*-text-to-image
       -> nonempty: gpt-image-2-5-*-image-to-image + input_urls[]
  -> Kie createTask
```

The existing resolver remains the single runtime decision point. No client
heuristic may rewrite the model ID based on a display label, and no silent
fallback to another image provider is introduced.

## Persistence and compatibility

Update the static registry and Kie seed in parity. Add a new idempotent SQL
migration that inserts or updates exactly these two rows without deleting
legacy rows or changing unrelated admin-maintained model configuration.

Before choosing the migration filename and journal index, inspect the current
worktree's user-owned migration `0288_feature_184_video_editor_revisions.sql`.
Do not overwrite it or assume it is safe to modify. The new migration must use
the next valid ledger slot after the existing migration state.

Existing GPT Image 2, Seedream, provider reference upload, credit reservation,
and async polling behavior remains unchanged. This catalog addition does not
initiate paid Kie requests, change credit formulas, or require new environment
variables.

## Failure handling and safety

- Empty or missing image references route to text-to-image.
- Non-empty valid image references route to image-to-image and are sent as
  `input_urls`.
- The existing reference URL validation/ownership path remains authoritative;
  this feature does not accept arbitrary provider task IDs or bypass managed
  media authorization.
- A malformed catalog config must fail through existing provider behavior and
  tests rather than silently selecting a different model.
- Provider availability and real generation acceptance are separate from local
  catalog verification and will remain unclaimed unless explicitly tested with
  credentials.

## Verification

Add focused tests for:

1. registry/seed parity for both rows, exact Kie IDs, 70-credit pricing,
   optional `input_urls`, and max 16 references;
2. no-reference routing to each text-to-image Kie model;
3. one-reference routing to each image-to-image Kie model with an array
   `input_urls` payload;
4. absence of separate image-to-image catalog rows;
5. migration registration and idempotent, non-destructive update shape.

Run only focused TypeScript/Python tests and applicable static checks first.
Full typecheck may be baseline-noisy in this worktree and must be reported
separately if it fails. No deployment, service restart, browser replay, or paid
provider call is part of this change.

## External references

- Kie GPT Image 2.5 Flare: https://kie.ai/gpt-image-2-5
- Kie Flare text-to-image API: https://docs.kie.ai/43283988e0
- Kie Flare image-to-image API: https://docs.kie.ai/43285205e0
- Kie Sunburst text-to-image API: https://docs.kie.ai/43287106e0
- Kie Sunburst image-to-image API: https://docs.kie.ai/43287109e0
