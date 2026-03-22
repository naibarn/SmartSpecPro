---
name: Team Room Skill Selection Quick Reference
description: One-page diagram and decision tree for skill selection flow
type: project
---

# Team Room Skill Selection — Quick Reference

## One-Page Flow

```
run.objective (message)
    │
    ├─ routeRoomIntent(message, origin:"assistant", context:"run_turn")
    │
    ├─ [IF origin != "human_user"] ← TEAM RUNS TAKE THIS PATH
    │  │
    │  ├─ detectSkill(message, conversationId:undefined, userId:undefined)
    │  │  │
    │  │  ├─ enabledSkillIds = skills.filter(s => s.enabledByDefault)
    │  │  ├─ For each skill: match message.regex against trigger.regex
    │  │  ├─ Calculate confidence
    │  │  └─ Return: { detected, skill, confidence, matchedTrigger }
    │  │
    │  ├─ IF confidence >= 0.6
    │  │  └─ selectedSkillId = detected_skill.id [source: "skill-detect"]
    │  │
    │  └─ ELSE
    │     └─ selectedSkillId = "general-article-writer" [source: "fallback"]
    │
    └─ executeTeamRunSkillTurn(route: { selectedSkillId, reason })
       │
       ├─ skill = getSkillByIdAsync(selectedSkillId)
       ├─ assistantContext = buildPersonaContext(assistant, persona)  ← INJECTED HERE
       ├─ messages = [ skill.systemPrompt, ...composed.messages, personaContext ]
       └─ LLM calls with final prompt
```

## Decision Tree

```
Team Run Turn Starts
    │
    ├─ Who speaks? → resolveCurrentAssistantId()
    │   └─ Returns: orchestrator OR lead OR first assistant
    │
    ├─ What do they know? → resolveAssistantTurnContext()
    │   ├─ assistantProfiles row
    │   ├─ personaTemplates (via FK)
    │   └─ agencyAgents (via FK)
    │
    ├─ What should they do? → routeRoomIntent()
    │   │
    │   ├─ Agency signal? (workflow, orchestrate, delegate)
    │   │  └─ route: "agency"
    │   │
    │   ├─ Skill match? (detect() >= 0.6)
    │   │  ├─ YES: route: "skill", selectedSkillId
    │   │  └─ NO: route: "skill", selectedSkillId: "general-article-writer"
    │   │
    │   └─ FALLBACK: route: "chat"
    │
    ├─ How do they respond? → executeTeamRunSkillTurn()
    │   ├─ Load skill definition
    │   ├─ Compose LLM messages (skill prompt + room context + PERSONA CONTEXT)
    │   ├─ Execute LLM
    │   └─ Return: content, tokens, cost
    │
    ├─ Who speaks next? → getNextSpeaker()
    │   ├─ Check: [NEXT: name] hint in response
    │   ├─ Check: consecutive turn limit (max 3)
    │   ├─ Check: loop detection (same 2 agents alternating)
    │   └─ Return: nextAssistantId + reason
    │
    ├─ Should we stop? → checkAndAutoStop()
    │   ├─ Max rounds? Max duration? Budget exceeded? Idle timeout?
    │   └─ IF yes: stopRun() + generateSummary()
    │
    └─ Continue? → evaluateAutoTeamLoopDecision()
        ├─ Open assistant-actionable work items? → continue
        ├─ Waiting for human approval? → pauseRun()
        ├─ Waiting for external member? → pauseRun()
        └─ No actionable items? → end
```

## Confidence Thresholds

| Context | Threshold | Fallback |
|---------|-----------|----------|
| **Assistant Turn** (team runs) | >= 0.6 | `general-article-writer` |
| **Human Turn** (chat) | >= 0.7 | Intent classifier, then `general-article-writer` |
| **Explicit Skill Request** | (optional classifier) | Any skill if explicitly named |

## Persona Integration Points

| Where | Input | Output |
|-------|-------|--------|
| **Load** | `assistant.personaId` | `personaTemplates` row |
| **Context** | `persona.systemPromptPrefix` + `persona.tone` + `persona.language` | `personaContext` string |
| **Inject** | `personaContext` | Added to LLM system prompt (final messages array) |
| **Model** | `assistant.preferredModelId` | Used in `resolveSkillExecutionPolicy()` |
| **Language** | `assistant.preferredLanguage` | **NOT USED** in skill selection (only context) |

