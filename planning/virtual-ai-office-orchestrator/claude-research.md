# Codebase Research — Virtual AI Office Orchestrator

## 1. Persona System

### Database Schema (`drizzle/schema.ts` lines 4957-4987)
- **Table: `personaTemplates`** — UUID PK, 11+ fields
- Fields: id, tenantId, userId, name, description, assistantNickname, assistantGender, sourceTemplateIds[], sourceTemplateLabels[], sourceTemplateCategories[], systemPromptPrefix, tone, language, responseStyle{}, restrictions[], scope, isDefault
- Scope hierarchy: platform > tenant > user
- Enums: assistantGender ∈ {female, male, neutral}, tone ∈ {formal, casual, friendly, technical, creative}, scope ∈ {platform, tenant, user}
- Indexes: tenant+scope, userId, sourceTemplateIds (GIN)

### Service: `personaService.ts` (457 lines)
- Resolution chain: conversation.personaId → widget.defaultPersonaId → user.defaultPersonaId → tenant.defaultPersonaId → PLATFORM_DEFAULT
- Key functions: `listPersonas()`, `getPersonaById()`, `createPersona()`, `updatePersona()`, `deletePersona()`, `resolvePersona()`, `buildPersonaPromptSegments()` → {prefix, styleInstructions, restrictionsBulletPoints}
- Sanitization: jailbreak pattern blocklist, length validation, YAML separator escaping

### Router: `persona.ts` (281 lines)
- Endpoints: list, getById, create, update, delete, setUserDefault, setTenantDefault
- RBAC: platform scope=admin, tenant scope=domain_admin, user scope=owner-only

### Frontend Components
- `PersonasPanel.tsx` — User persona management UI
- `PersonaSelector.tsx` — Dropdown for conversation persona
- `AdminPersonas.tsx` — Admin CRUD panel
- `personaTemplates.ts` — Template definitions

### Key Patterns
- Scope-based RBAC with tenant isolation
- Prompt safety: blocked patterns ([SYSTEM], [INST]) prevent injection
- Multimodal support: responseStyle JSON supports tone + gender-based Thai particles

---

## 2. Agency System

### Database Schema (5 core tables, ~300 lines)

| Table | Key Fields |
|-------|-----------|
| `agencies` | id(uuid), tenantId, name, slug, status, visibility, defaultModel, maxAgents, maxRunTimeSeconds, creditMultiplier |
| `agencyAgents` | id(uuid), agencyId, name, instructions, model, modelSettings{}, isEntryPoint, nodeType, nodeConfig{}, position{x,y} |
| `agencyAgentTools` | id(uuid), agentId, toolId(varchar100), toolConfig{} |
| `agencyCommunicationFlows` | id(uuid), agencyId, fromAgentId, toAgentId, flowType |
| `agencyConversations` | id(uuid), agencyId, userId, title, totalCreditsUsed, messageCount |
| `agencyRunArtifacts` | id(uuid), runId, conversationId, artifactType, intent, state, commitStatus |
| `agencyVersions` | id, agencyId, versionNumber, snapshotJson{}, contentHash |
| `agencyTemplates` | id, name, category, description, isActive |
| `agentTemplates` | id, agencyTemplateId, name, role, instructions, category, icon, defaultModel, defaultTools[] |

### Node Types (agencyAgents.nodeType)
agent, supervisor, router, aggregator, knowledge_base, skill_call, human_approval

### Router: `agency.ts` (2801 lines)
- CRUD + preview SVG + execution (via agencyBridge) + versioning + autoCreate (AI builder)
- Key: `agencyBridge.ts` bridges tRPC ↔ Python FastAPI

### Python Backend
- `agency_orchestrator.py` — Graph walker (sequential + parallel edges)
- `agency_swarm_adapter.py` — Bridges to AgencySwarm framework, builds comm flows as (Agent, Agent) tuples
- `agency_tools.py` — 12 builtin tools (rag, skill_executor, http, email, webhook, slack, etc.)
- `agency_service.py` — CRUD layer
- `agency_persistence.py` — Saves runs to agency_runs table (Python-side)
- `agency_credits.py` — Credit tracking per agent + run

### Frontend Components
- `AgencyBuilder.tsx` — ReactFlow visual editor (nodes + edges + undo/redo)
- `AgencyChat.tsx` — Real-time SSE chat for agency execution
- `AgencyActivityPanel.tsx` — Agent turn-taking, tool calls visualization
- `AutoCreateAgencyModal.tsx` — AI-driven agency generator (Celery tasks)

### Communication Flow Pattern
- Directed graph with typed edges (`flowType`: delegation, parallel)
- Loaded via `_load_flows()` → list of (from_name, to_name) tuples
- Parallel edges trigger `asyncio.gather()` in orchestrator
- `ExecutionContext` passes results between nodes

---

## 3. Chat System

