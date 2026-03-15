## Goal

Add the visual foundation needed for higher-quality blocks and AI layouts.

## Scope

- typography packs
- font role system
- media masks/frames
- export-safe rendering rules
- v1 allowlisted font catalog only
- future-compatible `fontSource` abstraction without enabling tenant fonts yet
- initial font groups: sans, serif, mono, Thai-capable families
- `fontCatalogVersion` as an explicit invalidation input

## Done When

- typography is selected through packs, not only raw families
- image/video can render through reusable mask/frame shapes
- editor and export stay visually aligned
- the schema cleanly separates pack identity from future font-source expansion
- the initial allowlist is small, license-safe, and deterministic across editor/render/export
