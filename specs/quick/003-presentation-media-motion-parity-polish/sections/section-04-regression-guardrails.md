# Section 04: Regression Guardrails

## Goal

Keep this polish round tight, deterministic, and easy to verify during implementation.

## Guardrails

- do not add new motion presets or new effect categories in this round
- do not change raster image/video behavior except where normalization now filters invalid raw values
- do not introduce a new browser automation stack unless runtime-aware vitest coverage proves insufficient
- keep warning copy aligned with `describePresentationExportWarning`

## Verification Checklist

- run shared/client regression subset first
- run route/export tests in the environment that supports local port binding
- verify inline SVG parity and invalid-preset safety explicitly
- verify preflight warning plus exporting/done warning consistency

## Release Notes To Capture

- inline SVG image elements now animate wherever media motion is supported
- invalid motion presets now degrade safely to inactive/no-op
- export dialog warns earlier when static formats will flatten motion
