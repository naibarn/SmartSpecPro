## Goal

Adopt the same enabled-model resolution policy in background services and legacy runtime endpoints.

## Scope

- scheduler
- memory service
- channel gateway / response helpers
- legacy `_core` LLM routes that still execute models directly

## Done When

- unattended/background execution does not silently use disabled fallback models

