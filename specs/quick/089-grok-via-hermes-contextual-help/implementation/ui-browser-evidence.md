# UI Browser Evidence

## Status

Authenticated browser screenshots were not captured because this implementation
session did not have a reusable authenticated browser session for all admin and
tenant routes.

## Automated UI evidence

- Connections Help is rendered for enabled and disabled states.
- Platform settings Help routes to `grok-via-hermes-admin`.
- Tenant Help routes to the same admin workflow topic.
- Worker App Help routes to `grok-via-hermes-worker-app`.
- Monitoring exposes `Grok Media Help` next to, but separate from, the existing
  Hermes Agent Gateway help.
- All relevant button containers use wrapping layouts.
- The shared `HelpButton`/`HelpPanel` supplies keyboard behavior and the locale
  toggle already used throughout the application.

## Recommended authenticated smoke check

At 390px, 768px, and 1440px widths, open each target route, select its Help
button, switch English/Thai in the Help panel, and confirm the expected topic
title and scroll behavior.

