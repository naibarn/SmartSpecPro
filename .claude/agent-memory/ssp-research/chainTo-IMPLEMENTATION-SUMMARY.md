# chainTo Implementation Summary

**Research Completed**: 2026-03-11
**Researcher**: CMD-1 (SmartSpecPro Research Agent)
**Classification**: Complete Architecture Discovery

---

## Executive Summary

SmartSpecPro implements a **complete skill chaining metadata system** with two-level chain definitions (skill-level + pattern-level), database persistence, parsing, detection, and client exposure. However, **no automatic execution** is currently implemented — the system exposes metadata for client-side chaining logic.

### Current State
- ✅ **100% metadata infrastructure** (definition, parsing, storage, detection, exposure)
- ❌ **0% auto-execution** (skills do not automatically chain)
- ❌ **0% output passthrough** (no mechanism to pass output between skills)
- ⚠️ **Credit system ready** (per-skill deduction, no special handling needed)

---

## What You Need to Know (TL;DR)

### How chainTo Works (Today)
1. Skill author defines `chainTo: target-skill` in YAML frontmatter
2. System parses, stores in database, detects matched patterns
3. Chat API exposes both `skill.chainTo` and `patternChainTo` to client
4. **Client sees both values** but system does NOT auto-execute chained skill

### Two Chain Types
| Type | Scope | Example |
|------|-------|---------|
| **Skill-Level** | All invocations | `image_prompt_engineer` → `image-creator` |
| **Pattern-Level** | Specific trigger | Pattern "create professional prompt" → `image-creator-pro` |

### Precedence
`patternChainTo` > `chainTo` > null

### Live Examples
- Image Prompt Engineer: `chainTo: image-creator`
- Video Prompt Engineer: `chainTo: video-creator`

---

## Key Findings by Component

### Parser (`packages/skills/src/parser.ts`)
✅ **Fully Implemented**
- Extracts chainTo from YAML frontmatter (line 14-28)
- Parses per-pattern chainTo in triggerPatterns JSON (line 136-159)
- Normalizes both camelCase and snake_case (line 182-204)
- Validates regex patterns (line 108-130)

### Types (`packages/skills/src/types.ts`)
✅ **Fully Implemented**
- TriggerRule with optional chainTo (line 26-35)
- PatternRule for JSON serialization (line 40-47)
- SkillMetadata with dual format support (line 133-170)
- SkillDefinition with skill-level chainTo (line 49-128)
- SkillDetectionResult with patternChainTo (line 172-180)

### Database (`apps/web/drizzle/schema.ts`)
✅ **Fully Implemented**
- `skills.chainTo` column: varchar(100) (line 2377)
- `skills.triggerPatterns` column: JSON with PatternRule[] (line 2337-2341)
- Both nullable, both auto-synced from skill.md

### Registry (`apps/web/server/services/skillRegistry.ts`)
✅ **Fully Implemented**
- Auto-sync from folder to database (line 255-500)
- Chain target extraction (line 69-72)
- DB → SkillDefinition conversion (line 77-164)
- Updates on content hash change (line 317, 359, 452)

### Detection (`apps/web/server/services/skillDetector.ts`)
✅ **Fully Implemented**
- Extracts patternChainTo from matched trigger (line 147-148)
- Returns in SkillDetectionResult

### Chat Router (`apps/web/server/routers/chat.ts`)
✅ **Partially Implemented**
- `chat.detectSkill()` exposes both chainTo values (line 1128, 1134)
- `chat.executeSkill()` has NO chainTo handling (line 1211-1600)

### Credit System (`apps/web/server/services/creditService.ts`)
⚠️ **Not Required Yet**
- Per-skill credit tracking ready (skillSlug parameter)
- No special logic needed for chains

---

## Architecture Diagram

```
┌─ Skill Definition ──────────────────────────────────────┐
│                                                         │
│  skill.md (YAML)                                        │
│  ├─ chainTo: image-creator                              │
│  └─ triggerPatterns:                                    │
│      └─ chainTo: override (per-pattern)                 │
│                                                         │
└──────────┬──────────────────────────────────────────────┘
           ↓
┌─ Parser ───────────────────────────────────────────────┐
│                                                         │
│ parseSkillFile() [line 14]                              │
│   ↓                                                     │
│ normalizeMetadata() [line 182]                          │
│   ├─ chainTo: "image-creator"                           │
│   └─ triggerPatterns: TriggerRule[]                     │
│        └─ chainTo: "override"                           │
│                                                         │
└──────────┬──────────────────────────────────────────────┘
           ↓
┌─ Database ─────────────────────────────────────────────┐
│                                                         │
│ skills table [schema.ts:2298]                           │
│   ├─ chainTo VARCHAR(100) [line 2377]                   │
│   └─ triggerPatterns JSON [line 2337]                   │
│                                                         │
└──────────┬──────────────────────────────────────────────┘
           ↓
┌─ Registry ─────────────────────────────────────────────┐
│                                                         │
│ autoSyncSkillsFromFolder() [line 255]                   │
│   ↓                                                     │
│ SkillDefinition {                                       │
│   chainTo: "image-creator",                             │
│   triggers: TriggerRule[] with per-pattern chainTo      │
│ }                                                       │
│                                                         │
└──────────┬──────────────────────────────────────────────┘
           ↓
┌─ Detection ────────────────────────────────────────────┐
│                                                         │
│ detectSkill() [skillDetector.ts:130]                    │
│   ↓                                                     │
│ SkillDetectionResult {                                  │
│   skill.chainTo: "image-creator",                       │
│   patternChainTo: "override" (if matched)               │
│ }                                                       │
│                                                         │
└──────────┬──────────────────────────────────────────────┘
           ↓
┌─ Chat API ─────────────────────────────────────────────┐
│                                                         │
│ chat.detectSkill() [chat.ts:1087]                       │
│   ↓                                                     │
│ Returns to Client:                                      │
│ {                                                       │
│   skill: { chainTo: "image-creator" },                  │
│   patternChainTo: "override"                            │
│ }                                                       │
│                                                         │
└──────────┬──────────────────────────────────────────────┘
           ↓
┌─ Client (Browser) ─────────────────────────────────────┐
│                                                         │
│ Receives chainTo metadata                               │
│ CLIENT DECIDES:                                         │
│   - Show "Chain to image-creator?" prompt?              │
│   - Auto-execute if autoChainSkills = true?             │
│   - Ignore and execute skill only?                      │
│                                                         │
└────────────────────────────────────────────────────────┘

❌ MISSING: Auto-execution in chat.executeSkill()
```