### Database Schema

| Table | Key Fields |
|-------|-----------|
| `conversations` | userId, tenantId, personaId(FK), model, temperature, systemPrompt, brainstormPartnerModel, brainstormMaxRounds, projectId, memoryMode ∈ {full, no_long, off}, skillSettings{} |
| `messages` | conversationId, role ∈ {user, assistant, system}, content, attachments[], artifacts[], skillUsed, inputTokens, outputTokens, creditsUsed, traceId |
| `conversationSummaries` | conversationId, summary, messageRangeStart, messageRangeEnd |

### Router: `chat.ts` (2179 lines)
- Core: sendMessage, getConversation, getMessages, updateConversation
- Memory: getSummaries, getEntityMemories, upsertEntityMemory
- Skills: detectSkill, executeSkill
- Brainstorm: implicit via brainstormPartnerModel + brainstormMaxRounds

### Brainstorm (Minimal)
- Dual-model discussion: Model A = main, Model B = brainstormPartnerModel
- Max rounds configurable (default 3)
- No dedicated table — settings on conversation record
- No multi-agent discussion protocol

---

## 4. Memory System

### Entity Memories Table (lines 1489-1527)
- Fields: userId, entityType, entityName, facts[], sourceConversationId, projectId, confidence (0-1), importance (1-10), source ∈ {auto, manual, suggested}, reinforcementCount
- Entity Types (11): user, project, preference, technical, decision, plan, architecture, component, task, code_knowledge, rule

### Memory Service (`memoryService.ts`, 1517 lines)
- **Buffer Memory**: 20 recent messages
- **Summary Memory**: LLM compress when 70% of context filled
- **Entity Memory**: Long-term facts with importance scoring
- Key functions: getBufferMessages, needsSummarization, saveSummary, extractEntitiesFromMessage, getEntityMemories, upsertEntityMemory
- Cleanup: memories >180 days deleted (except rules)

### Constants
- BUFFER_SIZE = 20, SUMMARIZE_THRESHOLD = 0.70, MAX_SUMMARIES_IN_CONTEXT = 5, MAX_ENTITIES_IN_CONTEXT = 10

---

## 5. Notification System

### Table: `userNotifications` (lines 3046-3074)
- Fields: userId, type ∈ {scheduled_message, follow_request, alert, system, direct_message, urgent_message}, title, content, priority ∈ {low, normal, high, critical}, isRead, conversationId

### Service: `notificationService.ts` (111 lines)
- Single entry point: `createNotification(params)`
- Fire-and-forget: Telegram async (failures non-fatal)
- Channel-agnostic, extensible

---

## 6. Queue System

### Key Files
- `llmQueue.ts` — Cloud Tasks primary, in-memory fallback
- `queueHealthMonitor.ts` — Health checks
- `llmRateLimiter.ts` — Bottleneck per provider
- Queue names: media-generation, media-upload, skill-execution, scheduled-messages, brainstorm-runs, agency-runs, webhook-dispatch

---

## 7. Testing

### Frontend (Vitest)
- Config: `vitest.config.ts` with Happy DOM
- Path aliases: @/, @shared/, @assets/
- Patterns: tRPC mocking, React Testing Library, userEvent

### Python (pytest)
- Config: pytest.ini + pyproject.toml
- 80% coverage minimum enforced
- Markers: unit, integration, e2e, auth, credits, llm
- Fixtures: conftest.py, TestClient for FastAPI

---

## 8. Existing Infrastructure Summary

| What Orchestrator Needs | Already Exists? | Where | Gap |
|------------------------|-----------------|-------|-----|
| User Persona storage | ✅ | personaTemplates | Need team persona bundles |
| Assistant Persona storage | ✅ | personaTemplates | Same table, scope=user |
| Multi-agent coordination | ✅ | agencies + agencyAgents | Need team graph vs tool graph |
| Communication flows | ✅ | agencyCommunicationFlows | Need async discussion protocol |
| Conversation memory | ✅ | entityMemories + summaries | Need scoped memory (6 levels) |
| Notifications | ✅ | userNotifications | Need team event types + orchestrator alerts |
| Chat routing | ✅ | messages table | Need agent-to-agent message types |
| Queue infrastructure | ✅ | BullMQ/Cloud Tasks | Need team session + approval queues |
| RBAC | ✅ | scope + role hierarchy | Need orchestrator role |
| Brainstorm | ⚠️ | conversation fields only | Minimal; needs full team migration |
| Autonomy levels | ❌ | — | New concept |
| Async agent discussion | ❌ | — | New protocol |
| Team builder UI | ✅ (adapt) | AgencyBuilder.tsx | Reuse ReactFlow patterns |
| Monitoring/activity | ✅ | AgencyActivityPanel.tsx | Extend for team monitoring |
| Version history | ✅ | agencyVersions | Extend for team versions |
