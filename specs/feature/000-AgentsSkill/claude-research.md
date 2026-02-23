# Research Findings — Orchestra Skill Pack

**Date:** 2026-02-22
**Topics Researched:** Codebase patterns, Claude Code Task tool orchestration, Wave-based parallelism, Prompt engineering for sub-agents, File-based memory

---

## Part 1: Codebase Patterns (Existing Skill Structure)

### 1.1 SKILL.md Frontmatter Format

All skills use consistent YAML frontmatter:

```yaml
---
name: skill-name
description: Human-readable description
license: MIT
compatibility: Runtime requirements (e.g., "Requires uv (Python 3.11+), Gemini or OpenAI API key")
---
```

### 1.2 Plugin Root Structure

```
deep_plan/                        # Plugin root
├── SKILL.md                      # Main skill entry point
├── config.json                   # Global config (models, timeouts, context checks)
├── pyproject.toml                # uv Python project config
├── skills/
│   └── deep-plan/
│       ├── SKILL.md              # Workflow instructions
│       └── references/           # Reference docs (research-protocol.md, etc.)
├── scripts/
│   ├── checks/                   # Setup/validation scripts (Python + bash)
│   ├── hooks/                    # SessionStart, SubagentStop hooks
│   ├── lib/                      # Shared utilities (tasks.py, sections.py, etc.)
│   └── llm_clients/              # External LLM integration
└── prompts/                      # Prompt templates (symlinked)
```

### 1.3 Skill Workflow Structure

Each SKILL.md contains numbered step-by-step workflow with:
- **Critical first actions** (banner, environment validation)
- **AskUserQuestion** for decision points
- **Script invocations** with exact bash commands and JSON output specs
- **Subagent dispatch** patterns (Task tool usage)
- **File-based state management** (artifact paths per step)
- **Recovery/resume** protocols

### 1.4 Session & State Management

Context tasks embedded in task list (positions 1-4):
- `plugin_root=/path/to/plugin`
- `planning_dir=/path/to/planning`
- `initial_file=/path/to/spec.md`
- `review_mode=external_llm`

These survive `/clear` commands because they're stored in task files at `~/.claude/tasks/<task_list_id>/`.

**File-to-step mapping for resume:**
```
step 7  → claude-research.md
step 9  → claude-interview.md
step 10 → claude-spec.md
step 11 → claude-plan.md
step 13 → reviews/*.md
step 16 → claude-plan-tdd.md
step 18 → sections/index.md
step 20 → sections/section-*.md
```

### 1.5 Section File Format

Each `sections/section-NN-name.md` contains:
- Objective, Dependencies, Scope, Out of Scope
- Files to Add or Modify
- Test-First Stubs (prose stubs, NOT full code)
- Implementation Tasks
- Acceptance Criteria
- Risk Controls
- As-Built (filled in during implementation)

Size: 50–120 lines per section (lean, self-contained).

### 1.6 `sections/index.md` Required Format

```markdown
<!-- SECTION_MANIFEST
section-01-name
section-02-name
END_MANIFEST -->

<!-- PROJECT_CONFIG
runtime: typescript-npm | typescript-pnpm | python-uv | python-pip
test_command: <command>
END_PROJECT_CONFIG -->
```

The manifest MUST be at the top. Parsed by `generate-section-tasks.py` to create task files.

### 1.7 Subagent Types Used by Existing Skills

| subagent_type | Usage | Notes |
|---|---|---|
| `Explore` | Read-only codebase analysis (research phase) | Fast, haiku model |
| `general-purpose` / `web-search-researcher` | Web research | Returns results to parent |
| `section-writer` | Write section files (batch execution) | SubagentStop hook writes files |
| `opus-plan-reviewer` | Plan review when no external LLMs | Opus model |

### 1.8 Enabled Plugins (SmartSpecPro)

```json
{
  "deep-project@piercelamb-plugins": true,
  "deep-plan@piercelamb-plugins": true,
  "deep-implement@piercelamb-plugins": true,
  "error-debugging@claude-code-workflows": true,
  "backend-api-security@claude-code-workflows": true,
  "python-development@claude-code-workflows": true,
  "developer-essentials@claude-code-workflows": true
}
```

The new `orchestra` and `sub-agents` skills will live in `skills/orchestra/` and `skills/sub-agents/` within the same plugin root (`deep_plan/skills/`), OR potentially as a new plugin at a sibling path.

