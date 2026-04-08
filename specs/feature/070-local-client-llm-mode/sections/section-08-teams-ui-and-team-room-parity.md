# Section 08: Teams UI and Team Room Parity

## Purpose

Extend Local AI support across `/teams`, Team Room, workflow, and run-monitor surfaces so collaborative UI remains consistent with chat while preserving truthful server-side orchestration boundaries.

## Ownership

- Teams and Team Room Local AI UI parity
- Team Room runtime/source disclosure
- Team Room human-composer local preprocessing rules
- prompt-composer and room-message persistence integration points

## Target files

- `apps/web/client/src/pages/Teams.tsx`
- `apps/web/client/src/components/orchestrator/TeamRoomView.tsx`
- `apps/web/client/src/components/orchestrator/RoomWorkflowPanel.tsx`
- `apps/web/client/src/components/orchestrator/RunMonitorPanel.tsx`
- `apps/web/server/services/promptComposer.ts`
- `apps/web/server/services/executors/contextBuilder.ts`
- `apps/web/server/services/roomService.ts`
- `apps/web/server/services/teamService.ts`
- `apps/web/server/routers/teamRoom.ts`
- `apps/web/drizzle/schema.ts` for typed `teamRoomMessages.metadataJson.runtimeDisclosure`

## Implementation notes

1. Treat Team Room as a distinct collaborative surface, not as ordinary chat with a different skin.
   Its current stack already has:
   - `composePrompt` for adaptive history and memory assembly
   - `buildTeamContext` for team-run prompt creation
   - `roomService` for message persistence, summary projection, and redaction
   - `team_room_messages` for durable room history
   - `/teams` list/detail, room creation, viewer-state, and member-management flows around that room history

2. Add a server-owned runtime disclosure contract for Team Room history.
   - Persist it inside `teamRoomMessages.metadataJson.runtimeDisclosure`.
   - Keep `tokenUsageJson` for usage numbers and model identifiers.
   - Use the same `hybrid` / `cloud` vocabulary as chat for v1.
   - Ensure workflow surfaces, and any future run-monitor source contract, read server-owned disclosure rather than client-inferred state.
   - Keep executor/debug payloads in a separate namespaced key so they do not collide with UI disclosure.

3. Keep server-run assistant turns truthful.
   - Team-run assistant messages remain cloud/server-authoritative in v1.
   - A client must not mark orchestrated assistant turns as local.
   - If future hybrid/team-local execution is added, it needs its own explicit server path.

4. Support local preprocessing only for human-authored collaborative inputs.
   Safe v1 examples:
   - compact or redact a room message draft before send
   - redact/scrub user-entered room text before provider submission
   - draft a work-item title or revision note locally before persistence
   - produce a room-goal or editable team/member instruction suggestion that the user explicitly reviews before save
   Unsafe v1 assumption:
   - replacing `composePrompt` or server team-run execution with client-local orchestration
   - replacing team default-model or memory-policy configuration with Local AI profile picks
   - silently rewriting the final submitted text for room messages, workflow comments, room goals, or any other orchestration-control field

5. Preserve prompt-composer parity.
   - `promptComposer.ts` and `buildTeamContext` remain canonical for team-run history, scoped memory, entity memory, and adaptive budget allocation.
   - Local AI features must not fork a second hidden room-history algorithm for orchestrated turns.
   - Team-service orchestration policy fields such as `defaultModelId`, member `preferredModelId`, and `memoryPolicyJson` remain server-owned policy inputs in v1.

6. Preserve room-service safety rules.
   - Any locally assisted Team Room message still flows through `teamRoom.sendMessage` and `roomService`.
   - Do not bypass `sanitizeRoomString`, `sanitizeRoomJsonValue`, summary projection, or room/work-item authorization checks.
   - Sensitive room updates must continue to honor existing summary/redaction behavior.
   - Final submitted room messages must still pass through existing server-side intent routing/classification before persistence.
   - If user-authored local assist sends hints to the server, it should use a dedicated `localAiAdvisory` field rather than free-form `metadataJson`.
   - Local assist must be user-invoked and user-visible for collaborative control text; no silent auto-rewrite step is allowed in v1.

7. Add runtime/source disclosure to collaborative UI.
   - `TeamRoomView` should show server-owned runtime/source badges where relevant.
   - Workflow surfaces should show truthful source state when they expose generated outputs or execution summaries.
   - `RunMonitorPanel` should show source state only when a dedicated server-owned run-event or run-summary contract exists; otherwise it should omit the badge in v1.
   - Unsupported devices must see the same Teams UX without local runtime startup penalties.
   - Team list/detail panes, room switching, create-room dialogs, and member-management forms must stay cheap to render when Local AI is off.

8. Preserve Teams page lifecycle parity end to end.
   - `teamRoom.create`, `listByTeam`, `getMessages`, `viewerState`, and `markViewed` remain usable with Local AI off, unsupported, or failed.
   - Opening `/teams` must not pull in heavy runtime code unless the user explicitly requests a local-assist action.
   - Run controls, unread markers, and reply/focus interactions must not depend on a ready local adapter.

## TDD expectations

- Add Team Room persistence tests for `metadataJson.runtimeDisclosure`.
- Add tests proving server-orchestrated assistant turns cannot be mislabeled by a client.
- Add Teams UI tests proving unsupported devices still render and send room messages normally.
- Add prompt-composer tests proving Local AI features do not bypass existing adaptive history and memory assembly logic.
- Add tests proving team model-policy selectors remain separate from Local AI profiles.
- Add tests proving room-create/member-edit dialogs stay cheap to open when Local AI is off.
- Add tests proving direct client injection of disclosure metadata is rejected and that `RunMonitorPanel` does not invent source state.

## Acceptance checks

- `/teams` stays fully usable when Local AI is disabled or unsupported.
- Team Room history can render truthful runtime/source disclosure after reload.
- Human-authored room-message preprocessing can use Local AI on supported devices without bypassing room-service safety.
- Human-authored collaborative drafting remains explicit and user-confirmed; Local AI does not silently rewrite orchestration-control text.
- Team-run assistant turns remain server-authoritative in v1.
- Team management, room lifecycle, run monitor, and unread/viewer-state flows remain unaffected on unsupported devices.

## Coordination notes

- Consume contracts from sections 01 and 03 exactly as named.
- Reuse the authoritative runtime-metadata rules from section 04.
- Reuse browser/Tauri capability and adapter constraints from sections 05 and 06 where human-authored composer assists are supported.
- Section 09 owns the end-to-end regression coverage for these collaborative surfaces.
