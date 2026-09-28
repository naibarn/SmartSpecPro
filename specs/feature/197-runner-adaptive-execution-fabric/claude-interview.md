# Feature 197 Interview

## Decisions

- Feature 197 follows 195 and 196 and owns Runner/device/local execution semantics.
- Runner local reality is distinct from global policy and durable Job truth.
- Reconnect, replay, desired/observed state and fencing are mandatory; WebSocket events are not durable truth.
- Existing Tauri/Rust and Web connection foundations are reused; no second device registry or queue.
- Local Docker/OpenSandbox dispatch remains prohibited; approved isolated server-side runtime is used instead.

