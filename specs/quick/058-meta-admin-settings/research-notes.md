# Research Notes

## Existing Flow

- `apps/web/client/src/pages/SocialChannels.tsx` already starts Meta OAuth.
- `apps/web/server/routers/metaChannels.ts` proxies authenticated tenant-scoped
  calls to Python.
- `python-backend/app/api/meta_oauth.py` exchanges tokens and stores encrypted
  user/Page tokens.
- `python-backend/app/api/meta_webhooks.py` verifies Meta callbacks and
  signatures.

## Gaps

- Admin OAuth UI and router expose Google, GitHub, and Microsoft only.
- Meta OAuth reads database secrets without decrypting them.
- Webhook secrets use a separate `meta_channels` category with no UI.
- UI tenant flags default Meta on, while backend route guards use Redis/env and
  default off.
- `META_CHANNELS_ENABLED` is missing from the tenant-to-Redis sync set.
- Current runtime has no Meta OAuth rows, no Meta webhook rows, and no Redis
  Meta flag; the webhook returns 503.
- Existing local help docs do not explain Meta setup.

## Existing UI Pattern

- Admin Settings already renders `LocaleToggle` and a bilingual `copy` model.
- Settings use grouped sections, labeled inputs, masked secrets, readiness
  badges, toasts, and external documentation links.
- Astryx is initialized globally and provides Section, Grid, VStack, TextInput,
  Banner, Badge, Button, Text, Heading, Divider, and Link.

## Security Boundaries

- Only `adminProcedure` may read/update/test platform Meta credentials.
- Secret fields return configured booleans, never ciphertext or plaintext.
- Empty secret input keeps the currently stored value.
- Python must use `system_settings_loader` for decrypt-at-use behavior.
- Meta API failures must not include access tokens, App Secret, or request URLs
  containing credentials.

## Version-Sensitive Notes

- The repository currently targets Graph API `v25.0`.
- Requested permissions must be kept explicit and explained in the guide.
- Meta App Review and Advanced Access are external prerequisites for production
  tenants outside the app's own roles.
