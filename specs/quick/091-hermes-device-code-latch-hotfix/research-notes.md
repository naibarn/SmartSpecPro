# Research notes

## Production evidence

- Worker `87579e2f-bede-4851-939b-2d35855f6c77` reports Worker App 0.1.132,
  online, Hermes 0.18.2 advertised.
- Connection `99cfe85b-2218-4b5e-a677-54f6e7eab430` is pending.
- Authorization job `56b6d3ed-5881-4d89-9751-cb4884432d80` reached running.
- Its `hermes_device_code` event contains only `raw`; structured URL/code/expiry
  keys are absent.
- Redacted shape proves the raw event is the URL line and that a grouped code is
  embedded in the complete URL.

## Code evidence

- `run_hermes_connection_authorize` latches the first raw candidate.
- Hermes 0.18.2 prints URL and explicit code on consecutive lines.
- `getHermesConnectStatus` intentionally consumes only structured event fields.
- `spawn_hermes_process` pipes output but does not apply Windows
  `CREATE_NO_WINDOW`.

## Discovery fallback

SocratiCode `codebase_status` failed with `Transport closed`; targeted source,
installed Hermes code, production DB rows, and tests are the discovery sources.