---

## Decision Matrix: Implementing Auto-Chaining

| Option | Effort | User Experience | Risk | Recommendation |
|--------|--------|-----------------|------|----------------|
| **A: Manual Only** | 0 hrs | Low (full control) | Low | Current state |
| **B: Auto-Chain** | 8-12 hrs | High (magic) | High (loops, output) | Too risky |
| **C: Hybrid** | 5-8 hrs | Good (opt-in) | Medium | **RECOMMENDED** |

**Option C**: Server auto-chains if `conversation.autoChainSkills=true`, with user toggle and output extraction.

---

## What Needs to Be Done (If Implementing)

### Phase 1: Output Extraction (2 hours)
Define what field from each skill feeds to the next:
- Image Prompt Engineer → Image Creator: Extract `result.message` (enhanced prompt)
- Video Prompt Engineer → Video Creator: Extract `result.message` (prompt)
- General pattern: Assume `result.message` is the chainable output

### Phase 2: Auto-Execution Logic (2 hours)
In `chat.executeSkill()` (chat.ts:1211):
```
1. Execute primary skill
2. If skill.chainTo exists AND conversation.autoChainSkills == true:
   a. Extract output field from result
   b. Validate target skill exists
   c. Invoke executeSkill(chainTo, { prompt: output })
   d. Return combined results
3. Else: Return primary result only
```

### Phase 3: Conversation Settings (1 hour)
Add to conversations table:
```sql
ALTER TABLE conversations ADD COLUMN autoChainSkills BOOLEAN DEFAULT true;
```

### Phase 4: UI/UX (2 hours)
- Toggle in conversation settings
- Show chaining progress ("Generating prompt... → Generating image...")
- Display both results with clear separation

### Phase 5: Testing (1-2 hours)
- Happy path: Image Prompt Engineer → Image Creator
- Error handling: Chained skill fails
- Loop prevention: Circular chains blocked

---

## Files to Modify (If Implementing)

1. **chat.ts** (2-3 hrs) — Add chainTo logic to executeSkill()
2. **schema.ts** (0.5 hr) — Add autoChainSkills to conversations
3. **skillRegistry.ts** (0.5 hr) — Add validation for chainTo targets
4. **New: chainToService.ts** (2 hrs) — Extract output, execute chains
5. **Client UI** (2+ hrs) — Settings toggle, progress indicator

---

## Open Questions

1. **Output Extraction**: What if chainTo skill expects different input format?
   - Answer: Define per-skill-pair extraction rules, start with "message" field

2. **Failed Chains**: Refund credits if chained skill fails?
   - Answer: No, each skill is independent execution

3. **Loop Prevention**: Max depth?
   - Answer: 3 hops max (prevents infinite loops, allows useful chains)

4. **User Notification**: Should we always show chaining, or auto-hide?
   - Answer: Show initially, hide after user's first interaction

5. **Skill Pair Documentation**: How to declare valid chains?
   - Answer: Current system (explicit chainTo) is good enough; no additional registry needed

---

## Success Criteria

| Criterion | Current | Target |
|-----------|---------|--------|
| Define chainTo in YAML | ✅ | ✅ |
| Store in database | ✅ | ✅ |
| Detect in user messages | ✅ | ✅ |
| Expose to client | ✅ | ✅ |
| Auto-execute on user request | ❌ | ✅ |
| Pass output between skills | ❌ | ✅ |
| Show progress UI | ❌ | ✅ |
| User can disable per-conversation | ❌ | ✅ |
| Prevent infinite loops | N/A | ✅ |

---

## Research Artifacts

All detailed findings in companion documents:

| Document | Content |
|----------|---------|
| **chainTo-skill-chaining-system.md** | Complete technical documentation (data flow, types, gaps) |
| **chainTo-CODE-LOCATIONS.md** | Line-by-line code references (3,000+ characters) |
| **chainTo-QUICK-REFERENCE.md** | Quick lookup table and summary |
| **CHAINTON-RESEARCH-BRIEF.md** | Full research brief (findings, architecture, risks, options, recommendation) |

---

## Final Recommendation

**Implement Option C: Hybrid Auto-Chain with User Control**

**Why**:
- Existing skills (image/video prompt engineers) are ready
- Reasonable effort (5-8 hours total)
- Good UX (automatic for power users, optional for cautious users)
- Reversible (can disable if problems arise)
- Extensible (easy to add more skill pairs)

**Start With**: Image Prompt Engineer → Image Creator (simplest case, high value)

**Timeline**:
- Phase 1-2 (Extraction + Logic): 4 hours
- Phase 3-4 (Settings + UI): 3 hours
- Phase 5 (Testing): 1-2 hours
- **Total: 8-9 hours, can span 1-2 sprints**

