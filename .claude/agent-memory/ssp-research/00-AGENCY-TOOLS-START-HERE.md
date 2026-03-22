---
name: Agency Tools Research — Start Here
description: Entry point for tools system research; read these documents in order
type: project
---

# Agency Tools Research — Start Here

**Complete Date:** 2026-03-22
**Status:** ✅ RESEARCH COMPLETE

This directory contains a complete analysis of SmartSpecPro's Agency Builder tools system.

---

## Quick Questions & Answers

**Q: How many tools exist?**
A: **16 builtin** (hardcoded in Node.js, mostly HTTP wrappers) + **unlimited custom** (via `agency_tools` table, no UI). See QUICK-REF for list.

**Q: Can users create custom tools?**
A: Not via UI. Must insert into `agency_tools` table directly or use future API.

**Q: Can agents dynamically choose which tools to use?**
A: No. Tools are pre-assigned per agent at creation time. Agent gets fixed list via function calling.

**Q: Can tools call other tools?**
A: No. Tools are atomic; they can't invoke other tools. Agent must orchestrate the chain.

**Q: What's the biggest gap vs. a full tool system?**
A: No input validation, no composition, no dynamic selection, fixed timeouts (30-60s).

---

## Read These Documents (In Order)

### 1. **START HERE** (This file, 5 minutes)
Your current location. Entry point and navigation guide.

### 2. **EXECUTIVE-SUMMARY** (1 page, 10 minutes)
High-level overview: what exists, how it works, key constraints, top risks, next steps.
- **For:** Product managers, decision-makers, architects
- **Goal:** Understand the tool system in 10 minutes
- **Read if:** You need a quick briefing

**File:** `AGENCY-TOOLS-EXECUTIVE-SUMMARY.md`

### 3. **QUICK-REF** (2 pages, reference)
Quick lookup tables: tool names, code locations, database columns, execution routing.
- **For:** Developers, anyone implementing features
- **Goal:** Find what you need without reading full docs
- **Read if:** You're implementing something and need a specific detail (tool config keys, API routes, etc.)

**File:** `AGENCY-TOOLS-QUICK-REF.md`

### 4. **COMPREHENSIVE RESEARCH** (8 pages, comprehensive)
Full technical audit: architecture, execution flow, current system, gaps, risks, recommendations.
- **For:** Tech leads, security reviewers, anyone extending the system
- **Goal:** Understand every part of the tools system in detail
- **Read if:** You're designing a feature that touches tools

**File:** `AGENCY-TOOLS-SYSTEM-RESEARCH.md`

### 5. **EXTENSION OPTIONS** (6 pages, implementation guide)
Detailed options for extending the tool system: custom tool UI, validation, composition, async support.
- **For:** Developers planning to extend tools
- **Goal:** Understand options, effort estimates, risks
- **Read if:** You're planning Phase 2+ features (custom tool creation, composition, async)

**File:** `AGENCY-TOOLS-EXTENSION-OPTIONS.md`

---

## Recommended Reading by Role

### Product Manager / Non-Technical
1. This file (5 min)
2. EXECUTIVE-SUMMARY (10 min)
3. Total: 15 minutes

### Developer (Implementing within existing system)
1. This file (5 min)
2. QUICK-REF (10 min, reference)
3. COMPREHENSIVE-RESEARCH sections 1-3 (15 min, architecture)
4. Total: 30 minutes, plus reference lookups

### Tech Lead (Planning extensions or security review)
1. This file (5 min)
2. EXECUTIVE-SUMMARY (10 min)
3. COMPREHENSIVE-RESEARCH (entire, 30 min)
4. EXTENSION-OPTIONS (25 min)
5. Total: 70 minutes

### Architect (Full system design)
1. All of the above (70 min)
2. Read related research:
   - `AI-AGENCY-CREATOR-RESEARCH-BRIEF.md` (tools are assigned during creation)
   - `TEAM-ROOM-SKILL-SELECTION-FLOW.md` (skills vs. tools difference)
3. Total: 2-3 hours

---

## Key Files to Read

| File | Purpose | Lines | Read Time |
|------|---------|-------|-----------|
| `00-AGENCY-TOOLS-START-HERE.md` | This file | - | 5 min |
| `AGENCY-TOOLS-EXECUTIVE-SUMMARY.md` | One-page overview | 300 | 10 min |
| `AGENCY-TOOLS-QUICK-REF.md` | Reference tables | 400 | 10 min (reference) |
| `AGENCY-TOOLS-SYSTEM-RESEARCH.md` | Comprehensive audit | 900 | 30 min |
| `AGENCY-TOOLS-EXTENSION-OPTIONS.md` | Implementation guide | 700 | 25 min |

---

## Key Code Locations (Cheat Sheet)

