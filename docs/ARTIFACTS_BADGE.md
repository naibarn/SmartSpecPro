# Artifacts Badge

Publishes `badges/artifacts.json` (Shields endpoint) on the `badges` branch.

## Meaning

Derived from `control-plane/src/config.ts` by extracting content-type strings and grouping into:
- **imgN**: count of allowed `image/*` types
- **vidN**: count of allowed `video/*` types
- **docN**: count of allowed doc/text types (`application/pdf`, `text/markdown`, `text/plain`, `application/json`)

Example message:
- `img3 vid1 doc4`
