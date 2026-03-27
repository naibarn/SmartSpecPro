---
name: Chat.tsx Infrastructure Research for Agency Integration
description: Complete research brief for implementing inline agency trigger detection, agency quick-launch button, and skill/agency disambiguation UI in Chat.tsx
type: project
---

# Research Brief: Chat Infrastructure for Agency Integration

## Executive Summary

The Chat.tsx page is a complex React component (977 lines) that manages conversations, right-panel display (memory, skills, artifacts), and browser sessions. The skill detection and selection infrastructure is well-established and provides a reusable pattern for agency integration. This brief documents:

1. Chat.tsx layout and architecture
2. Existing skill detection and selection patterns
3. Agency detection mechanism (already implemented)
4. Data flow for message sending
5. Recommended integration points for 3 features:
   - Inline agency trigger detection in message input
   - Agency quick-launch button in top bar
   - Skill/agency disambiguation UI

---

## 1. Chat.tsx Structure & Layout Map

### Overall Architecture
- **Type**: React functional component with extensive hooks and state management
- **Key state variables**: 53 (conversationId, rightPanel, browser session artifacts, skills, memory)
- **External dependencies**: tRPC client, Wouter routing, Radix UI, Lucide icons, browser session hooks

### Layout Sections (Line Numbers)

| Section | Lines | Purpose | Key Components |
|---------|-------|---------|-----------------|
| **Imports & Types** | 1–44 | Dependencies and type definitions | `RightPanel = "none" \| "memory" \| "skills" \| "artifacts" \| "schedule" \| "canvas"` |
| **Main Component Setup** | 49–82 | State initialization, queries, mutations | `selectedConversationId`, `sidebarOpen`, `rightPanel` |
| **Browser Session Logic** | 83–256 | Browser session state, suggestions, artifacts | `browserSessionArtifact`, `browserSessionSuggestion`, `handleBrowserCommandDraftChange` |
| **Conversation Management** | 273–495 | Create conversation, update title, memory integration | `createConversationMutation`, `updateConversationMutation` |
| **Top Bar (Header)** | 505–602 | Navigation, buttons (Skills, Artifacts, Alerts, Memory, Browser, Agencies) | Lines 533–600 show button row |
| **Left Sidebar** | 605–657 | Chat history, conversation list (mobile/desktop) | `ChatSidebar` component (delegated) |
| **Chat View / Input Area** | 658–810 | Main chat display + message input | `ChatView` component (delegated to `ChatView.tsx`) |
| **Right Panel** | 812–860 | Panels: Memory, Skills, Artifacts, Canvas, Schedule | Conditional rendering based on `rightPanel` state |

### Top Bar Button Order (Lines 533–600)
```
Help | Skills (Wand2) | Artifacts (Layers) | Alerts (Bell) | Memory (Brain) | Browser Session (MonitorPlay) | Agencies (Users)
```

The **Agencies button** (line 595–600) already exists and navigates to `/agencies`. This is the destination page, not the chat integration point.

### Chat View Delegation (Line 752–763)
The `ChatView` component is imported and rendered with these key props:
```tsx
<ChatView
  conversationId={selectedConversationId}
  onTitleUpdate={handleTitleUpdate}
  onUserMessageSent={handleUserMessageSent}  // ← Called when message sent
  browserSessionSuggestion={browserSessionSuggestion}
  showBrowserSessionEntry={chatBrowserSessionEnabled}
/>
```

The `onUserMessageSent` hook is called from within `ChatView` and triggers browser session suggestion detection. **This is where agency trigger detection could be injected.**

---

## 2. Skill Detection & Selection Infrastructure

### Existing Skill Picker Pattern (SkillSettings Component)

**Location**: `apps/web/client/src/components/chat/settings/SkillSettings.tsx` (270+ lines)

**Functionality**:
- User can toggle skills on/off per conversation
- Detection mode selector: `"ask" | "auto" | "explicit"`
- Auto-save to `conversation.skillSettings` via tRPC
- Panel opened from top bar button (line 538, `setRightPanel("skills")`)

