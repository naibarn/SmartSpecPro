---
name: Intelligence Enhancements - Code Locations & Insertion Points
description: Exact file paths, line numbers, and data availability for 5 agency system intelligence features
type: reference
---

# Intelligence Enhancements for Agency System — Code Locations

Research document mapping exact implementation insertion points for 5 intelligence features: Confidence Boost, Outcome-Aware Memory, Auto Few-Shot, ReAct Reflection, and Trace-Based Learning.

---

## Feature 1: Confidence Boost

**Goal:** Automatically increase memory confidence when an agent successfully uses a retrieved memory.

### Current Retrieval Flow

**File:** `python-backend/app/services/agency_memory_retriever.py` (286 lines)

**Retrieval Result Structure** (lines 50–57):
```python
@dataclass
class RetrievalResult:
    facts: list[dict] = field(default_factory=list)     # L1 retrieved facts
    chunks: list[dict] = field(default_factory=list)    # L2 retrieved chunks
    total_tokens: int = 0
    l1_count: int = 0                                    # Count of facts retrieved
    l2_count: int = 0                                    # Count of chunks retrieved
    query: str = ""
```

**Key Finding:** Retrieved facts include the full source object:
- Line 231: `source = dict(item["source"])` — Each fact includes `id` field (memory ID)
- Line 234: `included_facts.append(source)` — Full fact dict with id, content, memoryType, confidence, useCount

### Post-ReAct Success Point

**File:** `python-backend/app/services/agency_orchestrator.py`

**ReAct Path — Lines 813–854:**
```
Line 813:  result: ReActResult = await executor.execute(task=augmented_message, context=memory_context)
Line 819:  ctx.results[node["id"]] = result.final_answer  # ← Result available here
Line 822:  if result.status == "complete" and node_config.get("enableLongTermMemory"):
           # ← SUCCESS POINT: Run succeeded, memories were used
Line 824:  await ltm_svc.extract_and_store_memories(...)
```

**Data Available at Line 822–837:**
- `result.status` — confirms execution success ("complete", "max_iterations", "budget_exceeded", "circuit_breaker")
- `result.final_answer` — actual output (available as full text, capped at 2000 chars for storage)
- `result.iterations` — number of iterations executed
- `result.total_tokens` — token budget consumed
- `node["id"]` — agent node ID (connects to memories via agent_node_id)
- `memory_context` — context passed to executor (dict with "long_term_memory" key containing formatted context)

**Autonomous Path — Lines 952–1009:**
Same structure as ReAct, with identical insertion point at lines 970–985.

### Memory Boost Insertion Point

**INSERTION POINT #1.1: ReAct Success** — After line 837, before extracting new memories

```python
# Lines 822–837 (after memory extraction try block)
if result.status == "complete" and node_config.get("enableLongTermMemory"):
    try:
        # INSERTION: Boost confidence of retrieved memories used in this run
        if memory_context and "long_term_memory" in memory_context:
            # Extract memory IDs from memory_context or from retriever state
            await ltm_svc.boost_memory_confidence(
                memory_ids=retrieved_memory_ids,  # ← Need to track these
                boost_factor=1.1,  # 10% confidence increase
                node_id=node["id"],
            )

        # Continue with existing extraction flow
        await ltm_svc.extract_and_store_memories(...)
```

**INSERTION POINT #1.2: Retrieve State** — In orchestrator memory building

**File:** `python-backend/app/services/agency_orchestrator.py` — method `_build_semantic_memory_context`

**Current line range:** ~900–950 (need to locate exact method)

**Action required:** Capture `AgencyMemoryRetriever.retrieve()` result to track which memory IDs were included:
- Return value is `RetrievalResult` with `facts: list[dict]` where each fact has `id` field
- Store returned memory IDs in `ctx.retrieved_memory_ids = [f["id"] for f in result.facts]`

### Confidence Boost Implementation Location

**File:** `python-backend/app/services/long_term_memory.py`

**New Method Insertion** (after line 482, after `extract_and_store_memories`):

