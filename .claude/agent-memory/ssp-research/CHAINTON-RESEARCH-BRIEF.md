# Research Brief: chainTo Skill Chaining System

**Research Date**: 2026-03-11
**Status**: RESEARCH COMPLETE
**Scope**: Complete data flow from skill.md definition to chat router exposure

---

## Findings

### Discovered Architecture
SmartSpecPro implements a **two-level skill chaining system** with complete YAML parsing and database storage, but **no automatic execution**. The system exposes metadata for client-side chaining logic.

### Two Chain Levels
1. **Skill-Level Chain**: `chainTo: skill-slug` in skill.md frontmatter — global, applies to all invocations
2. **Pattern-Level Chain**: Per-trigger override in `triggerPatterns` JSON array — specific to matched pattern

### Existing Implementations (Live Examples)
- **Image Prompt Engineer** (`image_prompt_engineer`) → chains to `image-creator`
- **Video Prompt Engineer** (`video-prompt-engineer`) → chains to `video-creator`

### Key Finding: Metadata-Only System
The chainTo infrastructure is **fully built but not auto-executed**. The system:
- ✅ Parses chainTo from YAML
- ✅ Stores in database
- ✅ Exposes to chat router (via tRPC)
- ❌ Does NOT automatically trigger chained skill after execution
- ❌ Does NOT pass first skill's output to chained skill

---

## Current Architecture

### Data Flow: Skill Definition → Detection → Client

```
skill.md (YAML)
  ├─ chainTo: video-creator (skill-level)
  ├─ triggerPatterns:
  │   └─ pattern: "create video"
  │     └─ chainTo: video-creator-pro (per-pattern override)
  │
  ↓ parseSkillFile() [parser.ts:14]

SkillMetadata { chainTo, chain_to }
  ↓ normalizeMetadata() [parser.ts:182-204]

SkillMetadata normalized
  ├─ chainTo: "video-creator-pro"
  ├─ triggerPatterns: [...PatternRule[]]
  │
  ↓ autoSyncSkillsFromFolder() [skillRegistry.ts:255]

Database: skills table
  ├─ chainTo: varchar(100)
  ├─ triggerPatterns: json<Array<string | PatternRule>>
  │
  ↓ SkillDefinition loaded [skillRegistry.ts:77-164]

SkillDefinition
  ├─ chainTo: "video-creator-pro"
  ├─ triggers: TriggerRule[] with per-pattern chainTo
  │
  ↓ detectSkill() [skillDetector.ts:130-155]

SkillDetectionResult
  ├─ skill: SkillDefinition with chainTo
  ├─ patternChainTo: "video-creator-pro" (from matched trigger)
  │
  ↓ chat.detectSkill() [chat.ts:1087-1137]

tRPC Response (exposed to client)
  ├─ skill.chainTo: "video-creator-pro"
  ├─ patternChainTo: "video-creator-pro" (precedence over skill.chainTo)
```

### File Locations

| Component | File | Lines | Purpose |
|-----------|------|-------|---------|
| **Parser** | `packages/skills/src/parser.ts` | 14-28, 136-159, 182-204 | Parse YAML frontmatter, extract chainTo |
| **Types** | `packages/skills/src/types.ts` | 26-47, 133-180 | TriggerRule, PatternRule, SkillMetadata, SkillDetectionResult |
| **Registry** | `apps/web/server/services/skillRegistry.ts` | 69-72, 317, 359, 452 | Store/sync chainTo to DB, convert to SkillDefinition |
| **Detection** | `apps/web/server/services/skillDetector.ts` | 147-148 | Detect matched pattern's chainTo |
| **Router** | `apps/web/server/routers/chat.ts` | 1128, 1134 | Expose chainTo + patternChainTo to client |
| **Schema** | `apps/web/drizzle/schema.ts` | 2337-2341, 2377 | Database columns: triggerPatterns (json), chainTo (varchar) |
| **Tests** | `apps/web/server/__tests__/skillsParser.test.ts` | 15-29 | Test chainTo normalization |

### Execution Flow: NOT AUTO-TRIGGERED

