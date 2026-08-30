# Gap review round 6 — restart, migration, and recovery

Rechecked native restart, persisted local-root identity, revoke cleanup,
checkpoint location, migration journal registration, and stale binding
behavior. The root descriptor is now atomically persisted only in native app
data and restored as `recovered`; validation is still required before work.
Revoke clears native state and stops the coordinator. No path is returned in
the webview projection or sent to the server.

Result: no new static gap; live restart and migration dry-run remain runtime
evidence gates.
