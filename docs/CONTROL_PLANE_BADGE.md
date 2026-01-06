# Control Plane Badge

This repo publishes a `control-plane` badge using a Shields endpoint JSON hosted on the `badges` branch.

## What it represents

A stdlib-only heuristic derived from `control-plane/src/config.ts`:

- Whether a content-type allowlist exists (`allowedContentTypes`)
- Whether common artifact types are allowed (images/videos/pdf/text)
- Whether upload/body size limits exist (max upload bytes)

Badge message examples:
- `strict ct:img+vid+pdf+text`
- `allowlist ct:img+pdf`
- `size-only ct:unknown`

> This badge is intended as a safety regression signal (detect accidental removal of allowlists/guards).