**State Flow**:
```
SkillSettings (right panel)
  ↓
trpc.chat.getSkillPreferences(conversationId)  [read preferences]
  ↓
trpc.chat.updateConversation()  [save settings]
  ↓
skillSettings: { autoDetect, detectionMode, enabledSkills }
```

**Key Files**:
- `apps/web/client/src/components/chat/settings/SkillSettings.tsx` — UI component
- `apps/web/server/routers/chat.ts` — `getSkillPreferences`, `updateConversation` procedures
- `apps/web/server/services/chatService.ts` — Persistence layer

**Detection Happens At**: Message submission in `ChatView.tsx` → calls `detectSkill()` → matches against enabled skills.

---

## 3. Agency Detection Mechanism

### Trigger Definition Shape

**Location**: `packages/skills/src/types.ts` (lines 322–333)

```typescript
export interface AgencyTriggerDefinition {
  agencyId: string;           // UUID
  name: string;               // "Marketing Team", "Video Production", etc.
  description: string;        // Display description
  triggers: TriggerRule[];    // Regex patterns
  priority: number;           // Ordering (higher checked first)
}

export interface TriggerRule {
  regex: RegExp;              // Compiled pattern
  pattern: string;            // Original pattern string
  chainTo?: string | null;    // Not used for agencies (yet)
  label?: string;             // Admin UI label
}
```

### Detection Function

**Location**: `packages/skills/src/detector.ts` (lines 214–248)

```typescript
export function detectAgencyFromList(
  message: string,
  agencies: AgencyTriggerDefinition[]
): AgencyDetectionResult {
  // 1. Sort agencies by priority (highest first)
  const sorted = [...agencies].sort((a, b) => b.priority - a.priority);

  // 2. For each agency, test all triggers
  for (const agency of sorted) {
    for (const trigger of agency.triggers) {
      const match = message.match(trigger.regex);
      if (match) {
        // 3. Return first match with confidence
        return {
          detected: true,
          agency,
          confidence: calculateAgencyConfidence(...),
          matchedTrigger: match[0],
          suggestedPrompt: extractPrompt(...)
        };
      }
    }
  }

  return { detected: false, agency: null, ... };
}

// Confidence: 0.7 base + 0.15 if at start + 0.05 if >10 chars
```

### Result Shape

```typescript
export interface AgencyDetectionResult {
  detected: boolean;
  agency: AgencyTriggerDefinition | null;
  confidence: number;           // 0.7–0.9 range
  matchedTrigger: string | null; // What matched ("video team")
  suggestedPrompt: string | null; // Message after trigger
}
```

### Already Integrated In Server

**Location**: `apps/web/server/services/skillDetector.ts` (lines 167–199)

The function `detectSkillWithAgency()` exists and is **exported** but may not be used by Chat yet:

```typescript
export async function detectSkillWithAgency(
  message: string,
  conversationId?: number,
  skillSettings?: SkillSettings | null,
  userId?: number,
  agencyTriggers?: AgencyTriggerDefinition[]  // ← Must be provided
): Promise<ExtendedSkillDetectionResult> {
  const skillResult = await detectSkill(...);

  if (!agencyTriggers || agencyTriggers.length === 0) {
    return skillResult;  // No agencies, return skill-only
  }

  const agencyResult = detectAgencyFromList(message, agencyTriggers);

  if (agencyResult.detected) {
    return {
      ...skillResult,
      agencyMatch: {
        agencyId: agencyResult.agency.agencyId,
        agencyName: agencyResult.agency.name,
        confidence: agencyResult.confidence,
        matchedTrigger: agencyResult.matchedTrigger,
        suggestedPrompt: agencyResult.suggestedPrompt,
      }
    };
  }

  return skillResult;
}
```

**Key insight**: This function is already there, but Chat.tsx likely doesn't call it yet. We need to:
1. Fetch agency list with triggers
2. Pass to `detectSkillWithAgency()` on message send
3. Handle the `agencyMatch` field in UI