## Key Code Locations

| Component | File | Lines | Purpose |
|-----------|------|-------|---------|
| **Run Lifecycle** | `runEngine.ts` | 875-1045 | `runNextTurn()` main loop |
| **Routing** | `roomIntentRouter.ts` | 37-150 | `routeRoomIntent()` decision |
| **Detection** | `skillDetector.ts` | 60-155 | `detectSkill()` trigger matching |
| **Execution** | `teamRunSkillExecutor.ts` | 70-162 | `executeTeamRunSkillTurn()` |
| **Turn Order** | `turnOrderEngine.ts` | 98-170 | `getNextSpeaker()` |
| **Skill Registry** | `skillRegistry.ts` | 656-815 | `getSkillByIdAsync()`, `getAvailableSkills()` |
| **Stop Checking** | `runEngine.ts` | 1207-1282 | `checkAndAutoStop()`, `startAutoStopChecker()` |

## What Affects Skill Selection ✅ vs ✗

### ✅ DOES Affect Selection
- Message content (triggers, keywords)
- Skill priority (higher priority checked first)
- Skill `enabledByDefault` flag
- Confidence threshold (0.6 for assistant, 0.7 for human)

### ✗ Does NOT Affect Selection
- Assistant persona
- Assistant preferred language
- Team configuration
- Room configuration
- Room participants
- Work items
- Conversation history (conversationId=undefined)
- User skill visibility (userId=undefined)

## Critical Handoff Points

```
runEngine.runNextTurn()
    │ Loads assistant + persona context
    │ (personaContext built but NOT YET USED)
    │
    └──> routeRoomIntent()
         │ Detects skill IGNORING persona
         │ Detects skill IGNORING language
         │ Returns selectedSkillId
         │
         └──> executeTeamRunSkillTurn()
              │ Receives selectedSkillId
              │ INJECTS personaContext into LLM messages
              │ (Persona shapes response, not selection)
              │
              └──> LLM responds
                   │ Uses both:
                   │   - Skill's systemPrompt
                   │   - Persona's systemPromptPrefix + tone
                   │ (Mixed in final messages array)
                   │
                   └──> Response returned + parsed for [NEXT: name]
```

## Common Scenarios

### Scenario 1: Thai-Speaking Orchestrator
```
orchestrator.preferredLanguage = "th"
Message: "เขียน" (write)
         │
         └─ detectSkill("เขียน", conversationId:undefined)
            └─ No Thai trigger pattern exists (triggers are English)
            └─ Confidence = 0 (no match)
            └─ Uses fallback: "general-article-writer"

RESULT: Even though agent is Thai, English skill is used.
PERSONA CONTEXT: "Preferred language: Thai" added to LLM system prompt,
                 so LLM will respond IN THAI.
```

### Scenario 2: Multi-Agent Turn Sequence
```
Turn 1: Orchestrator speaks
         │ detectSkill(objective) → Skill A selected
         │ Persona Context injected
         │ LLM produces response with [NEXT: Reviewer]

Turn 2: Reviewer speaks (because of [NEXT:] hint)
         │ detectSkill(objective) → Skill B selected (may be different from Turn 1)
         │ Reviewer's Persona Context injected
         │ LLM produces response with [NEXT: Specialist]

Turn 3: Specialist speaks
         │ ... same pattern ...
```

### Scenario 3: Low Confidence Fallback
```
Message: "Check this document"
Regex Match: "check" (0.55 confidence, below 0.6 threshold)
             │
             └─ FALLBACK: "general-article-writer" used
             │ Reason: "assistant_content_fallback"
             │ Source: "fallback"
             │ Confidence: 0.5
```

## Testing Checklist

- [ ] Language switch: Thai input with Thai-speaking agent → does output use Thai?
- [ ] Confidence boundary: 0.59 vs 0.60 threshold difference
- [ ] Multi-run preference: Does skill selection differ across runs in same room?
- [ ] Persona override: Can persona context make a fallback skill work better?
- [ ] Next speaker hint: Does [NEXT: name] override turn order strategy?

---

**See Also:** TEAM-ROOM-SKILL-SELECTION-FLOW.md (comprehensive, with gap analysis and recommendations)
