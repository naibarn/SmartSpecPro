# Request

Improve the Worker App header and Overview. Show truthful connection state, expiry, reconnect instructions, and a realtime dashboard every five seconds. Audit all visible actions and keep the dashboard based on real worker/server state rather than mock values.

Assumptions: existing Tauri executor state and authenticated worker queue endpoint are authoritative; polling is preferred over adding a new event protocol; no deployment or migration is requested.