### 1.9 Real Feature Examples (for scale reference)

- **Feature 021 (CanvasEditor):** 10 sections, TypeScript, complex dependencies, 6 execution batches
- **Feature 019 (RAG):** 8 sections, Python, 7 batches
- Both show "as-built deviations" — plan diverged from implementation, documented in section files

---

## Part 2: Claude Code Task Tool Orchestration (2026)

### 2.1 Hard Constraints

- **Sub-agents CANNOT spawn other sub-agents.** The conductor always manages delegation depth.
- This is a Claude Code architectural constraint, not configurable.
- Implication: Orchestra can dispatch sub-agents but sub-agents cannot further delegate.

### 2.2 Agent Definition (`.claude/agents/`)

Subagents are Markdown files stored in `.claude/agents/` (project) or `~/.claude/agents/` (user):

```yaml
---
name: backend-security-coder
description: Audits backend API endpoints for OWASP vulnerabilities. Use proactively after any auth or data-handling change.
tools: Read, Grep, Glob, Bash
model: sonnet            # or opus, haiku, inherit
permissionMode: default  # acceptEdits | dontAsk | bypassPermissions | plan
maxTurns: 50
memory: project          # user | project | local — persistent cross-session memory
background: true         # run concurrently without blocking main conversation
isolation: worktree      # isolated git worktree (auto-cleanup if no changes)
---

System prompt here.
```

**Key insight:** `description` field is the semantic dispatch trigger. Write descriptions like: "Use proactively after any code changes to frontend components."

### 2.3 `isolation: worktree` for Parallel Agents

When parallel agents may write to overlapping files, `isolation: worktree` gives each agent a fresh git worktree copy. This prevents write conflicts automatically.

### 2.4 Claude Code Tasks System (January 2026)

Tasks persist in `~/.claude/tasks/` across sessions. DAG-based orchestration:
1. Conductor creates task nodes with `TaskCreate` + `blockedBy` relationships
2. Conductor spawns N worker sub-agents
3. Workers claim pending tasks (atomic, prevents double-work)
4. Downstream tasks auto-unblock when dependencies complete
5. Dynamic task creation: sub-agents can call `TaskCreate` for discovered sub-requirements

### 2.5 Model Selection by Agent Role

| Agent Role | Recommended Model | Reason |
|---|---|---|
| Conductor / planner | claude-opus-4-6 | Complex reasoning |
| File exploration | claude-haiku-4-5 | Fast, cheap |
| Code implementation | claude-sonnet-4-6 | Balance |
| Security audit | claude-sonnet-4-6 | Consistent |
| Code review | claude-sonnet-4-6 | Sufficient |

---

## Part 3: Wave-Based Parallelism Patterns

### 3.1 The Wave Execution Algorithm

```python
async def execute_wave_graph(steps):
    completed = {}
    pending = set(range(len(steps)))

    while pending:
        # Find all steps whose dependencies are satisfied
        ready = [i for i in pending
                 if all(dep in completed for dep in steps[i].dependencies)]

        if not ready:
            raise CircularDependencyError("Possible cycle in dependency graph")

        # Execute current wave in parallel
        wave_results = await asyncio.gather(*[execute_agent(steps[i]) for i in ready])

        for i, result in zip(ready, wave_results):
            completed[i] = result
            pending.remove(i)

    return completed
```

**Context injection between waves:** Wave N results are prepended to Wave N+1 task prompts as structured context (NOT raw dumps of full conversation history).

### 3.2 Conflict Prevention for Parallel Agents

- Assign each parallel agent a **non-overlapping file set** (define contracts upfront)
- Use `isolation: worktree` for agents that may touch shared files
- Never let multiple agents write to the same file simultaneously
- Conductor validates results for conflicts before integrating

### 3.3 Azure/Industry Canonical Patterns

| Pattern | When to Use | Key Risk |
|---|---|---|
| Sequential (pipeline) | Step-by-step refinement, clear stage dependencies | Failures in early stages propagate |
| Concurrent (fan-out/in) | Independent analysis from multiple perspectives | Requires conflict resolution strategy |
| Group Chat (council) | Consensus-building, maker-checker validation | Conversation loops with many agents |
| Handoff (routing) | Right specialist emerges during processing | Infinite handoff loops |
| Magentic (dynamic) | Open-ended problems, no predetermined path | Slow to converge |

