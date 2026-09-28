# Kie GPT Image 2 Automatic Mode Routing

Date: 2026-07-20
Status: Approved

## Problem

Kie.ai exposes GPT Image 2 as two upstream model IDs:

- `gpt-image-2-text-to-image`
- `gpt-image-2-image-to-image`

SmartSpecPro currently exposes both records to users. This forces users to choose
a mode before they know whether they will attach a reference image.

## Goal

Expose one selectable `GPT Image 2` entry. Route requests automatically:

- no reference images: `gpt-image-2-text-to-image`
- one or more reference images: `gpt-image-2-image-to-image`, with the images in
  `input.input_urls`

The behavior must be opt-in for this catalog record and must not change any other
media model.

## Architecture

Keep the existing `gpt-image-2-text-to-image` database record as the canonical
SmartSpecPro model ID. Rename only its display name to `GPT Image 2`, add optional
reference-image capability, and attach explicit provider-routing metadata.

The canonical record retains `kieModelId: gpt-image-2-text-to-image` as its
default. Its nested `apiConfig` adds:

- `kie_model_id_with_references: gpt-image-2-image-to-image`
- `reference_image_input_key: input_urls`
- `reference_image_input_type: array`

The Kie image provider resolves the default model as it does today. When normalized
`reference_image_urls` are non-empty and the explicit
`kie_model_id_with_references` metadata exists, it uses that upstream model ID.
It does not infer variants from model names.

## Catalog And Compatibility

The canonical row will contain aliases for the short name and both legacy mode
IDs. The separate `gpt-image-2-image-to-image` row will be disabled.

Existing behavior remains compatible:

- saved `gpt-image-2-text-to-image` selections remain exact canonical matches;
- saved `gpt-image-2-image-to-image` selections match the enabled canonical
  row through its aliases;
- callers using `gpt-image-2` continue to resolve through the canonical row;
- tasks, history, billing, and saved selections keep the canonical SmartSpecPro
  model ID while Kie receives the resolved upstream variant.

The seed script must mirror the migration so a later catalog reseed cannot
reintroduce two enabled choices.

## User Experience

Selectors show one enabled item named `GPT Image 2`. Its reference-image input is
optional and supports at most four images. Attaching or removing all images does
not change the selected model in the UI.

No new responsive layout, interaction state, or accessibility behavior is
introduced. Existing upload, validation, and model-selector components are reused.

## Failure Handling

- Empty or missing reference lists use text-to-image.
- A configured reference variant is used only when the list is non-empty.
- Models without the opt-in metadata retain their existing provider-model
  resolution even when reference images are supplied.
- Existing reference-image limits and public URL resolution continue to run
  before the Kie provider call.

## Testing

Add focused Python unit tests proving:

1. canonical GPT Image 2 without references uses text-to-image;
2. canonical GPT Image 2 with references uses image-to-image and `input_urls`;
3. a non-opt-in Kie model remains unchanged with references;
4. existing explicit `kieModelId` behavior remains unchanged.

Add a migration contract check or targeted SQL inspection proving the canonical
row is enabled with merged aliases and the legacy image-to-image row is disabled.

## Non-Goals

- Generic automatic variant discovery based on model names.
- Changing pricing or credits.
- Migrating the canonical SmartSpecPro model ID to `gpt-image-2`.
- Applying the behavior to other text/image model pairs.
- Changing Kie endpoints, polling, callbacks, or provider authentication.
