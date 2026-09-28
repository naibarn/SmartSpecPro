# Section 01: Bilingual Help Content

## Goal

Add four distinct Grok via Hermes topics in English and Thai without altering
the existing Hermes Agent Gateway topic.

## Files

- `apps/web/docs/help/en/grok-via-hermes-connections.md`
- `apps/web/docs/help/th/grok-via-hermes-connections.md`
- `apps/web/docs/help/en/grok-via-hermes-admin.md`
- `apps/web/docs/help/th/grok-via-hermes-admin.md`
- `apps/web/docs/help/en/grok-via-hermes-worker-app.md`
- `apps/web/docs/help/th/grok-via-hermes-worker-app.md`
- `apps/web/docs/help/en/grok-via-hermes-monitoring.md`
- `apps/web/docs/help/th/grok-via-hermes-monitoring.md`
- `apps/web/server/services/helpContentService.test.ts`

## Requirements

- Valid frontmatter for both locales and correct `pages`.
- Explain image generation, image editing, and video generation capabilities.
- Explain central, personal server, and private Worker App ownership and quota.
- Explain xAI device authorization without requesting credentials.
- Explain readiness, version/capability checks, reconnect, and common failures.
- Explicitly distinguish Hermes Media Worker from Hermes Agent Gateway.
- Cross-link related topics.

## Verification

Focused help content service tests load every locale/topic pair and verify the
legacy Agent Gateway topic remains distinct.

## Implemented

- Added all eight English/Thai Markdown files listed above.
- Added contextual page metadata and a related-help graph across all four
  topics.
- Extended `helpContentService.test.ts` with bilingual loading, contextual
  routing, and Agent Gateway separation assertions.
- Final focused suite contribution: 21 help service tests passing.
