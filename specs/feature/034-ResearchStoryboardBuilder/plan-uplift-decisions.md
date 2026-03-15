# Plan Uplift Decisions

Date: 2026-03-11

Decision: apply all recommended uplifts.

Applied items:

- `U1` Add preview expiration and retention policy.
- `U2` Add stale-preview and commit-conflict handling.
- `U3` Add partial-success and fallback behavior per intent.
- `U4` Add phased rollout gates and observability checkpoints.
- `U5` Add provenance display contract for UI surfaces.

Reason:

The selected uplift set closes important runtime ambiguity around preview-first behavior, commit safety, observability, and provenance rendering without changing the feature’s core direction.
