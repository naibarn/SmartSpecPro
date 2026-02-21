# Feature 017: Virtual Workflow Exam — Usage Guide

## What Was Built

This feature adds an AI-powered workflow generation system with validation, retry logic, a gallery of curated templates, and a visual topology diagram generator.

## Sections Implemented

| # | Section | Commit | Key Files |
|---|---------|--------|-----------|
| 01 | Schema Extension | 187a692 | `apps/web/drizzle/schema.ts` — `workflowTemplates` table with 30+ fields |
| 02 | SVG Generator | 3989758 | `apps/web/server/services/workflowSvgGenerator.ts` — topology diagrams |
| 03 | Template JSON Files | ef6ff97 | `specs/feature/017-VirtualWorkflowExam/templates/tpl-*.json` — 60 templates |
| 04 | Seeder Script | 188c953 | Idempotent seeder for all 60 templates |
| 05 | tRPC Endpoints | 28d64cf | Gallery listing, filtering, template detail endpoints |
| 06 | Gallery Frontend | 4e4de58 | `apps/web/client/src/pages/Gallery.tsx` — category filtering, preview |
| 07 | Python Validator | f6dcb47 | `python-backend/app/orchestrator/workflow_validator.py` |
| 08 | Python Generator | 219729a | Retry loop, few-shot cache, structured errors |

## How to Use

### Workflow Validator (Section 07)

```python
from app.orchestrator.workflow_validator import GeneratedWorkflow

# Validate any workflow dict
workflow = GeneratedWorkflow.model_validate(parsed_dict)
validated = workflow.model_dump()

# Raises pydantic.ValidationError with specific messages for:
# - Missing trigger node
# - Unknown nodeType (not in 57 known types)
# - Edge referencing non-existent node ID
# - Duplicate node IDs
```

### Workflow Generator with Retry (Section 08)

```python
from app.orchestrator.workflow_generator import WorkflowGenerator

generator = WorkflowGenerator()

# New: up to 3 attempts with validation feedback
result = await generator.generate_with_retry(
    prompt="Create a daily sales report workflow",
    model="gpt-4o-mini",
    user_token=user_jwt,
)

# Old: single-shot (still works, now uses same _call_llm_once())
result = await generator.generate(prompt="...", model="gpt-4o-mini")
```

### Few-Shot Examples

The generator automatically loads 5 curated templates from the database as few-shot examples. Cache refreshes every 24 hours. Falls back to built-in examples if DB is unavailable.

### Frontend Error Display

When workflow generation fails after 3 attempts:
- Error message shown in red panel
- Expandable "Technical details" with Pydantic validation error
- Amber "Suggestion" hint derived from error type
- "Try again" button resets state

### Running Tests

```bash
# Section 07 tests (15 tests)
cd python-backend && uv run pytest tests/test_workflow_validator.py -m unit -v

# Section 08 tests (12 tests)
cd python-backend && uv run pytest tests/test_workflow_generator.py -m unit -v

# All workflow tests together (27 tests)
cd python-backend && uv run pytest -m unit -k "workflow_generator or workflow_validator" -v
```

## Architecture Diagram

```
User Prompt
    │
    ▼
AutoCreateWorkflowModal (React)
    │
    ▼ (tRPC: workflow.autoGenerate)
workflow.ts router → Python API /workflows/generate
    │
    ▼ (Celery task)
generate_workflow_task
    │
    ▼ (max_attempts=3)
generate_with_retry() ←─── _build_retry_prompt()
    │                         ↑ (error feedback)
    ├── _call_llm_once() → forward_chat_json → LLM
    │        │
    │        ▼
    │   _parse_and_validate() → raw dict
    │        │
    │        ▼
    ├── GeneratedWorkflow.model_validate()
    │        │
    │   ┌────┴────┐
    │   │ PASS    │ FAIL → ValidationError
    │   ▼         ▼       (fed back to LLM)
    │ return    retry
    │
    ▼ (after 3 failures)
WorkflowGenerationError
    │   .validation_error = "..."
    │   .hint = _derive_hint()
    ▼
Redis status → tRPC poll → Frontend error display
```
