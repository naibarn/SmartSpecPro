# Feature 051: Team Room Reuse Chat Pipeline — Usage Guide

## What Was Built

This feature refactors the team room execution pipeline to reuse the existing chat infrastructure (skill detection, prompt composition, LLM execution) instead of relying on a separate Python-bridge orchestrator. The result is:

1. **Skill detection for assistant-origin turns** — team room agents now go through `detectSkill()` to find the best-matching content skill based on the room objective, instead of always using a hardcoded "team-discussion-assistant" skill.

2. **Rich prompt composition** — agent turns now include persona segments (style instructions, gender particles, restrictions), entity memories from the user, scoped memories, and multi-turn conversation history with display names.

3. **Single Node.js LLM path** — all agent turns use `executeSkillLlmWithFallback()` through the Node.js backend. The Python team orchestrator bridge is completely removed.

4. **Legacy run cleanup** — a SQL migration and startup guard stop any old running/paused/queued runs that used the legacy pipeline.

## Key Files

### Modified Services
| File | Purpose |
|------|---------|
| `apps/web/server/services/roomIntentRouter.ts` | Skill detection for all origins (including assistant) |
| `apps/web/server/services/promptComposer.ts` | Full persona, memory, and history composition |
| `apps/web/server/services/teamRunSkillExecutor.ts` | Single Node.js LLM execution path |
| `apps/web/server/services/runEngine.ts` | Startup guard for legacy runs, removed dead code |
| `apps/web/server/services/internalSkills.ts` | Gutted (returns empty, team-discussion-assistant removed) |

### Removed Files
| File | Reason |
|------|--------|
| `apps/web/server/services/teamOrchestrationBridge.ts` | Python bridge no longer needed |
| `python-backend/app/services/team_orchestrator.py` | Python orchestrator removed |
| `python-backend/app/api/team_orchestrator_api.py` | Python endpoint removed |
| `python-backend/app/core/rate_limit.py` | Only used by team orchestrator |

### Migrations
| File | Purpose |
|------|---------|
| `apps/web/drizzle/0105_stop_legacy_team_runs.sql` | Stop running/paused/queued legacy runs |

### Test Files (74 tests total)
| File | Tests | Covers |
|------|-------|--------|
| `roomIntentRouter.enhanced.test.ts` | 7 | Assistant-origin skill detection |
| `promptComposer.enhanced.test.ts` | 11 | Persona, memory, history composition |
| `teamRunSkillExecutor.test.ts` | 19 | Node.js LLM execution, skill resolution |
| `teamRunIntegration.test.ts` | 6 | End-to-end routing → execution flow |
| `runEngine.migration.test.ts` | 5 | Migration SQL and journal entry |
| `runEngine.bridgeRemoval.test.ts` | 2 | Bridge removal verification |
| `internalSkills.cleanup.test.ts` | 4 | Internal skill removal |
| `roomIntentRouter.test.ts` | 3 | Original routing tests (updated) |
| `runEngine.test.ts` | 17 | Run engine pure functions (updated) |

## Commits

| Commit | Section | Description |
|--------|---------|-------------|
| `62d958ed` | 01 | Enable skill detection for assistant-origin messages |
| `393df7e5` | 02 | Enhance prompt composer with persona and memory |
| `942bdf99` | 03 | Refactor skill executor to single Node.js LLM path |
| `5956c528` | 04 | Remove Python team orchestrator bridge |
| `97de00f6` | 05 | Migration cleanup — stop legacy runs, remove internal skill |
| `abcc3587` | 06 | Integration test suite |

## How It Works

### Agent Turn Flow (After)

```
1. Room objective → routeRoomIntent(origin: "assistant")
2. detectSkill() finds matching content skill (e.g. "lifestyle-article-writer")
3. If confidence < 0.6 → fallback to "general-article-writer"
4. composePrompt() builds messages array:
   - System: persona segments (style, restrictions, gender particles)
   - System: entity memories + scoped memories
   - History: prior agent messages with display names
   - User: room objective
5. executeTeamRunSkillTurn() calls executeSkillLlmWithFallback()
6. Result: content + token counts + cost credits
```

### What Changed vs Before

| Before | After |
|--------|-------|
| Hardcoded `team-discussion-assistant` skill | Detected skill per objective |
| No persona in agent prompts | Full persona segments + gender particles |
| No entity memories | Entity memories from user's chat history |
| Flattened string prompt | Multi-turn message array with roles |
| Python bridge → team_orchestrator.py → LLM | Direct Node.js → LLM |
| UUID-based sender labels | Display name labels (e.g. "[Content Director]") |

## Manual Verification

See `section-06-testing.md` for the full manual verification checklist covering:
- Thai/English objective response quality
- No content repetition across turns
- Skill detection in audit logs
- Entity memory presence
- Python backend not called
- Run lifecycle (start/pause/resume/stop)