**Concurrent/fan-out is the wave-based pattern for Orchestra.**

### 3.4 Anti-Patterns to Avoid

- Shared mutable state between concurrent agents → transactional inconsistency
- No conflict resolution for contradictory results
- Rate limit exceeded by parallel agents calling same API endpoint
- Context windows growing uncontrolled as agents accumulate reasoning

---

## Part 4: Prompt Engineering for Sub-Agent Consistency

### 4.1 The 6-Section Mandatory Prompt Template

```
TASK: [Specific action verb + object — "Audit", "Implement", "Fix", not "Look at"]
DOMAIN: [CMD-1 Frontend, CMD-2 Backend, etc.]
FILES: [Exact absolute file paths]
CONTEXT: [What happened before, error messages, trace IDs]
CONSTRAINTS: [What NOT to touch; max scope; style conventions]
OUTPUT: [Exact deliverable format — "Return JSON matching schema X" or "Modify Y to add Z"]
```

This matches exactly the SmartSpecPro CLAUDE.md orchestration rules.

### 4.2 Contract-Driven Interface Design

Define explicit input/output schemas for each agent type:

```
AGENT CONTRACT: security-fastapi
─────────────────────────────────────────────────────
INPUT:
  - files: list of absolute file paths
  - context: what changed and why
  - constraints: known acceptable patterns to exclude

OUTPUT SCHEMA (JSON):
  {
    "findings": [{
      "severity": "HIGH|MEDIUM|LOW",
      "file": "<path>",
      "line": <number>,
      "category": "injection|auth-bypass|data-exposure|...",
      "description": "<one sentence>",
      "recommendation": "<specific fix>"
    }],
    "summary": "<2-3 sentence executive summary>",
    "files_audited": ["<path1>"]
  }
─────────────────────────────────────────────────────
```

### 4.3 Reflexion Loop (Self-Correcting Agent)

For high-stakes work:
```
generator_agent → output
      ↓
evaluator_agent → check against rubric
      ↓
FAIL → diagnostic critique → back to generator (max 3–5 iterations)
PASS → result exits to conductor
```

Always set an **iteration cap** with a fallback (return best-effort with quality flag, or escalate to conductor).

### 4.4 Tool Count Management

Keep agents to ~20 core tools maximum. Too many tools → hallucinated tool calls.
- **Atomic tools**: Read, Write, Bash, Grep, Glob (stable, cache-friendly)
- Use Bash for complex logic chains rather than multiple custom tool definitions

**Vercel case study:** Reducing tools by 80% improved success rate 80%→100%, cut execution time 3.5x, reduced token usage 37%.

---

## Part 5: File-Based Memory for Context Compaction

### 5.1 Four Memory Mechanisms

**Mechanism 1 — Agentic Memory Files**
Agents maintain notes stored outside context window:
- `NOTES.md` / `MEMORY.md` — progress tracking
- `TASK_STATE.json` — structured checkpoint
- `DECISIONS.md` — architectural decisions

Claude Code `memory: project` field injects first 200 lines of `MEMORY.md` at agent startup.

**Mechanism 2 — Just-In-Time Context Retrieval**
Store lightweight identifiers (file paths) instead of full content. Retrieve on demand with Read tool. If agent writes a 500-line file, chat history should contain only the path.

