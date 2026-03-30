# Interview Transcript — Spec 053

Date: 2026-03-22

---

## Q1: ReAct executor LLM call pattern?

**Answer:** OpenAI SDK via gateway (Recommended)
- Use `AsyncOpenAI(base_url=NODEJS_URL/v1)` — same pattern as `AgencySwarmAdapter._create_model()`
- Supports structured tool calling, streaming, usage stats
- Credits deducted automatically through Node.js gateway

## Q2: Level 1 Agentic Mode — implement now or wait for 052?

**Answer:** 052 เสร็จถึง section-11 แล้วทำต่อได้เลย
- Wait for 052 to reach section-11 (structured output), then Level 1 can start
- Level 1 has minimal 052 dependency (just prompt + reflection loop)
- Can run alongside remaining 052 sections

## Q3: Long-term memory scope?

**Answer:** Per-user only (Recommended)
- Each user sees only their own memories
- No cross-user shared memories
- No admin promotion of memories to agency-wide
- Simplest, safest, no privacy concerns

## Q4: Cross-agency delegation in Level 3?

**Answer:** Cross-agency via builtin-agency-call
- Autonomous agent CAN delegate to other agencies (not just agents in same agency)
- Must reuse existing `builtin-agency-call` tool with its depth tracking
- Need to integrate delegation_depth counter with existing `current_depth` in `agency_call_tool.py`

## Q5: Implementation plan structure?

**Answer:** Group by Level (Recommended)
- Sections organized Level 1 → Level 2 → Level 3
- Each level is independently deliverable
- Follows natural dependency order

## Q6: Provider-specific optimizations?

**Answer:** All providers equal
- Use OpenAI-compatible API uniformly
- No provider-specific optimizations in initial implementation
- Strategy interface is extensible for future per-provider tuning
