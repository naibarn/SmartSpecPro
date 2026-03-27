# Section 05: Frontend UI

## Scope

Add the Upload-Post user experience to settings and publishing surfaces.

## Work

- Extend the settings page with an Upload-Post connection panel.
- Add disclosure acceptance, key validation, connection health, profile management, and quota state.
- Extend the social publishing UI with a gateway selector and Upload-Post profile/platform controls.
- Add history presentation for native vs Upload-Post posts.

## Constraints

- Reuse the current `Settings.tsx` panel pattern.
- Hide Upload-Post UI when the feature flag is off.
- Keep the publishing UI aligned with the existing draft/schedule/publish workflow.
