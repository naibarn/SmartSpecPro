# Safari theme text visibility design

## Problem

Some Safari sessions render application text with a color that blends into the
surface until the text is selected. The web app currently has two independent
theme systems: the application `ThemeProvider` stores `light`/`dark`, while the
Astryx root theme defaults to `system`. Astryx color tokens use
`light-dark(light, dark)`, so the browser can resolve text tokens for the OS
scheme while the application surfaces remain in the opposite scheme.

Safari versions before 17.5 also do not support `light-dark()`. In those
browsers, declarations containing the function can become invalid and leave
Astryx color variables unresolved.

## Design

Keep the existing application theme as the single mode source. Pass that mode
to the Astryx root theme so its `data-theme` and `color-scheme` state follow the
same light/dark choice. Resolve Astryx color tokens to concrete values for the
active mode and apply those values to the Astryx root and wrapper as a
compatibility fallback. This keeps modern browsers on the existing CSS token
path while ensuring older Safari has readable colors.

The fallback is limited to `--color-*` tokens, avoiding changes to the app's
font-size scale and other unrelated design tokens. Palette changes and theme
toggles re-apply the resolved values; cleanup restores any previous inline
values.

## Verification

- Unit test resolves light and dark text tokens to concrete values and excludes
  unresolved `light-dark(...)` expressions.
- Focused TypeScript check and unit test for the new compatibility helper.
- Production web build to confirm the shared theme bridge bundles correctly.
- Browser verification is limited to available local browser tooling; Safari
  itself is not installed in the Linux workspace.

## Scope and trade-off

This fixes the shared theme boundary rather than adding page-local text colors,
so existing and future pages benefit. It does not attempt to rewrite generated
Astryx theme CSS or remove modern `light-dark()` usage, which keeps theme
regeneration compatible and limits the change to the application integration.