The `executeSkill()` procedure (chat.ts:1211-1600):
- ✅ Loads skill metadata (including chainTo)
- ✅ Executes skill based on mode (llm-only, media-generate, etc.)
- ❌ **Does NOT check chainTo after execution**
- ❌ **Does NOT invoke chained skill**
- ⚠️ Returns result to client (client must handle chaining)

### Credit Deduction: Independent Per Skill

**No special handling for chained skills**:
- Each skill execution deducts credits separately
- `deductCredits()` (creditService.ts:134) has optional `skillSlug` parameter for tracking
- Chain execution = 2x deductions (one per skill)
- Example: Image Prompt Engineer (1 credit) + Image Creator (5 credits) = 6 total

---

## Risks

### 1. Unvalidated Chain Target
**Risk**: Client can execute skill referencing non-existent chainTo target
- **Cause**: No validation that target skill exists
- **Impact**: Silent failure or unclear error
- **Mitigation**: Client should validate skill exists before accepting chainTo

### 2. Undefined Output Passthrough
**Risk**: No mechanism to pass first skill's output to second skill
- **Cause**: Each executeSkill() call is isolated; no result capture
- **Impact**: Chained skills can't use previous output (defeats purpose)
- **Mitigation**: Client must manually extract relevant field from result and pass to next skill

### 3. Infinite Loop Potential
**Risk**: Circular chains (A → B → A) would cause infinite loops if auto-executed
- **Cause**: No cycle detection in chain validation
- **Impact**: Could hang the system
- **Mitigation**: Depth limit (max 3 hops) if implementing auto-execution

### 4. No User Confirmation
**Risk**: Silent automatic chaining could surprise users with unexpected credit deductions
- **Cause**: System doesn't prompt "Chain to video-creator?" before executing next skill
- **Impact**: Confusion about credit usage
- **Mitigation**: Implement opt-in or explicit confirmation before chaining

### 5. Per-Pattern Precedence Ambiguity
**Risk**: Two chainTo values (skill-level + pattern-level) could confuse client logic
- **Cause**: Both values returned; precedence is client's responsibility
- **Impact**: Client might apply wrong chain target
- **Mitigation**: Document precedence rule clearly; consider server-side precedence enforcement

---

## Options

### Option A: Client-Driven Chaining (Current State)
**Status**: Partially implemented
**Client receives both chainTo values**, decides whether/when to execute chained skill

**Pros**:
- User has full control
- No surprise auto-execution
- Flexible handling (conditional chains, loops, etc.)
- Simple server implementation

**Cons**:
- Requires client UI logic for chaining
- Output passthrough must be client-implemented
- Defeats "automatic" skill chaining purpose

**Effort**: 0 server changes (client-only implementation)

---

### Option B: Automatic Skill Chaining (Full Implementation)
**Status**: Not implemented
**Server automatically executes chained skill after first skill completes**

**Features**:
1. After executeSkill() returns result
2. Check skill.chainTo (or patternChainTo from detection)
3. Extract relevant output field (e.g., `result.message` for prompts)
4. Automatically invoke executeSkill(chainTo, { input: extractedOutput })
5. Return chained result to client

**Code changes needed**:
- executeSkill() → detect chainTo, invoke chained skill
- Output extraction logic (prompt → image generation, etc.)
- Depth tracking (prevent infinite loops)
- Deduct credits for both skills
- UI updates to show chaining in progress

**Pros**:
- True "one-click" skill chains
- Matches user mental model (prompt engineer → image creator)
- Reduced credit waste (one deduction per chain)

**Cons**:
- High complexity (output extraction patterns per skill pair)
- Potential for infinite loops
- Hard to debug multi-step failures
- Breaking change (current manual workflows)

**Effort**: 8-12 hours (skill output schema mapping, error handling, depth limits)

---

### Option C: Hybrid: Auto-Chain with User Control
**Status**: Recommended approach
**Server auto-executes chainTo, but client can disable per-conversation**

**Features**:
- Auto-execute chainTo unless user disables
- Conversation setting: `autoChainSkills: true/false`
- Clear UI indication of chaining ("Image Prompt Engineer → Image Creator")
- Output extraction from predefined mappings (prompt skills → image/video)