---

## 4. Agency List Endpoint

### tRPC Procedure

**Location**: `apps/web/server/routers/agency.ts` (lines 140–189)

**Procedure**: `list`

```typescript
list: protectedProcedure
  .input(z.object({
    status: z.enum(["draft", "published", "archived"]).optional(),
    limit: z.number().min(1).max(100).default(50),
    offset: z.number().min(0).default(0),
  }))
  .query(async ({ ctx, input }) => {
    const result = await db
      .select({
        ...getTableColumns(agencies),
        agentCount: sql<number>`(SELECT count(*)::int FROM agency_agents WHERE "agencyId" = ${agencies.id})`.as("agentCount"),
        ownerName: users.name,
        ownerEmail: users.email,
        sharedGroupCount: sql<number>`(SELECT count(*)::int FROM agency_permissions WHERE "agencyId" = ${agencies.id})`.as("sharedGroupCount"),
      })
      .from(agencies)
      .leftJoin(users, eq(agencies.createdBy, users.id))
      .where(and(...conditions))
      .orderBy(desc(agencies.createdAt))
      .limit(input.limit)
      .offset(input.offset);

    return {
      agencies: result.map((a) => ({
        ...a,
        canEdit: a.createdBy === userId || isAdmin,
      })),
    };
  })
```

### Returned Agency Shape

```typescript
{
  id: string;
  name: string;
  description: string;
  status: "draft" | "published" | "archived";
  visibility: "private" | "shared" | "template";
  agentCount: number;
  ownerName: string | null;
  ownerEmail: string | null;
  sharedGroupCount: number;
  canEdit: boolean;
  // ... other fields (tenantId, createdAt, updatedAt, etc.)
}
```

### Missing Field: Triggers

**CRITICAL ISSUE**: The `list` procedure returns basic agency metadata, but **NOT the triggers field**. Triggers are needed for `detectAgencyFromList()` to work.

**Solution**: Create a new endpoint (e.g., `listWithTriggers`) that includes `agencyAgents.triggers` or add a separate `getTriggers` endpoint, OR include triggers in the list response when needed.

**Where triggers come from**: `agencyAgents` table, likely in `nodeConfig` JSON field or a separate `triggers` column.

---

## 5. Chat Message Flow & Integration Points

### Current Message Sending Flow (ChatView.tsx)

**High-level flow:**
```
User types message in textarea
  ↓
Hits Enter or clicks Send button
  ↓
ChatView._sendMessage() / handleSubmit()
  ↓
1. Creates a user message
2. Calls detectSkill() if auto-detect enabled
3. If skill detected: execute via skillExecutor.ts
4. Otherwise: send as text to LLM via tRPC chat.sendMessage
  ↓
Message stored in database
Response streamed back
```

### Where to Inject Agency Detection

**Option A (Earliest)**: In `ChatView` message handler before skill detection
```
Message input → AGENCY DETECT → SKILL DETECT → EXECUTE or SEND
```

**Option B (In existing skill flow)**: Use existing `detectSkillWithAgency()` function
```
Message input → detectSkillWithAgency() → agencyMatch || skillMatch → EXECUTE or SEND
```

**Recommended**: Option B, because:
- Reuses existing infrastructure
- Handles skill/agency conflict elegantly
- Minimal changes to existing code
- Server already has the logic

### Required Data for Detection

```typescript
// On Chat.tsx mount or when conversationId changes:
const { data: agencies } = trpc.agency.list.useQuery({
  status: "published",  // Only active agencies
  limit: 100
});

// Transform to TriggerDefinition[] for detection
const agencyTriggers: AgencyTriggerDefinition[] = agencies.map(a => ({
  agencyId: a.id,
  name: a.name,
  description: a.description,
  triggers: a.triggers,  // ← REQUIRES new field or separate fetch
  priority: a.priority ?? 0,
}));

// On message send:
const result = await detectSkillWithAgency(
  message,
  conversationId,
  skillSettings,
  userId,
  agencyTriggers
);

if (result.agencyMatch) {
  // Show disambiguation UI or route to agency
} else if (result.detected) {
  // Execute skill
} else {
  // Send as chat message
}
```