```python
async def boost_memory_confidence(
    self,
    memory_ids: list[int],
    boost_factor: float = 1.1,
    max_confidence: float = 1.0,
) -> dict:
    """Increase confidence of memories used in a successful run."""
    if not memory_ids:
        return {"updated": 0}

    updated = 0
    for mid in memory_ids:
        m = await self.db.execute(
            select(AgencyAgentMemory).where(AgencyAgentMemory.id == mid)
        )
        memory = m.scalars().first()
        if memory and memory.is_active:
            new_confidence = min(
                max_confidence,
                float(memory.confidence or 1.0) * boost_factor
            )
            memory.confidence = new_confidence
            updated += 1

    await self.db.commit()
    return {"updated": updated}
```

**Table Fields Available:**
- `AgencyAgentMemory.id` (Primary key, Integer)
- `AgencyAgentMemory.confidence` (Numeric 4,3, range 0.0–1.0)
- `AgencyAgentMemory.is_active` (Boolean)
- `AgencyAgentMemory.updated_at` (auto-timestamp)

---

## Feature 2: Outcome-Aware Memory Extraction

**Goal:** Enhance memory extraction prompt with outcome data to extract more contextual memories.

### Current Extraction Prompt

**File:** `python-backend/app/services/long_term_memory.py`

**Lines 407–447 (extract_memories method):**

```python
async def extract_memories(self, run_result: str, ...) -> list[dict]:
    """Extract learnable insights from a completed run via LLM call."""
    prompt = (
        "Extract concise, reusable learnings from this agent run result. "
        "Return a JSON array of objects with 'content' (string) and "
        "'memory_type' (one of: constraint, preference, fact, skill). "
        "Only include genuinely learnable insights, not task-specific details.\n\n"
        f"Run result:\n{sanitize_llm_input(run_result, max_length=3000)}"
    )

    try:
        async with httpx.AsyncClient(timeout=30.0) as client:
            resp = await client.post(
                f"{self.gateway_url}/v1/chat/completions",
                json={
                    "model": "gpt-4o-mini",
                    "messages": [{"role": "user", "content": prompt}],
                    "max_tokens": 1000,
                    "response_format": {"type": "json_object"},
                },
                headers={"Authorization": f"Bearer {self.user_token}"},
            )
```

### Enhanced Extraction with Outcome Context

**INSERTION POINT #2.1: Extraction Prompt Enhancement**

**File:** `python-backend/app/services/long_term_memory.py` — Line 417–423

**New signature for extract_memories:**
```python
async def extract_memories(
    self,
    run_result: str,
    tenant_id: str,
    agency_id: str,
    agent_node_id: str,
    user_id: int,
    source_run_id: str,
    execution_status: str = "complete",         # ← NEW: "complete", "partial", "failed"
    execution_tokens: int | None = None,        # ← NEW: tokens used
    execution_iterations: int | None = None,    # ← NEW: iterations/steps
    retrieved_memories: list[dict] | None = None, # ← NEW: memories that were used
) -> list[dict]:
```

**Enhanced prompt construction** (replace lines 417–423):
```python
outcome_context = f"Execution Status: {execution_status}\n"
if execution_tokens:
    outcome_context += f"Tokens Used: {execution_tokens}\n"
if execution_iterations:
    outcome_context += f"Iterations/Steps: {execution_iterations}\n"
if retrieved_memories:
    mem_text = "\n".join([m.get("content", "")[:200] for m in retrieved_memories[:3]])
    outcome_context += f"\nPrior Knowledge Used:\n{mem_text}\n"

prompt = (
    "Extract concise, reusable learnings from this agent run result, considering the execution context. "
    "Focus on:\n"
    "1. New constraints or preferences discovered\n"
    "2. Effective approaches or strategies that worked\n"
    "3. Gaps between prior knowledge and what was actually needed\n"
    "Return a JSON array with 'content' (string) and 'memory_type' (constraint|preference|fact|skill).\n\n"
    f"{outcome_context}\n"
    f"Run Result:\n{sanitize_llm_input(run_result, max_length=3000)}"
)
```

### Callsite Update

**INSERTION POINT #2.2: OrchestrationFlow Enhancement**

**File:** `python-backend/app/services/agency_orchestrator.py` — Lines 828–835

**Update extract_and_store_memories call:**
```python
await ltm_svc.extract_and_store_memories(
    run_result=result.final_answer,
    tenant_id=ctx.tenant_id,
    agency_id=getattr(self.agency_config, "agency_id", ""),
    agent_node_id=node["id"],
    user_id=ctx.user_id,
    source_run_id=getattr(ctx, "run_id", ""),
    execution_status=result.status,           # ← NEW
    execution_tokens=result.total_tokens,     # ← NEW
    execution_iterations=result.iterations,   # ← NEW
    retrieved_memories=ctx.get("retrieved_memory_list", []),  # ← NEW
)
```

