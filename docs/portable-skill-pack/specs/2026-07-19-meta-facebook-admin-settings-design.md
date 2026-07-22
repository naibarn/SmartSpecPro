# Meta / Facebook Admin Settings Design

## Goal

Provide one supported admin workflow for configuring and operating the existing
Meta Channels integration. The page must explain every external Meta Developer
step, expose readiness and test results, keep secrets masked, and render in
English or Thai using the application's existing locale switcher.

## Chosen Approach

Extend the existing Admin Settings OAuth surface and `systemSettings` router
instead of creating a second settings application. Store OAuth fields in the
existing `oauth` category and webhook fields in `meta_channels`. Resolve both
through the shared Python system-settings loader so encrypted values are
decrypted only inside the backend.

This keeps Google, GitHub, Microsoft, and Meta credentials in the same admin
control plane while preserving the existing Meta Channels user workflow at
`/social/channels`.

## Admin UI

The OAuth tab gains a Meta / Facebook Pages section with:

- App ID, masked App Secret, OAuth redirect URI, and Graph API version.
- Webhook callback URL, masked webhook verify token, and readiness status.
- Save and Test Configuration actions with loading, success, and error states.
- A bilingual step-by-step guide covering app creation, login configuration,
  requested permissions, valid redirect URI, webhook verification, app review,
  feature rollout, and the final Connect Meta action.
- Copyable callback values and direct links to the relevant Meta Developer
  documentation.
- Copy that follows the current application locale. The existing
  `LocaleToggle` in the Admin Settings header remains the single language
  switch and updates this section immediately.

The visual direction is Enterprise Calm: one primary save action, restrained
status callouts, grouped fields, clear numbered instructions, responsive
single-column layout on small screens, and accessible labels/focus states.

## Backend and Control Plane

- Extend `getOAuthSettings` and `updateOAuthSettings` with Meta OAuth fields and
  Meta webhook secrets.
- Never return stored secret values; return only configured booleans.
- Add an admin-only Meta configuration test that validates values, verifies the
  Graph API version endpoint without exposing the App Secret, and reports the
  exact missing setup step.
- Update Python Meta OAuth resolution to use the shared decrypting settings
  loader instead of reading encrypted database values as plaintext.
- Use a single Meta App Secret for OAuth exchange and webhook signature
  validation while retaining separate storage aliases for backward
  compatibility.
- Add `META_CHANNELS_ENABLED` to the tenant-to-Redis synchronization set so the
  Admin tenant flag controls the same backend guard used by Meta routes.

## Data Flow

1. Admin saves Meta settings.
2. Node encrypts sensitive values and stores them in `system_settings`.
3. Python loads and decrypts OAuth/webhook values at point of use.
4. Admin enables `META_CHANNELS_ENABLED` for the tenant; Node synchronizes the
   tenant-scoped Redis flag.
5. An authorized user opens `/social/channels`, requests an OAuth URL, completes
   Meta consent, and selects the returned Pages.
6. Meta sends signed webhook events to `/api/webhooks/meta`.

## Failure Handling

- Missing credentials: show `Not configured` and identify each missing field.
- Invalid redirect URI or API version: reject save/test with actionable text.
- Meta API unavailable: return a non-secret diagnostic and keep saved values.
- Missing internal gateway token: fail closed for OAuth proxy calls.
- Webhook verification failure: return 403 without logging secret material.
- Tenant flag disabled: explain where an admin enables Meta Channels.

## Verification

- Router tests for masked reads, writes, secret retention, and test results.
- Python tests for encrypted settings resolution and environment fallback.
- Feature-flag tests proving tenant updates synchronize Meta to Redis.
- UI tests for English/Thai copy, secret masking, save/test states, guide
  content, and locale switching.
- Targeted typecheck plus Meta backend tests.
- Browser verification at mobile, tablet, and desktop widths when the local app
  can be exercised with an authenticated admin session.
