# Research Notes

## Existing help architecture

- `HelpButton` opens the shared `HelpPanel` and accepts `page`, `topic`,
  localized `label`, `variant`, and `size`.
- Content is loaded from `apps/web/docs/help/{en,th}` and routed through `/help`
  and `/help/:slug+`.
- The panel already supports the global English/Thai locale switch.
- Existing page integrations provide the visual and accessibility pattern.

## Hermes terminology

- Existing `hermes-workers` documentation describes Hermes Agent Gateway and
  its `hermesAgentRuntime` flag.
- Grok media generation uses Hermes Media Worker and must have separate help to
  avoid conflating the two systems.
- Supported connection scopes are central tenant (`server_shared`), personal
  server (`server_personal`), and private Worker App (`private_worker`).

## UI discovery

- Connections: `HermesConnectPanel.tsx`
- Platform settings: `HermesInfrastructureSettingsCard.tsx`
- Tenant rollout: `TenantFeatureFlagsPanel.tsx`
- Worker App: `WorkerAppConnect.tsx`
- Monitoring: `AdminMonitoring.tsx`

## Discovery fallback

SocratiCode status was requested first, but its transport returned `Transport
closed`. Exact verification therefore uses targeted shell searches and file
reads.