---

## Feature 3: Auto Few-Shot from Best Runs

**Goal:** Automatically capture high-quality example pairs from successful runs and store in `agencyAgents.examples` field.

### Quality Scoring in Autonomous Executor

**File:** `python-backend/app/services/autonomous_executor.py`

**Reflection Quality Computation** (lines 363–427):

```python
class AutonomousReflector:
    async def reflect(self, task: str, subtask_results: dict[str, str], plan: TaskPlan) -> ReflectionResult:
        # Lines 394–427: LLM-based quality evaluation
        # Returns ReflectionResult with:
        # - quality_score: float (0.0–1.0)
        # - is_complete: bool
        # - gaps: list[str]
        # - suggestions: list[str]
        # - replan_focus: str | None
```

**Quality Score Check** (lines 551–559):
```python
if reflection.is_complete or reflection.quality_score >= quality_threshold:
    return AutonomousResult(
        status="complete",
        final_answer=final_answer,
        plan_versions=plan_version,
        total_subtasks=total_subtasks,
        total_tokens=total_tokens,
        subtask_results=subtask_results,  # ← Available here
    )
```

### Few-Shot Capture Insertion Point

**INSERTION POINT #3.1: Post-Reflection, High-Quality Runs**

**File:** `python-backend/app/services/autonomous_executor.py` — After line 551

```python
if reflection.is_complete or reflection.quality_score >= quality_threshold:
    # ← NEW: Capture high-quality example
    if reflection.quality_score >= 0.85:  # High-quality threshold
        await _capture_few_shot_example(
            agent_node_id=node["id"],  # From context
            task=task,
            result=final_answer,
            quality_score=reflection.quality_score,
            subtask_results=subtask_results,
            ctx=ctx,
        )

    return AutonomousResult(...)
```

### Few-Shot Storage Schema

**File:** `apps/web/drizzle/schema.ts` — Lines 4758–4880 (`agencyAgents` table)

**Current examples field** (line 4870):
```typescript
examples: jsonb("examples").$type<Array<{ role: string; content: string }[]>>(),
```

**Field is already available**, but structure should be:
```typescript
// Type definition (add to schema comments):
// examples: Array<{
//   input: string;      // The original task/input
//   output: string;     // The successful result
//   qualityScore: number;  // 0.0-1.0
//   iterations?: number;   // How many iterations to reach this quality
//   tags?: string[];       // ["high-quality", "autonomously_generated", etc]
// }>
```

### Few-Shot Capture Implementation

**New file or function:** `python-backend/app/services/agency_few_shot_capture.py`

**INSERTION POINT #3.2: New Few-Shot Service**

```python
async def capture_few_shot_example(
    db: AsyncSession,
    agent_node_id: str,
    task: str,
    result: str,
    quality_score: float,
    subtask_results: dict[str, str] | None = None,
) -> bool:
    """
    Capture a high-quality example for few-shot learning.

    Stores example in agencyAgents.examples field.
    Trims oldest low-quality examples if array exceeds 10 items.
    """
    # 1. Fetch current examples
    agent = await db.execute(
        select(AgencyAgent).where(AgencyAgent.id == agent_node_id)
    )
    agent_row = agent.scalars().first()
    if not agent_row:
        return False

    current_examples = agent_row.examples or []

    # 2. Build new example
    new_example = {
        "input": task[:1000],  # Cap at 1000 chars
        "output": result[:2000],  # Cap at 2000 chars
        "qualityScore": quality_score,
        "capturedAt": datetime.now(timezone.utc).isoformat(),
        "tags": ["autonomous"],
    }

    # 3. Add to examples (max 10)
    current_examples.append(new_example)
    if len(current_examples) > 10:
        # Remove lowest quality examples
        current_examples.sort(key=lambda e: e.get("qualityScore", 0))
        current_examples = current_examples[-10:]

    # 4. Update agent
    agent_row.examples = current_examples
    await db.commit()
    return True
```

### Integration Point

**File:** `python-backend/app/services/agency_orchestrator.py`

