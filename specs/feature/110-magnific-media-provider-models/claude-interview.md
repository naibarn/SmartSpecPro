# Interview: Magnific Media Provider And Model Catalog Expansion

Date: 2026-05-06

No stakeholder questions were required before planning. The original spec already defines product scope, non-goals, rollout sequence, rollback sequence, billing expectations, security controls, and acceptance criteria. Remaining ambiguity was technical-contract cleanup that can be decided from codebase patterns and official Magnific docs.

## Auto-Decisions

### A1. Planning Route

Use full `deep-plan` instead of `deep-plan-quick`.

Reason: the feature spans admin provider management, model seeding, frontend dynamic inputs, Python runtime execution, Celery polling, SSRF validation, billing, observability, and rollout gates.

### A2. Provider Identifier

Use canonical provider id `magnific`. Accept aliases `magnific_api`, `magnific-ai`, and `magnific_ai`.

Reason: the original spec already declares this contract, and it fits existing provider normalization patterns.

### A3. Veo Family Normalization

Use `modelFamily: "magnific/veo-3-1"` for all Veo 3.1 concrete records. Use concrete `modelId` and `endpoint.submit` to distinguish text-to-video, text-to-video-fast, image-to-video, image-to-video-fast, and reference-to-video.

Reason: this resolves an internal spec inconsistency while preserving grouped catalog UX.

### A4. Enabled Defaults

Seed all Magnific rows with provider disabled. Model rows can be admin-visible, but user-selectable default enablement must be conservative: verified low-cost image/sync rows may be enabled only after rollout gates; video/upscaler rows stay disabled/admin-only until staging smoke tests pass.

Reason: pricing is provisional and video/upscaler jobs can be expensive.

### A5. Webhooks

Do not expose user-editable webhook URLs. Phase one uses polling. If a trusted platform callback URL exists later, only server-side code may inject it.

Reason: this follows the original non-goal and avoids user-controlled callback SSRF/data exfiltration risk.

### A6. Implementation Isolation

Keep the plan additive. Do not alter existing Kie, fal.ai, BytePlus, WaveSpeed, ElevenLabs, UVoice, or KNPLabs behavior except where adding Magnific requires shared normalization or regression coverage.

Reason: existing media provider paths are active and the worktree already contains unrelated media/video changes.
