# Interview Transcript — Feature 051: Team Room Reuse Chat Pipeline

## Auto-Decisions (technical — decided from codebase research)

1. **Keep `composePrompt()` as base context builder** — it has token budgeting (PERSONA_BUDGET=2000, MEMORY_BUDGET=1500, HISTORY_BUDGET_FRACTION=0.6) which Chat lacks
2. **Add `buildPersonaPromptSegments()` into `composePrompt()`** — for Thai gender particles (ค่ะ/คะ/ครับ), tone, style instructions
3. **Add `detectSkill()` call in `roomIntentRouter` for assistant origins** — reuse existing bilingual skill detection
4. **Keep `teamRoomMessages` table separate** — different metadata needs (threading, work items, citations)
5. **Keep `executeSkillLlmWithFallback()` as LLM entry** — it wraps `executeWithFallback()` correctly with retries + cost
6. **Follow existing Vitest patterns** for new tests

## User Decisions

### Q1: Skill prompt strategy when agent turn uses detected skill?
**Answer: แทนที่ทั้งหมด (Replace entirely)**
- Use detected skill's system prompt instead of team-discussion prompt
- Same behavior as Chat — skill prompt is the source of truth
- team-discussion-assistant becomes unnecessary

### Q2: Memory scope — shared or per-agent?
**Answer: Shared memory**
- All agents share the same user memory (entity memories)
- Same as Chat where different personas share the same memory
- Per-agent memory can be added later as enhancement
- Simpler implementation, maintains feature parity with Chat

### Q3: Python team_orchestrator.py — keep or remove?
**Answer: ลบทั้งหมด (Remove entirely)**
- Remove Python execute-turn endpoint completely
- Move tool-calling (MCP) to Node.js side if needed
- Eliminates the broken Python ↔ Node.js bridge
- One less service to maintain

### Q4: Backward compatibility for existing runs?
**Answer: Reset ทั้งหมด (Reset all)**
- Remove old runs completely, start fresh
- No migration needed — existing runs were broken anyway
- Clean slate approach

### Q5: Which Chat features to include in Team Room?
**Answer: ใส่ทุกอย่าง (Include everything)**
- Skill detection + memory + persona + language — all Chat features
- Google Drive tools context — include
- Conversation summaries — include (alongside existing compressHistory)
- Full feature parity with Chat