---

## 6. Existing useAgencyStream Hook

**Location**: `apps/web/client/src/hooks/useAgencyStream.ts` (727 lines)

### What It Does

- Manages SSE/WebSocket connection to agency chat stream
- Parses streaming message, tool calls, guardrails, approvals
- Maintains activity timeline
- Handles reconnection with polling fallback

### Interface

```typescript
export interface UseAgencyStreamReturn {
  messages: AgencyStreamMessage[];
  activeAgent: string | null;
  isStreaming: boolean;
  error: string | null;
  creditsUsed: number;
  activityEvents: AgencyActivityEvent[];
  toolCalls: ToolCallState[];
  guardrailEvents: GuardrailEvent[];
  pendingApproval: ApprovalRequest | null;
  isPollingFallback: boolean;

  connect: (params: {
    agencyId: string;
    conversationId?: string;
    message: string;
    modelOverride?: string;
    recipientAgent?: string;
    fileIds?: string[];
    additionalInstructions?: string;
  }) => void;

  disconnect: () => void;
  cancel: (mode: "immediate" | "after_turn") => void;
}
```

### Can It Be Reused?

**Yes**, but requires:
1. A dedicated UI surface (separate modal or page)
2. Message history management separate from normal chat
3. Conversion of existing conversation to agency context

**Better approach for inline agency launch**: Create a simpler hook or use the existing agency chat components from `/agencies` page (which already use `useAgencyStream`).

---

## 7. Recommended Integration Points

### Feature 1: Inline Agency Trigger Detection in Message Input

**Integration Point**: `ChatView.tsx` message handler (around line 752)

**Implementation**:
1. Fetch agency list on component mount (with triggers)
2. On message send, call `detectSkillWithAgency(message, ..., agencyTriggers)`
3. If `agencyMatch` detected:
   - Show inline suggestion card (similar to browser session suggestion)
   - User can "Launch Agency" or "Send as Chat"
   - Track which choice was made

**Affected Files**:
- `apps/web/client/src/components/chat/ChatView.tsx` — message handler
- `apps/web/server/routers/chat.ts` — possibly add `agency.listWithTriggers` endpoint
- New component: `AgencyDetectionSuggestion.tsx` (similar to `BrowserSessionSuggestionCard`)

**Data Flow**:
```
Chat.tsx: useQuery(agency.list)
  ↓
ChatView.tsx: detectSkillWithAgency(message, ..., agencyTriggers)
  ↓
If agencyMatch: show suggestion card
  ↓
User: "Launch Agency" → navigate to agency chat
   OR: "Send as Chat" → proceed normally
```

### Feature 2: Agency Quick-Launch Button

**Integration Point**: Top bar (lines 533–600)

**Implementation**:
1. Add button next to "Agencies" button
2. Button opens dropdown/menu with quick-launch shortcuts
3. Could be:
   - "Recently used agencies"
   - "Starred agencies"
   - Simple text input to search/launch

**Affected Files**:
- `apps/web/client/src/pages/Chat.tsx` — add button and state
- `apps/web/server/routers/agency.ts` — possibly add `getRecent` endpoint

**Placement**: After line 600, before closing `</div>`

### Feature 3: Skill/Agency Disambiguation UI

**Integration Point**: When both skill and agency are detected

**Implementation**:
- If `result.detected && result.agencyMatch`:
  - Show card with both options
  - "Execute skill [Skill Name]" vs. "Launch agency [Agency Name]"
  - Let user choose

**Affected Files**:
- `apps/web/client/src/components/chat/ChatView.tsx` — conditional render
- New component: `SkillAgencyDisambiguation.tsx`

**Priority**: Low (rare case where both match)

---

## 8. Database Considerations

### Agency Triggers Storage

**Question**: Where are agency triggers stored?

