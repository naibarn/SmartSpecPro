# Gap audit round 4 — selector and request execution paths

- Traced chat, agency, workflow, skill, settings, and media model selection paths.
- Added Worker rows to both general LLM catalogs while retaining media-specific
  catalogs for media selectors.
- Fixed conversation-only idempotency collision and messages-style array response
  extraction; managed image refs are preserved and external image payloads rejected.
- Result: Web focused suite passed 9 files / 131 tests.
