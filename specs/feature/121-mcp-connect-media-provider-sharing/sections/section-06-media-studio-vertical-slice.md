# Section 06: Media Studio Vertical Slice

## Goal

Enable MCP Connect for manual image/video generation in Media Studio while preserving existing `gateway_api` behavior.

## Depends On

- Section 04 media router integration.
- Section 02 connection router for `mcpConnections` queries.
- Section 05 only for the optional connect/reconnect CTA route and consistent integration copy; this section owns the media transport picker components.

## Files

Modify:

- `apps/web/client/src/pages/MediaStudio.tsx`

Create or reuse:

- `apps/web/client/src/components/media/McpTransportSelector.tsx`
- `apps/web/client/src/components/media/McpConnectionPicker.tsx`
- `apps/web/client/src/components/media/McpCreditSourceBadge.tsx`
- `apps/web/client/src/pages/__tests__/MediaStudio.mcpConnect.test.tsx`

Ownership note: these `components/media/*` modules are shared by Media Studio and later workflow surfaces. Do not put media transport picker logic inside `McpConnectPanel`.

## UI/UX Contract

### Target User / JTBD

- Role: creative user generating image/video manually.
- Goal: choose Gateway API or MCP Connect clearly before generation.
- Entry point: Media Studio image/video tabs.
- Success outcome: generated task shows provider, transport, account, credit source, and retry/fallback options.

### Surface Inventory

| Surface | File | Change |
|---|---|---|
| generation controls | `MediaStudio.tsx` | transport selector, connection picker |
| task queue/history | `MediaStudio.tsx` | API/MCP badges and credit source |
| fallback UI | `MediaStudio.tsx` | explicit retry with Gateway API |

### Component Map

| Component | File | Owns | Consumes |
|---|---|---|---|
| `McpTransportSelector` | `client/src/components/media/McpTransportSelector.tsx` | transport selection and credit label | resolved flags, current form state |
| `McpConnectionPicker` | `client/src/components/media/McpConnectionPicker.tsx` | personal/shared connection choice | `trpc.mcpConnections.listConnections` |
| `McpCreditSourceBadge` | `client/src/components/media/McpCreditSourceBadge.tsx` | compact credit-source display | resolved transport metadata |
| Media Studio integration | `client/src/pages/MediaStudio.tsx` | payload wiring and task/history badges | selector components, async media mutations |

### State Matrix

Cover: default Gateway API, MCP selected, one eligible connection, multiple connections, no connection, reconnect required, schema loading/error, provider credit unknown/exhausted, generating, completed, failed, fallback available, disabled flags.

### Responsive Matrix

- mobile 390x844: selector and picker stack above Generate button.
- tablet 768x1024: controls fit without horizontal overflow.
- desktop 1440x900: controls align near provider/model controls.
- small-mobile 360x800: badges wrap cleanly.

### Accessibility Acceptance

Selector and picker are keyboard operable, labels are associated, focus remains logical through Generate, retry/fallback buttons have descriptive text.

### Copy Contract

Labels: `Gateway API`, `MCP Connect`, `SmartSpecPro credits`, `{Provider} account credits`, `Reconnect required`, `Retry with Gateway API`.

### Browser Evidence Required

Screenshots for default Gateway API, MCP connected, no eligible connection, and fallback state.

## Behavior

- Default state remains Gateway API.
- MCP picker only appears when MCP selected.
- Use personal/shared badges and safe account labels.
- Submit optional transport fields through async media procedures and render the shared `MediaTaskTransportMetadata` shape from Section 04; do not create Media Studio-only transport metadata.
- Do not show MCP controls for audio in v1.
- Task/history cards display transport, origin surface, connection scope, and credit source.

## Tests First

- Test: no MCP flags preserves current render and payload.
- Test: selector defaults to Gateway API.
- Test: MCP selected shows connection picker.
- Test: no eligible connection shows connect/reconnect CTA.
- Test: generated payload includes `transport`, `mcpConnectionId`, and `sharedGroupId` when selected.
- Test: task card displays API/MCP badge, connection scope, origin surface, and credit source from `MediaTaskTransportMetadata`.
- Test: fallback retry requires explicit user action.

Test file target:

- `apps/web/client/src/pages/__tests__/MediaStudio.mcpConnect.test.tsx`

Verification commands:

- `cd apps/web && npm test -- client/src/pages/__tests__/MediaStudio.mcpConnect.test.tsx`
- `cd apps/web && npm run check`

## Acceptance Criteria

- Existing Media Studio gateway generation still works.
- Image and video MCP paths can submit through async router.
- UI does not overlap on required viewports.
- Component/integration tests pass.
