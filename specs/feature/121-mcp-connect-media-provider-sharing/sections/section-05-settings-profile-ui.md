# Section 05: Settings/Profile MCP Connect UI

## Goal

Add Settings > Integrations UI for connecting, managing, sharing, and inspecting MCP media provider accounts.

## Depends On

- Section 01 flags/schema.
- Section 02 connection router.
- Section 03 sharing/usage router behavior.

## Files

Create:

- `apps/web/client/src/components/settings/McpConnectPanel.tsx`
- `apps/web/client/src/pages/McpConnectCallback.tsx`
- `apps/web/client/src/components/settings/__tests__/McpConnectPanel.test.tsx`
- `apps/web/client/src/pages/__tests__/McpConnectCallback.test.tsx`

Modify:

- `apps/web/client/src/pages/Settings.tsx`
- `apps/web/client/src/App.tsx` or current route registry for callback route

## UI/UX Contract

### Target User / JTBD

- Role: user connecting provider account; owner sharing account; group member checking availability.
- Goal: connect once, verify status, configure defaults/shares, see safe usage.
- Entry point: Settings > Integrations.
- Success outcome: account is connected or the user knows exactly why it is not usable.

### Surface Inventory

| Surface | File/route | Change |
|---|---|---|
| Settings Integrations | `Settings.tsx` | Add MCP Connect panel |
| MCP panel | `McpConnectPanel.tsx` | Provider cards, tabs, sharing, usage |
| OAuth callback | `McpConnectCallback.tsx` | Popup callback status and close |

### Component Map

| Component | Owns | Consumes |
|---|---|---|
| `McpConnectPanel` | provider cards, connection states, tabs | `trpc.mcpConnections.*` |
| share editor section | group selection, limits, video approval | `trpc.groups.list`, `updateShare` |
| usage section | redacted usage filters/table | `listUsage` |
| callback page | code/state completion | `completeOAuth` |

### State Matrix

Cover: loading, empty provider list, disconnected, popup blocked, connecting, connected, expired, reconnect required, disconnect pending, share disabled, share enabled, approval required, usage empty, usage error, feature disabled.

### Responsive Matrix

- mobile 390x844: provider cards stack; tabs scroll or wrap; dialogs fit viewport.
- tablet 768x1024: two-column cards allowed; share editor remains readable.
- desktop 1440x900: status and actions align with existing integrations.
- small-mobile 360x800: long provider/account labels wrap.

### Accessibility Acceptance

Buttons have labels, provider cards are keyboard reachable, tabs use Radix semantics, dialogs trap focus, error/warning text is visible, icon-only actions have accessible names.

### Copy Contract

Use existing Settings tone. Labels: `Connect`, `Reconnect`, `Disconnect`, `Gateway API`, `MCP Connect`, `Shared`, `Owner`, `Provider account credits`, `Owner approval required`.

### Browser Evidence Required

Record mobile/tablet/desktop screenshots for disconnected, connected, expired, and share editor states. Include keyboard path notes.

## Tests First

- Test: panel hidden or disabled when global flag off.
- Test: provider cards render from templates.
- Test: Connect opens popup or shows popup blocked error.
- Test: callback page calls `completeOAuth` and closes on success.
- Test: connected state shows safe account label and health only.
- Test: expired state shows reconnect CTA.
- Test: disconnect dialog calls mutation.
- Test: share editor requires owner acknowledgement.
- Test: group list contains only actor-visible groups.
- Test: usage table redacts secrets.

Test file targets:

- `apps/web/client/src/components/settings/__tests__/McpConnectPanel.test.tsx`
- `apps/web/client/src/pages/__tests__/McpConnectCallback.test.tsx`

Verification commands:

- `cd apps/web && npm test -- client/src/components/settings/__tests__/McpConnectPanel.test.tsx client/src/pages/__tests__/McpConnectCallback.test.tsx`
- `cd apps/web && npm run check`

## Acceptance Criteria

- No secrets appear in browser state.
- UI matches existing Settings integration density.
- Callback route is registered.
- Component tests and browser evidence exist or skipped evidence is documented.
