# tasks.md

Tasks ID: **SSP-DESKTOP-APP-001-TASKS**  
Linked Spec: **SSP-DESKTOP-APP-001**  
Rule: **Non-breaking only** (feature flags default OFF)  
Boundary: only `desktop-app/`

---

## A) Baseline + Guardrails
- **SSP-DESKTOP-APP-001-TASK-001**: Create regression checklist (local run/stop/output + CRUD)
- **SSP-DESKTOP-APP-001-TASK-002**: Add CI/path guard for `desktop-app/` boundary
- **SSP-DESKTOP-APP-001-TASK-003**: Document “source of truth” rules (Local vs Remote vs Memory)

## B) SqliteSaver Memory (Local-first)
- **SSP-DESKTOP-APP-001-TASK-004**: Design schema for `memory_sessions` + `memory_checkpoints`
- **SSP-DESKTOP-APP-001-TASK-005**: Implement SqliteSaver wrapper (create/read/checkpoint/cleanup)
- **SSP-DESKTOP-APP-001-TASK-006**: Add retention policy + compaction (size/day limits)
- **SSP-DESKTOP-APP-001-TASK-007**: Redact secrets before persisting memory payloads + unit tests
- **SSP-DESKTOP-APP-001-TASK-008**: Resume-from-checkpoint flow (crash recovery) behind a safe toggle

## C) Remote Mode (Read-only, flag OFF)
- **SSP-DESKTOP-APP-001-TASK-009**: Add `remoteModeEnabled` flag (default false) + settings UI
- **SSP-DESKTOP-APP-001-TASK-010**: API client module (base URL, auth header injection, timeouts)
- **SSP-DESKTOP-APP-001-TASK-011**: Session token handling (in-memory default; secure storage opt-in)
- **SSP-DESKTOP-APP-001-TASK-012**: Remote browser screens (Projects→Sessions→Iterations→Reports)
- **SSP-DESKTOP-APP-001-TASK-013**: Presigned GET report bundle download + viewer + scoped cache
- **SSP-DESKTOP-APP-001-TASK-014**: Ensure remote cache is non-authoritative (no conflict writes)

## D) LLM Proxy (OpenAI-compatible, flag OFF)
- **SSP-DESKTOP-APP-001-TASK-015**: Add `llmProxyEnabled` flag (default false)
- **SSP-DESKTOP-APP-001-TASK-016**: Implement local OpenAI-compatible proxy (ephemeral port; start/stop lifecycle)
- **SSP-DESKTOP-APP-001-TASK-017**: Forward proxy requests to website LLM gateway (API/MCP) using auth token
- **SSP-DESKTOP-APP-001-TASK-018**: Inject env/config for Kilo to use proxy when enabled
- **SSP-DESKTOP-APP-001-TASK-019**: Render server usage/cost metadata (read-only) in UI
- **SSP-DESKTOP-APP-001-TASK-020**: Safety: redact tokens in logs; backpressure; offline error UX

## E) Security Hardening
- **SSP-DESKTOP-APP-001-TASK-021**: Path sandbox warn-first (traversal/symlink detection)
- **SSP-DESKTOP-APP-001-TASK-022**: Process hardening (timeouts, throttling metrics) for runner + proxy
- **SSP-DESKTOP-APP-001-TASK-023**: CSP / prevent remote navigation in production builds
- **SSP-DESKTOP-APP-001-TASK-024**: Tighten Tauri allowlist/permissions (least privilege)

## F) Regression
- **SSP-DESKTOP-APP-001-TASK-025**: Remote mode regression: flag OFF means behavior unchanged
- **SSP-DESKTOP-APP-001-TASK-026**: LLM proxy regression: flag OFF means behavior unchanged
- **SSP-DESKTOP-APP-001-TASK-027**: Memory regression: disable checkpointing toggle keeps current behavior