**Likely locations**:
1. `agencyAgents` table — `nodeConfig` JSON field (contains node-specific config)
2. Separate `agencyTriggers` table (not yet observed)
3. Not yet stored; must be configured per agency

**Action Required**:
- Audit `drizzle/schema.ts` for `agencyTriggers` or similar table
- If not found, design schema for storing triggers (see Agency Node Types gap analysis)
- Ensure `list` endpoint includes triggers or create separate `getTriggers` endpoint

### Agency Agent Relationship

```
agencies
  ↓ (has many)
agencyAgents
  ├ nodeType: "agent" | "supervisor" | "router" | ...
  ├ nodeConfig: { triggers?: [...], ... }
  └ ...
```

Triggers may be per-agent or per-agency. Clarify before implementation.

---

## 9. Gotchas & Constraints

| Gotcha | Impact | Mitigation |
|--------|--------|-----------|
| **Triggers not in list endpoint** | Can't detect agencies without separate fetch | Create `listWithTriggers` endpoint or separate call |
| **Agency creation requires UI** | Users can't create agencies to test | Use auto-create feature or seed test agencies |
| **Skill + agency conflict** | Message matches both (rare but possible) | Show disambiguation UI; skill takes priority by default |
| **Confidence scoring** | Agency detected at 0.7–0.9; skill at 0.6+ | May need tuning to avoid false positives |
| **Trigger regex performance** | Many agencies × many patterns = slow | Cache triggers client-side; invalidate on agency update |
| **Conversation context** | Agency runs in separate orchestrator | Can't pass existing conversation context directly |
| **Browser session handoff** | User in browser session, wants to launch agency | May want to cancel browser session first |
| **SSE/WebSocket fallback** | Agency stream uses polling if WebSocket fails | Handle gracefully with UI feedback |

---

## 10. Code Locations Summary

| Feature | File | Lines | Purpose |
|---------|------|-------|---------|
| **Chat layout** | `apps/web/client/src/pages/Chat.tsx` | 505–862 | Main page structure |
| **Message input** | `apps/web/client/src/components/chat/ChatView.tsx` | TBD | Message submission |
| **Skill picker UI** | `apps/web/client/src/components/chat/settings/SkillSettings.tsx` | Full | Reference pattern for agency UI |
| **Skill detection** | `apps/web/server/services/skillDetector.ts` | 60–199 | Detection logic (reuse for agencies) |
| **Agency detection** | `packages/skills/src/detector.ts` | 214–248 | Pure detection function |
| **Type definitions** | `packages/skills/src/types.ts` | 322–344 | `AgencyTriggerDefinition`, `AgencyDetectionResult` |
| **Agency list** | `apps/web/server/routers/agency.ts` | 140–189 | API endpoint |
| **Agency stream** | `apps/web/client/src/hooks/useAgencyStream.ts` | 1–100 | Reference for agency chat |
| **Browser session suggestion** | `apps/web/client/src/components/browser-session/BrowserSessionLaunchSuggestionCard.tsx` | TBD | UI pattern to follow |

---

## 11. Recommendations

### Phase 1 (MVP)
1. Add `triggers` field to `agency.list` response or create `agency.listWithTriggers`
2. Implement inline agency detection in `ChatView` with suggestion card
3. Route "Launch Agency" to existing agency chat page

**Effort**: 8–12 hours

### Phase 2 (Polish)
1. Add quick-launch button with recent agencies
2. Implement skill/agency disambiguation UI
3. Add analytics/tracking for agency launches from chat

**Effort**: 6–10 hours

### Phase 3 (Future)
1. Bidirectional handoff (agency → chat context)
2. Agency-specific conversation templates
3. Agency skill pre-configuration

**Effort**: Variable

---

## Approval Checklist

- [ ] Confirm agency triggers are stored/accessible
- [ ] Approve `listWithTriggers` endpoint design
- [ ] Confirm agency vs. skill priority (which takes precedence if both match?)
- [ ] Approve UI pattern for inline suggestion vs. disambiguation
- [ ] Confirm target agency chat page destination (URL, params)