**In `_execute_autonomous_node` method, after line 1009 (completion):**
```python
if result.status == "complete":
    try:
        from app.services.agency_few_shot_capture import capture_few_shot_example
        # Only capture if quality is high (reflection score >= 0.85)
        # reflection object from autonomous_executor should be available
        await capture_few_shot_example(
            db=ltm_session,
            agent_node_id=node["id"],
            task=task_text,
            result=result.final_answer,
            quality_score=reflection.quality_score if hasattr(result, 'reflection_score') else 0.8,
        )
    except Exception:
        pass  # Non-critical
```

---

## Feature 4: ReAct Reflection

**Goal:** Add a reflection phase after ReAct execution completes to generate insights about execution quality.

### ReAct Execution Completion

**File:** `python-backend/app/services/react_executor.py`

**Current Execution Loop** (lines 92–247):

```python
async def execute(self, task: str, context: dict | None = None) -> ReActResult:
    # Lines 105–247: Iteration loop
    # Returns ReActResult with:
    # - status: "complete", "max_iterations", "budget_exceeded", "circuit_breaker"
    # - final_answer: str (actual output)
    # - iterations: int (iterations executed)
    # - total_tokens: int (tokens used)
    # - reasoning_trace: list[dict] (thought-action-observation chain)
```

**Reasoning Trace Structure** (line 90):
```python
self._reasoning_trace: list[dict] = []  # Populated during iteration
```

### Reflection Insertion Point

**INSERTION POINT #4.1: Post-ReAct Reflection Phase**

**File:** `python-backend/app/services/react_executor.py` — After line 247

**New method to add:**
```python
async def _reflect_on_execution(self) -> dict:
    """Generate insights about ReAct execution quality."""
    reflection_prompt = (
        "Analyze this ReAct execution trace and provide insights:\n\n"
        f"Task: [original task, if available]\n"
        f"Iterations: {len(self._reasoning_trace)}\n"
        f"Status: {self._status}\n"
        f"Tokens: {self._total_tokens}\n\n"
        "Evaluation (JSON):\n"
        "{\n"
        '  "efficiency_score": 0.0-1.0,  // Low iterations relative to quality\n'
        '  "approach_quality": 0.0-1.0,  // Did it pick good tools?\n'
        '  "reasoning_clarity": 0.0-1.0, // Was the thinking clear?\n'
        '  "key_insights": ["..."],      // What did it learn?\n'
        '  "reusable_patterns": ["..."]  // Patterns for future\n'
        "}"
    )

    try:
        resp = await self.gateway_client.chat.completions.create(
            model=self.model_name,
            messages=[{"role": "user", "content": reflection_prompt}],
            max_tokens=500,
            response_format={"type": "json_object"},
            timeout=30.0,
        )
        content = resp.choices[0].message.content or "{}"
        return json.loads(content)
    except Exception as e:
        logger.warning("react_reflection_failed", error=str(e)[:100])
        return {"efficiency_score": 0.5}
```

**Update ReActResult** (lines 31–39):
```python
@dataclass
class ReActResult:
    status: str
    final_answer: str
    iterations: int
    total_tokens: int
    reasoning_trace: list[dict] = field(default_factory=list)
    reflection: dict | None = None  # ← ADD THIS FIELD
```

**Modify execute() return** (line 241–247):
```python
# Before final return, add reflection if status is "complete":
reflection = None
if status == "complete":
    reflection = await self._reflect_on_execution()

return ReActResult(
    status=status,
    final_answer=last_content,
    iterations=self.max_iterations,
    total_tokens=self._total_tokens,
    reasoning_trace=self._reasoning_trace,
    reflection=reflection,  # ← NEW
)
```

### Reflection Storage

**INSERTION POINT #4.2: Store Reflection in Trace**

**File:** `python-backend/app/services/agency_orchestrator.py` — Line 813–854

```python
result: ReActResult = await executor.execute(task=augmented_message, context=memory_context)

# Store reflection in trace
if result.reflection and self.trace_collector:
    reflection_span_id = self.trace_collector.start_span(
        name="react_reflection",
        type="reflection",
        parent_span_id=react_span_id,  # If parent span ID is available
        input_data=json.dumps(result.reflection),
    )
    self.trace_collector.end_span(reflection_span_id)
```

---

## Feature 5: Trace-Based Learning

