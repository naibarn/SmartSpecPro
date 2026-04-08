# Self Review Round 1 - Local / Client LLM Mode Plan

Date: 2026-04-04
Review type: adversarial self-review
Target: `claude-plan.md`

## Review stance

This pass re-read the plan as a skeptical architect looking for rollout gaps, misleading assumptions, and security blind spots.

## Findings

1. Observability existed in the source spec but the first draft of the plan did not say what telemetry to keep, what to avoid collecting, or how to keep the feature lightweight when disabled.
2. The local model catalog section described revocation conceptually but did not define when clients refresh policy and catalog state, which could leave stale installed bundles selectable for too long.
3. Asset allowlists and integrity were described, but the first draft did not connect them back to the current broad browser `connect-src` posture or explain where SmartSpecPro should centralize asset-origin policy.

## Changes applied to the plan

1. Added catalog refresh and revocation triggers to the local model catalog section.
2. Added CSP / runtime-config guidance so asset-origin allowlisting is enforced from server-owned configuration instead of client convention.
3. Added a minimal observability section that captures rollout metrics without collecting raw prompt content by default.

## Result

The plan is materially stronger after this pass because it now covers:

- rollout telemetry without privacy drift
- practical revocation timing
- a clearer security control point for model asset origins
