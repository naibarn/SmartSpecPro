# Feature 198 Intelligent Chat and Capability Evolution Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make `/chat` and the Universal Assistant a truthful, governed control surface for Goals, capabilities, Jobs, Runner work, MCP, External Agents, retrieval and safe evolution.

**Architecture:** Chat owns request presentation and user-facing state, while Feature 196 owns command semantics, Feature 195 owns durable Jobs, Feature 197 owns Runner reality, Feature 199 owns upstream MCP and Feature 200 owns external agents. LangGraph coordinates state transitions; OpenAI Agents provides bounded cognitive execution; retrieval/help/context preserve ACL and provenance.

**Tech Stack:** React/TypeScript, existing tRPC/router patterns, Vitest/jsdom/Playwright where available, Python LangGraph/OpenAI Agents, existing RAG/help/context services.

**Spec:** `specs/feature/198-intelligent-chat-universal-orchestration-capability-evolution/spec.md`

## Global Constraints

- `/chat` and Assistant Side Panel are the primary end-user surfaces.
- Do not duplicate Job, Goal/Plan, Runner, MCP upstream, RAG, approval, asset, billing or audit truth.
- Retrieval and derived state are tenant/ACL/provenance safe; Vectorize cutover must follow Feature 194 evidence.
- UI must be accessible, responsive, localized and explicit about unknown/degraded state.
- Learning/evolution never overrides hard policy, explicit user pins or safety gates.
- Durable work enters Feature 195; local work enters Feature 197; no retired execution paths.
- Do not run whole-repository typecheck.

## Source coverage ledger

Sections 1–45 cover baseline, architecture, request lifecycle, LangGraph, brokers, capability/agent boundaries, Jobs, evaluation and learning; sections 46–80 cover Chat/connection/capability/flow/trace/evaluation/learning UI; sections 81–120 cover implementation, APIs, data, security, performance and release; sections 121–132 cover dependencies, resilience, governance and quality; sections 133–159 cover Assistant/Help/Feedback integration; sections 160–206 cover freshness, provenance, tenant isolation, compensation, backpressure, schema, security, DR, realtime, experimentation, localization, accessibility, admin, telemetry, retrieval and large-result controls; 207 plus trailing summary sections cover codebase alignment and acceptance. Six sections below cover every heading/range.

## Execution order

`section-01-chat-contracts → section-02-brokers-and-runtime → section-03-task-state-and-provenance → section-04-ui-surfaces → section-05-evolution-and-governance → section-06-browser-and-release-gates`

### Task 1: Chat request/state contracts

**Files:** Modify existing Chat runtime/orchestrator and router contracts; add shared state types/tests.

Define page context, request envelope, source/capability chips, plan/approval/live-task/result/unknown states, event correlation and durable Job hydration. Keep SDK/provider internals behind adapters.

**Tests first:** request normalization, reconnect hydration, duplicate submit, empty provider result, unknown state and tenant scope.

### Task 2: Retrieval, operational, capability and runtime brokers

**Files:** Modify existing `contextRetrievalService.ts`, context access/provenance services, capability catalog and agent runtime integration; add tests.

Implement search-before-clarify, bounded retrieval/context packages, help authority, operational state, lazy tool hydration, ACL/provenance and policy-aware runtime selection. Route MCP/Agent calls through 196/199/200 and Jobs through 195.

**Tests first:** retrieval outage degradation, provenance/tenant filtering, capability stale/denied, large result artifactization, context freshness and provider fallback.

### Task 3: Task state, artifacts, traces and continuity

**Files:** Modify job monitor/task projection, trace/checkpoint/evaluation services and existing artifact/library adapters; tests.

Project canonical Job/Runner/Agent/MCP events into Chat, preserve immutable decision/replay bundles, handle cancel/resume/approval propagation, create bounded artifacts and notify across tabs/surfaces. Learning signals are consented, minimized and holdout-safe.

**Tests first:** event ordering/dedupe, cancellation cascade, artifact ACL, cross-tab conflict, retention/deletion reconciliation and evaluation leakage prevention.

### Task 4: Chat/Assistant UI and navigation

**Files:** Modify `/chat` page/components, Assistant launcher/Side Panel, plan/approval/live task/result/source/capability components and connections navigation.

Use current Chat and settings patterns, preserve existing capabilities, and add explicit state transitions without raw DOM/source disclosure. Add MCP Connected Apps, capability/flow/trace/evaluation entry points only where backend gates exist.

**UI/UX Contract:** Target user is an end user seeking an outcome, with `/chat` and Side Panel as entry points. Existing pattern references: current Chat components, MCP panels, job monitor, Help Center and media task cards; reuse their state/spacing/copy conventions. Surface inventory includes composer, activity strip, chips, plan, approval, live task, retrieval result, compare/result, clarification, connections, capability/trace/evaluation views. State matrix: loading/empty/error/success/partial/disabled/selected/hover/focus, including disconnected/unknown and approval-expired. Responsive: mobile 390×844, tablet 768×1024, laptop 1024×768, desktop 1440×900, wide desktop 1280×800 for data-dense panels. Accessibility: keyboard path, focus order/visible focus, live-region semantics, labels, contrast, reduced motion. Visual direction reuses existing product tokens and avoids raw colors/spacing. Copy: concise bilingual Thai/English labels, explicit Preview/Approve/Running/Needs input/Failed/Unknown; localization fallback is deterministic. Browser evidence required for Chat submit → plan → approval → live task → result, reconnect, mobile and keyboard flows.

### Task 5: Evolution, feedback and governance

**Files:** Modify evaluation/learning/skill/flow services and governance UI; add focused tests and release fixtures.

Implement safe trajectory capture, evaluator uncertainty, feedback consent, candidate skill/helper lifecycle, learned-route invalidation, canary/rollback and admin break-glass/audit controls. Hard policy always wins.

**Tests first:** poisoned feedback, holdout leakage, conflicting user pin, stale learned route, canary rollback, deletion and admin separation of duties.

### Task 6: Browser, integration and production gates

**Files:** Add focused browser specs under `apps/web/tests/e2e` and integration/release docs under `docs/operations/feature-198`.

Verify 195–200 contract matrix, UI/browser evidence, performance/cardinality limits, localization/a11y, degraded mode, retention and rollback. Do not claim production activation from local tests alone.

## Definition of done

Every source heading is mapped, Chat produces truthful governed task states from current code, focused React/Web/Python tests pass, browser evidence is recorded where tooling allows and evolution cannot bypass policy or shared sources of truth.