**Goal:** Analyze agency run traces to identify patterns and extract aggregate insights.

### Trace Collection Architecture

**File:** `python-backend/app/services/agency_trace_collector.py` (218 lines)

**TraceSpan Structure** (lines 58–95):
```python
@dataclass
class TraceSpan:
    span_id: str
    parent_span_id: str | None
    name: str
    type: str  # "agent_turn" | "tool_call" | "guardrail"
    start_ms: float
    end_ms: float | None = None
    duration_ms: float | None = None
    input_data: str | None = None
    output: str | None = None
    tokens: int = 0
    cost: float = 0.0
    tool_calls: list[dict[str, Any]] = field(default_factory=list)
    guardrails: list[dict[str, Any]] = field(default_factory=list)
    error: str | None = None
    metadata: dict[str, Any] = field(default_factory=dict)
```

**Trace Summary** (lines 195–217):
```python
def get_trace_summary(self) -> dict[str, Any]:
    """Return the full trace dict suitable for INSERT into agency_run_traces."""
    return {
        "runId": self.run_id,
        "agencyId": self.agency_id,
        "tenantId": self.tenant_id,
        "createdBy": self.user_id,
        "trace": {
            "version": 1,
            "spans": [s.to_dict() for s in self._spans.values()],
        },
        "durationMs": duration_ms,
        "totalTokens": total_tokens,
        "totalCost": round(total_cost, 6),
        "status": self._status,
    }
```

### Trace Storage

**File:** `apps/web/drizzle/schema.ts`

**agencyRunTraces table** (lines 5248–5268):
```typescript
export const agencyRunTraces = pgTable("agency_run_traces", {
  id: varchar("id", { length: 36 }).primaryKey(),
  tenantId: varchar("tenantId", { length: 36 }).notNull(),
  runId: varchar("runId", { length: 36 }).notNull(),
  agencyId: varchar("agencyId", { length: 36 }).notNull(),
  createdBy: integer("createdBy").references(() => users.id, { onDelete: "set null" }),
  trace: jsonb("trace").notNull(),  // ← Full nested trace with spans
  durationMs: integer("durationMs"),
  totalTokens: integer("totalTokens"),
  totalCost: numeric("totalCost", { precision: 10, scale: 6 }),
  status: varchar("status", { length: 20 }),
  createdAt: timestamp("createdAt", { withTimezone: true }).defaultNow().notNull(),
```

**Indexes:** Lines 5261–5264
- `agency_run_traces_tenant_idx` on tenantId
- `agency_run_traces_run_idx` on runId
- `agency_run_traces_agency_idx` on agencyId
- `agency_run_traces_created_idx` on createdAt

### Trace Analysis Service

**INSERTION POINT #5.1: New Trace Analysis Service**

**File:** `python-backend/app/services/agency_trace_analyzer.py` (new file)

