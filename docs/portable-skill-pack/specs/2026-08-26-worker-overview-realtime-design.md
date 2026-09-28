# Worker App Header and Overview Realtime Design

## Objective

Make the Worker App header and Overview a truthful live dashboard. The header must distinguish connected, pending, unavailable, reconnect-required, and expired states, show the connection expiry and last verification time, and provide an actionable reconnect path. Overview must summarize all locally observed worker activity and server queue work without requiring navigation through every menu.

## Design

- Use one five-second polling cadence for connection health, executor state, worker-loop state, runtime readiness, and server queue summary.
- Keep transport failure (`unavailable`/`transient`) separate from invalid credentials (`reconnectRequired`) and from a never-connected state.
- Pass a structured connection summary into the top bar instead of deriving status from a boolean alone.
- Extend the Overview screen with active jobs, queued jobs, stalled/failed work, last result, and a stale-data indicator. All counts come from real Tauri commands and the authenticated worker queue endpoint.
- Keep queue actions on the Queue screen; Overview links to the detailed screen and does not duplicate destructive controls.
- Preserve the current two-lane executor state so every supported local job type is counted, including Hermes/media and render lanes.

## Acceptance criteria

1. Header status cannot show Ready/Connected when the latest health response is invalid or expired.
2. Connected state shows expiry (absolute and relative where possible) and last checked time.
3. Not-connected and reconnect-required states explain exactly how to reconnect.
4. Overview renders current work, queue depth, remote queue categories, runtime/loop state, and the latest completed/failed result from live state.
5. Polling is cleaned up on unmount, does not overlap requests, and keeps working after reconnect.
6. Existing route, permission, series workspace, and executor tests remain green.

## Non-goals

- No WebSocket/server protocol change.
- No deployment, migration, or production restart.
- No reintroduction of HyperFrames.