**Code changes needed**:
- Extend conversation settings with autoChainSkills flag
- executeSkill() → check setting before chaining
- Per-skill-pair output mappings (configuration)
- Audit logging of chained executions

**Pros**:
- Balanced: automatic for power users, manual for caution
- Better UX than manual linking
- Respects user preferences
- Easier than full automation

**Cons**:
- Moderate complexity
- Still requires output extraction logic
- Client settings proliferation

**Effort**: 5-8 hours

---

## Recommendation

**Implement Option C: Hybrid Auto-Chain with User Control**

### Rationale
1. **Existing Use Cases Ready**: Image/Video Prompt Engineers already defined with chainTo
2. **User Safety**: Opt-out per-conversation prevents surprise behavior
3. **Moderate Effort**: Less than full auto-chaining, more valuable than manual-only
4. **Extensible**: Easy to add more skill pairs later

### Implementation Steps
1. **Phase 1 (2 hours)**: Output extraction mappings for existing pairs
   - Prompt Engineer output (enhanced prompt) → Image/Video Creator input
   - Define field extraction rules

2. **Phase 2 (2 hours)**: Auto-chain logic in executeSkill()
   - Check conversation.autoChainSkills
   - After skill execution, if chainTo exists, invoke chained skill with extracted output
   - Aggregate results (both skills' outputs in response)

3. **Phase 3 (2 hours)**: UI/UX
   - Conversation settings toggle for auto-chaining
   - Show "Prompt → Image" chaining status
   - Separate result display for each skill in chain

4. **Phase 4 (1 hour)**: Testing
   - Happy path: Prompt Engineer + Image Creator workflow
   - Error handling: Chained skill fails
   - Loop detection: Prevent infinite chains

---

## Open Questions

1. **Output Extraction**: What output field from Image Prompt Engineer should feed to Image Creator?
   - Current: Result is `{ success, message, ... }` — is `message` the prompt?
   - Need: Define extraction rules per skill pair

2. **Failed Chains**: If chained skill fails, should first skill's result still succeed?
   - Options:
     - a) Return first skill result + error from chained skill
     - b) Rollback first skill result + return combined error
     - c) Partial credit refund for failed chain

3. **Chain Depth Limit**: Maximum depth for chains?
   - Current: 0 (no limit, not enforced)
   - Recommendation: 3 (prevent most loops, allow reasonable workflows)

4. **Skill Pair Documentation**: How are valid chain pairs documented?
   - Current: Ad-hoc (image-prompt-engineer → image-creator)
   - Need: Explicit registry or validation rules

5. **Credit Granularity**: Should chained skills cost less than manual execution?
   - Current: Same cost (independent deduction)
   - Alternative: Discount (e.g., -20%) for chained skills to incentivize usage

6. **Per-Pattern Precedence**: Should pattern-level chainTo truly override skill-level?
   - Current: Both exposed; client decides
   - Recommendation: Clarify in docs; consider server-side enforcement

---

## Summary Table

| Aspect | Status | Details | Action |
|--------|--------|---------|--------|
| **YAML Definition** | ✅ Complete | `chainTo: skill-slug` in frontmatter | None needed |
| **Parsing** | ✅ Complete | `normalizeMetadata()` extracts chainTo | None needed |
| **Pattern-Level Chains** | ✅ Complete | triggerPatterns JSON with per-pattern chainTo | None needed |
| **Database Schema** | ✅ Complete | `varchar(100)` + `json` columns | None needed |
| **Registry Sync** | ✅ Complete | Auto-sync folder → DB | None needed |
| **Detection** | ✅ Complete | Exposes patternChainTo | None needed |
| **Chat Router** | ✅ Complete | Returns both chainTo values | None needed |
| **Auto-Execution** | ❌ Not Implemented | No automatic chaining | **Recommend Option C** |
| **Output Passthrough** | ❌ Not Implemented | No result capture/reuse | **Depends on Option C** |
| **Loop Detection** | ❌ Not Implemented | No depth limits | **Add if auto-chaining** |
| **User Confirmation** | ❌ Not Implemented | No opt-in/opt-out | **Add with Option C** |