```python
"""Analyze agency run traces to extract patterns and insights."""

from typing import Any
from datetime import datetime, timezone, timedelta
from sqlalchemy import select, and_
import structlog

from app.models.agency_run_traces import AgencyRunTrace  # (assuming model exists)

logger = structlog.get_logger(__name__)

class TraceAnalyzer:
    """Extracts patterns from trace collections."""

    def __init__(self, db: Any):
        self.db = db

    async def analyze_recent_runs(
        self,
        tenant_id: str,
        agency_id: str,
        lookback_hours: int = 24,
        min_runs: int = 5,
    ) -> dict[str, Any]:
        """
        Analyze recent successful runs to extract patterns.

        Returns:
        {
            "tool_patterns": [{"tool_id": "...", "frequency": 0.8, "success_rate": 0.95}],
            "efficiency_metrics": {"avg_tokens": 1500, "avg_iterations": 3, "avg_duration_ms": 5000},
            "common_patterns": ["pattern1", "pattern2"],
            "high_cost_tools": [{"tool_id": "...", "avg_cost": 0.50}],
        }
        """
        cutoff = datetime.now(timezone.utc) - timedelta(hours=lookback_hours)

        # Fetch recent runs
        result = await self.db.execute(
            select(AgencyRunTrace).where(
                and_(
                    AgencyRunTrace.tenant_id == tenant_id,
                    AgencyRunTrace.agency_id == agency_id,
                    AgencyRunTrace.created_at >= cutoff,
                    AgencyRunTrace.status == "completed",
                )
            ).limit(100)
        )
        runs = result.scalars().all()

        if len(runs) < min_runs:
            return {}

        # Extract patterns
        tool_usage = {}  # tool_id -> {count, success_count, total_cost, total_tokens}
        total_tokens = []
        total_duration_ms = []

        for run in runs:
            trace_data = run.trace or {}
            spans = trace_data.get("spans", [])

            for span in spans:
                if span.get("type") == "tool_call":
                    tool_name = span.get("name", "unknown")
                    if tool_name not in tool_usage:
                        tool_usage[tool_name] = {
                            "count": 0, "success": 0, "total_cost": 0.0, "total_tokens": 0
                        }

                    tool_usage[tool_name]["count"] += 1
                    if not span.get("error"):
                        tool_usage[tool_name]["success"] += 1
                    tool_usage[tool_name]["total_cost"] += float(span.get("cost", 0.0))
                    tool_usage[tool_name]["total_tokens"] += int(span.get("tokens", 0))

            total_tokens.append(run.total_tokens or 0)
            total_duration_ms.append(run.duration_ms or 0)

        # Compute aggregate metrics
        tool_patterns = [
            {
                "tool_id": tool_id,
                "frequency": usage["count"] / len(runs),
                "success_rate": usage["success"] / max(1, usage["count"]),
                "avg_cost": usage["total_cost"] / max(1, usage["count"]),
                "avg_tokens": usage["total_tokens"] // max(1, usage["count"]),
            }
            for tool_id, usage in tool_usage.items()
        ]
        tool_patterns.sort(key=lambda x: x["frequency"], reverse=True)

        return {
            "tool_patterns": tool_patterns[:10],  # Top 10
            "efficiency_metrics": {
                "avg_tokens": sum(total_tokens) // len(total_tokens),
                "avg_duration_ms": sum(total_duration_ms) // len(total_duration_ms),
                "runs_analyzed": len(runs),
            },
            "high_cost_tools": [
                t for t in tool_patterns
                if t["avg_cost"] > 0.10  # Cost threshold
            ],
        }
```

### Periodic Analysis Job

**INSERTION POINT #5.2: Celery Task for Periodic Analysis**

**File:** `python-backend/app/tasks/agency_trace_learning.py` (new file)

```python
"""Periodic tasks for trace-based learning."""

from datetime import datetime, timezone
import structlog
from celery import shared_task

logger = structlog.get_logger(__name__)

@shared_task(bind=True, max_retries=2)
def analyze_agency_traces_periodic(self, tenant_id: str, agency_id: str):
    """
    Periodic task: Analyze traces every 24 hours.
    Extract patterns and update agency's few-shot examples with learned patterns.
    """
    from app.core.database import SessionLocal
    from app.services.agency_trace_analyzer import TraceAnalyzer

    try:
        with SessionLocal() as db:
            analyzer = TraceAnalyzer(db)
            analysis = analyzer.analyze_recent_runs(
                tenant_id=tenant_id,
                agency_id=agency_id,
                lookback_hours=24,
                min_runs=5,
            )

            if not analysis:
                return {"status": "insufficient_data"}

            # Store analysis results in agencyAgents.metadata or new table
            logger.info(
                "trace_analysis_complete",
                tenant_id=tenant_id,
                agency_id=agency_id,
                tool_patterns=len(analysis.get("tool_patterns", [])),
            )

            return {"status": "success", "analysis": analysis}
    except Exception as exc:
        logger.error("trace_analysis_failed", error=str(exc)[:200])
        raise self.retry(countdown=60, exc=exc)
```

### Trace Analysis Integration

**INSERTION POINT #5.3: Periodic Job Scheduling**

**File:** `python-backend/app/core/celery_app.py`

Add to beat schedule (or use a periodic task scheduler):
```python
from celery.schedules import crontab

app.conf.beat_schedule = {
    # ... existing tasks ...
    "analyze-agency-traces": {
        "task": "app.tasks.agency_trace_learning.analyze_agency_traces_periodic",
        "schedule": crontab(hour=1, minute=0),  # Daily at 1 AM UTC
        "args": (),  # Will need to be parameterized per tenant/agency
    },
}
```

---

## Summary Table: Implementation Roadmap