**Mechanism 3 — Compaction with Summarization**
Claude Code triggers compaction at ~95% context capacity. Priority for handoff summary:
1. Recent raw tool calls (preserve model's "rhythm")
2. Compressed summary of older turns
3. File path references to all work products

**What to preserve in handoff:**
- Architectural decisions made
- Unresolved bugs / blockers
- Absolute file paths of relevant files (never relative)
- What remains to be done
- Critical data (IDs, versions, config values)

**What to discard:**
- Raw tool outputs (output file exists; reference the path)
- Repetitive intermediate reasoning
- Superseded plans or approaches

**Mechanism 4 — Sub-Agent Context Isolation**
Sub-agents get fresh context windows. Return condensed summaries (1,000–2,000 tokens) to coordinator. Coordinator never accumulates the full exploration context.

### 5.2 Checkpoint JSON Structure

```json
{
  "checkpoint": {
    "timestamp": "2026-02-22T14:30:00Z",
    "task_id": "orchestra-session-001",
    "phase": "wave-2-implementation",
    "completed_steps": [
      {"id": "analyze-schema", "status": "done", "output_file": "/path/analysis.md"}
    ],
    "in_progress": {"id": "implement-handler", "file": "/path/handler.ts", "last_line": 147},
    "pending": ["update-router", "run-tests"],
    "decisions": ["Using zod for validation (smaller bundle)", "JWT expiry 15min (security req)"],
    "blockers": [],
    "key_files": ["/absolute/path/to/file1.ts", "/absolute/path/to/file2.ts"]
  }
}
```

### 5.3 Resume Instruction Injection

When a new session picks up from a checkpoint:
```
You are resuming an interrupted task. Read the checkpoint at /path/snapshot.json.
Read all files in key_files to restore working context.
Do NOT re-do completed_steps. Continue from in_progress, then through pending.
Honor all decisions in checkpoint without re-litigating them.
```

### 5.4 Sub-Agent Transcript Persistence

**Critical fact:** Sub-agent transcripts in Claude Code are stored separately from main conversation at `~/.claude/projects/{project}/{sessionId}/subagents/agent-{agentId}.jsonl`. Main conversation compaction does NOT affect subagent transcripts.

Sub-agents can be resumed explicitly with full context via the agentId returned by the Task tool.

---

## Key Synthesis for Orchestra Design

**Architecture rules:**
1. Conductor spawns sub-agents; sub-agents CANNOT spawn further sub-agents
2. Use `isolation: worktree` for parallel agents touching overlapping files
3. Define non-overlapping file sets per agent in the contract (prevents conflicts)
4. Max 4 concurrent agents; max 2 simultaneous file-editing agents
5. `background: true` for parallel specialist agents

**Wave execution rules:**
6. Build the full dependency DAG before spawning any workers
7. Execute all ready steps in one parallel batch (asyncio.gather pattern)
8. Inject wave N results as structured context into wave N+1 prompts
9. Always detect circular dependencies before execution starts

**Prompt quality rules:**
10. Every prompt must have: TASK + DOMAIN + FILES + CONTEXT + CONSTRAINTS + OUTPUT
11. Define JSON output schemas explicitly per agent type
12. Include `maxTurns` cap to prevent runaway agents
13. Use Reflexion loops for high-stakes agents (max 3–5 iterations)

**Memory / compaction rules:**
14. Store absolute file paths in checkpoint JSON (never relative)
15. Trigger snapshot before context exceeds 80%
16. Handoff summaries preserve decisions, blockers, file paths, remaining work
17. Sub-agent transcripts persist across main-context compaction; use agentId to resume
18. `memory: project` for agents building institutional knowledge

**For the orchestra skill files specifically:**
- These are markdown files in `skills/orchestra/` and `skills/sub-agents/`
- No TypeScript or Python code written — only skill definition files
- The runtime is Claude Code itself, with SKILL.md as the entry point
- Reference docs go in `references/` subdirectory
- Follow existing deep-plan SKILL.md structure as the template

---

## Sources

- Codebase: `/home/dev/projects/SmartSpecPro/deep_plan/skills/deep-plan/` and related files
- [Claude Code official sub-agents docs](https://code.claude.com/docs/en/sub-agents)
- [VentureBeat: Claude Code Tasks January 2026](https://venturebeat.com/orchestration/claude-codes-tasks-update-lets-agents-work-longer-and-coordinate-across)
- [Azure Architecture Center: AI Agent Design Patterns](https://learn.microsoft.com/en-us/azure/architecture/ai-ml/guide/ai-agent-design-patterns)
- [Anthropic Engineering: Effective Context Engineering](https://www.anthropic.com/engineering/effective-context-engineering-for-ai-agents)
- [lethain.com: Agents Context Compaction](https://lethain.com/agents-context-compaction/)
- [promptengineering.org: 2026 Agentic Workflow Playbook](https://promptengineering.org/agents-at-work-the-2026-playbook-for-building-reliable-agentic-workflows/)
- [promptlayer.com: Prompt Routers and Flow Engineering](https://blog.promptlayer.com/prompt-routers-and-flow-engineering-building-modular-self-correcting-agent-systems/)
- [Union.ai Flyte 2.0: Wave-Based Parallel Execution](https://www.union.ai/blog-post/build-a-planner-agent-system-with-parallel-execution-flyte-2-0-multi-agent-orchestration-with-union-ai)
