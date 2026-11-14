# Section 04 — responsive shell and truthful inspector

## Deliverable

Retain or refine the existing Astryx three-region Chat shell: left navigation/history, central conversation/composer and right inspector. Use assistant-ui thread list primitives only where they can faithfully adapt to existing Core conversations; keep native menu routes, workspace control, locale, themes and attachment behavior intact. Replace claims that lack a live Core capability with neutral status or explicit unavailable states.

## Owned paths

- `smartaihub-platform/modules/chat/src/ui/ChatWorkspace.tsx`
- `smartaihub-platform/modules/chat/src/ui/ConversationList.tsx`
- `smartaihub-platform/modules/chat/src/ui/ArtifactPanel.tsx` only to keep truthful feature gating
- `smartaihub-platform/modules/chat/src/ui/styles.css`
- `smartaihub-platform/modules/chat/src/ui/i18n.tsx` if copy changes are required

## Acceptance

- Desktop keeps all three regions usable; tablet/mobile use reachable collapsible panels/drawers with no horizontal overflow or obscured composer.
- Every tablet/mobile navigation, history, inspector or artifact overlay has an accessible close control. Mobile overlays fill the available workspace instead of depending on a fixed toolbar-height offset.
- Chat history and New Chat continue to call existing Core APIs.
- Inspector only shows conversation/workspace/job/model/credit facts that current authorized responses support. Agent, run, attempt, tool, artifacts, logs, cancellation and always-on state remain unavailable unless backed by a real contract.
- Theme, locale, workspace and attachment UI remain functional across breakpoints.

## Prerequisites and gaps

No complete Agent/Run/Attempt/Executor/Task/Mission/artifact contract exists in Core, and artifact capability is currently disabled. Keep status placeholder-based and document the separate contract work.

## Implementation evidence — 2026-11-15

- Added translated close controls to the navigation and inspector panels. Responsive styles reveal them at tablet/mobile breakpoints; closing clears the selected panel state.
- Mobile overlays now occupy the workspace block axis fully, avoiding a fixed top offset that became inaccurate with the wrapped mobile toolbar.
- Verified panel state and close actions in `workspace.test.tsx`; browser viewport rendering still needs authenticated desktop/tablet/mobile UAT.
- Inspector continues to show only workspace, conversation, model, message count, waiting/ready status and update time. Agent/Run/Attempt/artifact/credit facts remain unavailable without authoritative Core responses.
- Integrated source: `e31402ecbbd12fe0c3bc23ae00dac89286c52a43`.
