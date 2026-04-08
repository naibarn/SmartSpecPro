# Section 02: User Settings and Device State

## Purpose

Add the user-facing Local AI settings experience and the device-local state model that keeps downloads, consent, derived artifacts, and voice-input preferences isolated per tenant and user.

## Ownership

- user preference read/write behavior for `localAi`
- Settings page Local AI UI
- browser device-local state helpers and scoping
- clear-cache and sign-out isolation behavior
- mic provider preference UI and safe defaults

## Target files

- `apps/web/server/routers/users.ts`
- `apps/web/client/src/pages/Settings.tsx`
- `apps/web/client/src/features/local-ai/components/LocalAiSettingsSection.tsx`
- `apps/web/client/src/features/local-ai/state/localAiSettingsStore.ts`
- `apps/web/client/src/features/local-ai/state/localAiDeviceStateStorage.ts`
- `apps/web/client/src/features/local-ai/types/deviceState.ts`

## Implementation notes

1. Extend `users.getPreferences` and `users.updatePreferences` to understand `localAi`.
   - Accept partial updates.
   - Supply safe defaults when the field is absent.
   - Preserve unrelated user preference fields.

2. Add a dedicated Local AI settings surface under the existing Settings page.
   The UI must distinguish:
   - synced account preferences
   - device-local download/storage controls
   - unsupported-device explanations
   - tenant-policy lockouts

3. Implement device-local state storage with scoped keys.
   Every browser key must include enough identity context to isolate:
   - tenant
   - signed-in user
   - runtime namespace such as `web`

4. Device-local state should cover:
   - `allowDownloads`
   - `wifiOnlyDownloads` where applicable
   - `storageBudgetMb`
   - consented model IDs
   - installed model IDs
   - last capability check snapshot
   - derived artifact retention metadata

5. Synced preferences should also cover voice-entry intent:
   - `voiceInputMode`
   - `enableVoiceCommands`
   - optional `voiceReadbackMode`
   The safe default should remain `legacy_stt` so older users keep the current mic behavior unless they opt in.

6. Voice settings must disclose different privacy/consent semantics:
   - `legacy_stt` may send audio through SmartSpecPro backend and third-party STT providers
   - `gemma4_local` is intended for local-device processing
   - `auto` may fall back to the legacy/server STT path on unsupported devices
   Explicit `gemma4_local` must not silently downgrade to third-party STT without clear user-facing confirmation.

7. Clear-cache behavior must include:
   - derived local text artifacts
   - runtime health cache
   - install visibility and consent state for the active scope
   It may leave physically reusable blobs only if later sections can still prevent cross-account visibility.

8. Sign-out and tenant-switch handling must be explicit.
   - Clear or logically hide scoped Local AI state before the next session reads it.
   - Do not allow a second user on the same browser profile to inherit the first user's consent or derived-text history.
   - On the web, cached bundles must not appear installed or reusable for the next scope until that scope revalidates and re-authorizes them.

9. The Settings page must stay cheap to open.
   - Do not initialize workers here.
   - Do not download models here.
   - Do not dynamic-import heavy browser runtime code here.

## TDD expectations

- Write router tests for partial `localAi` updates and backward-compatible reads first.
- Add client tests proving Local AI settings render correctly when:
  - the feature is tenant-disabled
  - the device is unsupported
  - the user has never configured Local AI
- Add settings tests proving voice mode defaults to `legacy_stt` and unsupported local-voice explanations do not break the page.
- Add settings tests proving consent/disclosure copy changes when the user switches between `legacy_stt`, `gemma4_local`, and `auto`.
- Add device-state tests for scoped keys, sign-out cleanup, and revalidation-after-sign-out before wiring UI persistence.

## Acceptance checks

- Settings save and reload preserve `localAi` synced intent without breaking other preferences.
- Device-local settings do not sync across the same user's second device.
- Opening Settings does not start browser runtime initialization when the feature is off.
- Sign-out and tenant-switch flows do not expose another account's consent or derived local data.
- Web sign-out does not leave cached installs looking usable to the next signed-in scope without revalidation.
- Clear-cache can remove Local AI state without affecting normal cloud chat.

## Coordination notes

- Consume shared types from section 01; do not redefine execution modes.
- Consume the policy/catalog and revocation signals from section 03 so Settings can explain lockouts, unavailable profiles, and refresh results.
- Section 04 will reuse the conversation override UX entry points from chat.
- Section 08 will reuse the same Settings/status vocabulary for collaborative surfaces under `/teams`.
- Section 06 will provide the Tauri-specific storage implementation; keep this section web-focused.
