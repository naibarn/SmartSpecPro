# Implementation Plan

## Objective

Deliver one bilingual admin control plane that can configure, explain, validate,
and operate the existing Meta Channels OAuth and webhook flow.

## Approach

First extend the Node settings router and Python resolver so the data contract is
safe and coherent. Then add a focused Astryx-based Meta settings component to
the existing OAuth tab. Finally add regression tests for storage, decryption,
flag synchronization, bilingual rendering, and the connection path.

## Affected Areas

- `apps/web/server/routers/systemSettings.ts`
- `apps/web/server/services/tenantFeatureFlagService.ts`
- `python-backend/app/api/meta_oauth.py`
- `apps/web/client/src/pages/AdminSettings.tsx`
- new focused Meta settings component and tests
- relevant Node and Python tests

## Risks and Mitigations

- Secret exposure: never return secret values; scrub external errors.
- Secret overwrite: blank input preserves existing ciphertext.
- Split configuration: save App Secret to the OAuth and webhook categories.
- Flag drift: synchronize `META_CHANNELS_ENABLED` through the existing Redis
  tenant flag mechanism.
- External Meta changes: expose API version and link official documentation.
- UI density: separate credentials, webhook, readiness, and guide sections.

## Acceptance Criteria

- Admin can save all Meta values without direct database/environment edits.
- Returning to the page shows configured status but no secret.
- Python OAuth receives decrypted values from the database.
- Webhook verification receives the same App Secret and configured verify token.
- Tenant flag changes affect the same backend route guard.
- English and Thai guide content switches immediately with app locale.
- UI provides callback URLs, requested permissions, Meta console locations,
  App Review guidance, test results, and final connection instructions.
- Targeted typecheck and tests pass.
