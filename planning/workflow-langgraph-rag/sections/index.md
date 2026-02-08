<!-- PROJECT_CONFIG
runtime: python-uv
test_command: cd python-backend && uv run pytest
END_PROJECT_CONFIG -->

<!-- SECTION_MANIFEST
01-langgraph-runtime-core
13-database-schema
14-api-endpoints
02-streaming-integration
03-hitl-interrupt
16-backward-compatibility
10-caching-system
11-node-registry-expansion
04-trigger-nodes
05-core-io-nodes
06-data-shaping-nodes
07-reliability-nodes
08-security-nodes
09-hitl-code-nodes
12-frontend-updates
15-testing-strategy
END_MANIFEST -->

# Section Index: SmartSpecPro Workflow Engine Rebuild

## SECTION_MANIFEST

| Section | File | Title | Dependencies | Implementation Order |
|---------|------|-------|-------------|---------------------|
| 01 | `01-langgraph-runtime-core.md` | LangGraph Runtime Core | None | 1 |
| 02 | `02-streaming-integration.md` | Streaming Integration | Section 01, Section 14 | 4 |
| 03 | `03-hitl-interrupt.md` | Human-in-the-Loop via interrupt() | Section 01, Section 02 | 5 |
| 04 | `04-trigger-nodes.md` | Trigger Nodes (4 nodes) | Section 01, Section 11 | 9a |
| 05 | `05-core-io-nodes.md` | Core I/O Nodes (5 nodes) | Section 01, Section 11 | 9b |
| 06 | `06-data-shaping-nodes.md` | Data Shaping & Control Nodes (10 nodes) | Section 01, Section 11 | 9c |
| 07 | `07-reliability-nodes.md` | Reliability Nodes (6 nodes) | Section 01, Section 10 | 9d |
| 08 | `08-security-nodes.md` | Security & Governance Nodes (6 nodes) | Section 01, Section 13 | 9e |
| 09 | `09-hitl-code-nodes.md` | HITL & Code Nodes (2 nodes) | Section 01, Section 03 | 9f |
| 10 | `10-caching-system.md` | Exact-Hash Caching System | Section 01 | 7 |
| 11 | `11-node-registry-expansion.md` | Node Registry Expansion | Section 01 | 8 |
| 12 | `12-frontend-updates.md` | Frontend Updates | Section 11 | 10 |
| 13 | `13-database-schema.md` | Database Schema Changes | None | 2 |
| 14 | `14-api-endpoints.md` | API Endpoint Updates | Section 01 | 3 |
| 15 | `15-testing-strategy.md` | Testing Strategy | All sections | 11 |
| 16 | `16-backward-compatibility.md` | Backward Compatibility | Section 01, Section 02, Section 03 | 6 |

## Implementation Order (Dependency-Respecting)

```
Phase 1 Implementation Sequence:

1. Section 01 (Runtime Core) ─────────────┐
2. Section 13 (Database Schema) ──────────┤
3. Section 14 (API Endpoints) ────────────┤─── Foundation
4. Section 02 (Streaming) ────────────────┤
5. Section 03 (HITL) ────────────────────┘
6. Section 16 (Backward Compat) ──────── Verification Gate
7. Section 10 (Caching) ─────────────────┐
8. Section 11 (Node Registry) ───────────┤─── Infrastructure
9. Sections 04-09 (Node Executors) ──────┤─── Can parallelize
10. Section 12 (Frontend) ───────────────┘
11. Section 15 (Testing Final Pass) ──── Quality Gate
```

## Section Writing Strategy

- Sections 01, 13, 14 are critical path — write first, most detail needed
- Sections 04-09 (node executors) can be written in parallel by subagents
- Section 15 (testing) references all other sections — write last
- Each section file must be self-contained with: overview, files, implementation steps, tests, dependencies
