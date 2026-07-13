# Research Notes

- `apps/web/scripts/seed-media-models-mcp-providers.ts` is the catalog source and only runs when invoked directly.
- The admin page reads `media_models`; it does not discover provider models at page load.
- The current source includes `higgsfield/seedream_v5_lite` but not Pro, matching the production screenshot.
- Higgsfield publishes Seedream 5.0 Pro as an image model. The established native-id convention is `seedream_v5_pro`.
- A seed upsert preserves the existing enabled state on conflicts; a new row starts enabled.
