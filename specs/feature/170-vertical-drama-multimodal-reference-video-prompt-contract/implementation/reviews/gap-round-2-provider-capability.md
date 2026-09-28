# Post-implementation gap review 2 — provider capability and transport

Date: 2026-08-31

Scope: Omni Flash 1.1, Seedance 2.0/2.5, MiniMax H3 modes, new provider
versions, mixed references, frame semantics, limits, and native field maps.

Checks:

- `verticalDramaVideoCapabilityProfile.test.ts`: passed, including mixed
  media, unsupported stop semantics, invalid profiles, and stop-without-start.
- Migration read-through confirmed H3 text-to-video, image-to-video, and
  reference-to-video modes plus Seedance family profiles.
- Provider transport read-through confirmed typed image/video/audio arrays are
  forwarded to the Kie/Python adapters without collapsing them into one image
  array.

Findings and actions:

- MUST_FIX: H3 had no explicit text-to-video capability mode, so a no-asset
  shot could be incorrectly classified as image-to-video. Added the mode.
- MUST_FIX: a stop frame without a real start frame could pass a permissive
  mode. Capability selection now fails closed.
- MUST_FIX: frame transport keys were hardcoded in the router. They now come
  from the selected mode's `nativeFieldMap`, with legacy defaults only when no
  profile exists.
- NICE_TO_HAVE: new provider versions must publish a profile in their catalog
  manifest; no version-specific TypeScript branch is required.

Result: no open MUST_FIX findings for this boundary.
