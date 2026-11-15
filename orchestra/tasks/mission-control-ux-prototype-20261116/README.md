# Mission Control UX prototype

An isolated, authenticated, synthetic-data prototype for reviewing Mission Control before replacing or linking the working runtime UI. It is not live Mission/Job/Runner data and performs no backend operations.

- Route: `/dev/mission-control-prototype`
- Intended DEV host: `https://aimarkethubs.com/dev/mission-control-prototype`
- Route guard: authenticated session plus `aimarkethubs.com`, localhost, or loopback host; other hosts return to Chat.
- Runtime status: deployed and verified through the registered controller; authenticated owner UX review is pending. See [`implementation/HANDOFF.md`](implementation/HANDOFF.md).
- Scope: SmartSIHub Platform Shell only. Existing Chat route, Mission/Job contracts, queue, scheduler, database, and production site remain untouched.

## Visual evidence

Captured with Chromium against the local Vite DEV server on 2026-11-16, using a local-only `/v1/core/me` fixture to exercise the existing authenticated route guard. No production credentials or service data were used.

| Viewport | Screenshot | Result |
|---|---|---|
| Desktop 1440 × 900 | [mission-control-desktop.png](evidence/mission-control-desktop.png) | No horizontal overflow |
| Tablet 820 × 1180 | [mission-control-tablet.png](evidence/mission-control-tablet.png) | Drawer-based inspector/navigation; no horizontal overflow |
| Mobile 390 × 844 | [mission-control-mobile.png](evidence/mission-control-mobile.png) | Stacked controls and execution cards; Menu and Details drawers interact; no horizontal overflow |

See [interaction-flow.md](interaction-flow.md), [component-inventory.md](component-inventory.md), [spec-mapping.md](spec-mapping.md), [implementation-gap-matrix.md](implementation-gap-matrix.md), and [runtime-integration-proposal.md](runtime-integration-proposal.md).
