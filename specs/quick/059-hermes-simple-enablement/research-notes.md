# Research Notes

- Tenant flag: `hermesMediaWorker`.
- Platform master: `hermes_worker_enabled`.
- Safe private scope: `hermes_worker_private_enabled`.
- Media capability gate: `hermes_worker_video_enabled`.
- Shared/server scopes require `hermes_shared_worker_id`; production currently
  has no configured shared worker.
- `web_process_hermes_worker_enabled` is development-only.
- `getHermesAvailability` currently collapses tenant and platform gates into
  one boolean, preventing the UI from naming the missing gate.
- `HermesInfrastructureSettingsCard` exposes all operator controls at once.
- `HermesConnectPanel` hard-codes mostly Thai copy and uses a generic disabled
  explanation.
- Existing pages use `react-i18next`; `LocaleToggle` already controls the active
  language.
- SocratiCode status is green but the index is incomplete and its last
  incremental update failed, so targeted file inspection was used.
- No database migration or new dependency is required.