| Feature | File | Lines | Type | Effort | Dependencies |
|---------|------|-------|------|--------|--------------|
| **1. Confidence Boost** | `agency_memory_retriever.py` | 50–57, 231–234 | Read retrieved memory IDs | 2–3h | RetrievalResult tracking |
| | `agency_orchestrator.py` | 822–837, 970–985 | Insert post-success hook | | Memory ID state |
| | `long_term_memory.py` | 482+ | New boost_memory_confidence() | | SQLAlchemy update |
| **2. Outcome-Aware** | `long_term_memory.py` | 407–447 | Enhance extract_memories() | 3–4h | Execution context passing |
| | `agency_orchestrator.py` | 828–835, 976–983 | Update callsites | | Reflection result handling |
| **3. Few-Shot Auto** | `autonomous_executor.py` | 551–559 | Capture high-quality runs | 4–5h | Quality scoring in reflection |
| | `agency_few_shot_capture.py` | New file | New capture service | | Drizzle schema field |
| | `apps/web/drizzle/schema.ts` | 4870 | Use examples field | | Already exists |
| **4. ReAct Reflection** | `react_executor.py` | 241–247 | Post-execution reflection | 3–4h | LLM call overhead |
| | `react_executor.py` | 31–39 | Add reflection field | | ReActResult dataclass |
| | `agency_orchestrator.py` | 813–854 | Store reflection in trace | | Trace collector integration |
| **5. Trace Analysis** | `agency_trace_analyzer.py` | New file | Pattern extraction service | 4–5h | agencyRunTraces schema |
| | `agency_trace_learning.py` | New file | Celery periodic task | | Existing Celery setup |
| | `celery_app.py` | Beat schedule | Schedule analysis jobs | | Celery beat setup |

---

## Data Flow Diagram

```
┌─────────────────────────────────────────────────────────────────┐
│ ReAct / Autonomous Executor runs successfully (status=complete) │
└────────────────────────────┬────────────────────────────────────┘
                             │
        ┌────────────────────┼────────────────────┐
        │                    │                    │
        ▼                    ▼                    ▼
   [Feature 1]          [Feature 2]          [Feature 4]
   Boost Confidence    Outcome-Aware     ReAct Reflection
   + Retrieved Mem IDs  + Execution Stats + Reasoning Trace
   (confidence *= 1.1)  (enhance prompt)  (quality scores)
        │                    │                    │
        └────────────────────┼────────────────────┘
                             │
                    [Extract & Store Memories]
                             │
                             ▼
        ┌────────────────────────────────────┐
        │  [Feature 3] Few-Shot Auto-Capture │
        │  (if quality >= 0.85)              │
        │  Store input → output pairs        │
        └────────────────────────────────────┘
                             │
                             ▼
        ┌────────────────────────────────────┐
        │  [TraceCollector] Persist Trace    │
        │  to agencyRunTraces table          │
        └────────────────────────────────────┘
                             │
                    (24h later, batch job)
                             │
                             ▼
        ┌────────────────────────────────────┐
        │ [Feature 5] Trace Analysis Service │
        │ Extract tool patterns, metrics     │
        │ Update few-shot examples           │
        └────────────────────────────────────┘
```

---

## Open Questions & Decisions

1. **Confidence Boost Factor:** Should boost_factor be configurable per agent or fixed at 1.1?
2. **Few-Shot Quality Threshold:** Is 0.85 quality_score the right cutoff? Should it be tunable?
3. **Trace Analysis Frequency:** 24 hours is baseline—should this be per-tenant configurable?
4. **Memory ID Tracking:** Where should retrieved_memory_ids be stored in execution context? New field on ExecutionContext?
5. **Reflection Token Cost:** Reflection LLM call uses ~500 tokens—should this be optional to control cost?
6. **Trace Analysis Storage:** Should aggregate insights be stored in a separate `agency_trace_insights` table or in agent metadata?

---

## Critical Implementation Order

1. **First:** Feature 1 (Confidence Boost) — smallest, highest ROI
2. **Second:** Feature 2 (Outcome-Aware Memory) — enhances memory quality directly
3. **Third:** Feature 4 (ReAct Reflection) — provides data for other features
4. **Fourth:** Feature 3 (Auto Few-Shot) — depends on quality scores from #4
5. **Fifth:** Feature 5 (Trace Analysis) — batch processing, lowest immediate impact but enables long-term learning