```
Frontend
├─ Tool selection UI:     apps/web/client/src/components/agency/ToolPicker.tsx (line 37)
├─ Tool list definition:  apps/web/server/routers/agency.ts (line 354)
└─ Tool config panel:     apps/web/client/src/components/agency/ToolConfigPanel.tsx

Database
├─ Tool definitions:      apps/web/drizzle/schema.ts (line 4764, agency_tools)
└─ Tool assignments:      apps/web/drizzle/schema.ts (line 4785, agency_agent_tools)

Python Backend
├─ Tool bridge creation:  python-backend/app/services/agency_tools.py (line 307)
├─ Tool resolution:       python-backend/app/services/agency_tools.py (line 352)
├─ Execution routing:     python-backend/app/services/agency_tools.py (line 156)
└─ Orchestrator:          python-backend/app/services/agency_orchestrator.py (line 268)
```

---

## 60-Second Summary

SmartSpecPro has a **hybrid tool system**:

**What exists:**
- 16 hardcoded builtin tools (web search, RAG, email, Slack, browser automation, etc.)
- Optional custom tools via database
- Pre-assignment per agent (not dynamic)
- Risk-based execution routing (low → HTTP, high → sandbox)

**How it works:**
1. User selects tools in ToolPicker (UI)
2. Config stored in `agency_agent_tools` table
3. At agent load time, Python creates tool bridge classes
4. Agent-swarm uses tools via function calling
5. Tools route by risk level to HTTP endpoints or sandbox

**Key gaps:**
- ❌ No input validation
- ❌ No tool composition
- ❌ No custom tool creation UI
- ❌ No async job support (30-60s timeout only)
- ❌ No dynamic tool selection (all pre-assigned)

**Recommended next:** Custom tool creation UI + input validation (Phase 1, 2 weeks)

---

## Architecture Diagram (ASCII)

```
┌─────────────────────────────────────────────────────────────┐
│ Agency Builder Frontend                                     │
│  └─ User selects tools in ToolPicker dialog               │
│     └─ Sends {agentId, toolId, toolConfig} via tRPC       │
└──────────────────────┬──────────────────────────────────────┘
                       │ saveBuilder
                       ▼
┌─────────────────────────────────────────────────────────────┐
│ Node.js Backend                                             │
│  ├─ listTools procedure (16 builtin + custom from DB)       │
│  ├─ saveBuilder inserts into agency_agent_tools            │
│  └─ /api/internal/tools/{name} endpoints for execution      │
└──────────────────────┬──────────────────────────────────────┘
                       │ Agency run starts
                       ▼
┌─────────────────────────────────────────────────────────────┐
│ Python Backend                                              │
│  ├─ resolve_tools_for_agent() — LEFT JOIN + merge config   │
│  ├─ create_tool_bridge() — agency-swarm BaseTool subclass │
│  └─ Execution routing:                                      │
│     ├─ LOW risk     → _execute_http()                       │
│     ├─ MEDIUM risk  → whitelist check, then _execute_http()│
│     ├─ HIGH risk    → whitelist check, then _execute_sandbox() │
│     └─ agency-call  → execute_agency_call() [native async]  │
└──────────────────────┬──────────────────────────────────────┘
                       │
                       ▼
        ┌──────────────────────────────┐
        │ Tool Execution               │
        │ HTTP wrapper or Sandbox or   │
        │ Direct Python function       │
        └──────────────────────────────┘
                       │
                       ▼
        ┌──────────────────────────────┐
        │ Result back to agent (string)│
        └──────────────────────────────┘
```

---

## Decision Trees

### "I need to create a custom tool right now"
→ Use **QUICK-REF** section "How to create a custom tool (via DB)"

### "I need to understand why a tool failed"
→ Read **COMPREHENSIVE-RESEARCH** section "Tool Execution Methods"

### "I'm designing a feature for custom tools"
→ Start with **EXTENSION-OPTIONS** section "Option 1: Custom Tool Creation UI"

### "I need to audit tool security"
→ Read **COMPREHENSIVE-RESEARCH** section "Risks" + **EXTENSION-OPTIONS** "SSRF" mitigation

### "I want to know the next steps for the tools system"
→ Read **EXTENSION-OPTIONS** "Recommended Implementation Order"

---

## Key Insights

1. **Tools are metadata + HTTP wrappers.** Most tools (14/16) are just URL + config; Python routes the query to Node.js endpoints.

2. **Pre-assignment, not dynamic.** Agents don't choose tools at runtime; tools are assigned when the agency is created.

3. **Risk-based routing.** Low-risk tools (RAG, email) execute HTTP. High-risk tools (browser, cmd) go to OpenSandbox.

4. **Config merging is a feature.** Tool configs come from two sources: tool-level defaults + agent-specific overrides. This enables flexible reuse.

5. **The biggest gap is validation.** Tools receive unvalidated JSON; no schema enforcement. This is both a risk and a missing feature.

---

## Questions or Issues?

- **Implementation:** See QUICK-REF and COMPREHENSIVE-RESEARCH
- **Planning new features:** See EXTENSION-OPTIONS
- **Security concerns:** See COMPREHENSIVE-RESEARCH "Risks" section
- **Code locations:** See QUICK-REF code locations table

---

## Document Updates

| Date | What Changed |
|------|---|
| 2026-03-22 | Initial complete research (all 5 documents) |

