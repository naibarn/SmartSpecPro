# Section 7: Auto Draft Agent Template (Seed Data)

## Overview

This section creates the Auto Draft Agent as a system-level agency template. The agent is seeded into the database via an idempotent Python script that inserts (or updates) the agency, its single agent node, and the 5 tool assignments. The seed is keyed on a stable slug (`auto-draft-agent`) under tenantId `__system__` so it can be re-run safely during deployments without creating duplicates.

**Dependencies:**
- Section 06 (Python tool registration) -- the 5 builtin tool IDs must be registered in `_BUILTIN_ENDPOINTS`
- Section 08 (skill-discovery stub) -- the `builtin-skill-discovery` tool endpoint must exist

**Blocks:** Section 09 (UI changes reference this agent template)

## Files to Create

- `/home/dev/projects/SmartSpecPro/python-backend/app/seeds/auto_draft_agent.py`
- `/home/dev/projects/SmartSpecPro/python-backend/tests/unit/test_auto_draft_agent_template.py`

## Database Tables Involved

The seed script writes to three existing Drizzle-owned tables using raw SQL via SQLAlchemy `text()`:

### `agencies` table (key columns)
- `id` -- varchar(36), primary key (UUID)
- `tenantId` -- varchar(36), references tenants
- `slug` -- varchar(100), unique per tenant
- `name` -- varchar(255)
- `description` -- text
- `systemPrompt` -- text
- `status` -- varchar(20), default "draft"
- `visibility` -- varchar(20), default "private"

### `agency_agents` table (key columns)
- `id` -- varchar(36), primary key (UUID)
- `agencyId` -- varchar(36), FK to agencies
- `name` -- varchar(100)
- `instructions` -- text (the core agent prompt)
- `isEntryPoint` -- boolean, default false
- `nodeType` -- varchar(30), default "agent"

### `agency_agent_tools` table (key columns)
- `id` -- varchar(36), primary key (UUID)
- `agentId` -- varchar(36), FK to agency_agents
- `toolId` -- varchar(100)
- `toolConfig` -- JSON, nullable

## Tests First

**File:** `/home/dev/projects/SmartSpecPro/python-backend/tests/unit/test_auto_draft_agent_template.py`

```python
"""Tests for Auto Draft Agent template seed data."""
import pytest
from unittest.mock import AsyncMock, MagicMock

pytestmark = [pytest.mark.unit, pytest.mark.agency]


class TestAgentSeedData:

    def test_agent_seed_has_correct_name(self):
        from app.seeds.auto_draft_agent import AGENCY_NAME
        assert AGENCY_NAME == "Auto Draft Agent"

    def test_agent_seed_has_visibility_template(self):
        from app.seeds.auto_draft_agent import AGENCY_VISIBILITY
        assert AGENCY_VISIBILITY == "template"

    def test_agent_seed_has_system_tenant(self):
        from app.seeds.auto_draft_agent import AGENCY_TENANT_ID
        assert AGENCY_TENANT_ID == "__system__"

    def test_agent_seed_assigns_all_5_tools(self):
        from app.seeds.auto_draft_agent import AGENT_TOOL_IDS
        expected = {
            "builtin-skill-discovery",
            "builtin-model-suggest",
            "builtin-auto-draft",
            "builtin-rag-knowledge",
            "builtin-file-parse",
        }
        assert set(AGENT_TOOL_IDS) == expected

    def test_agent_instructions_contain_decision_steps(self):
        from app.seeds.auto_draft_agent import AGENT_INSTRUCTIONS
        required_keywords = [
            "analyze", "skill", "model", "style",
            "param", "generate", "envelope",
        ]
        instructions_lower = AGENT_INSTRUCTIONS.lower()
        for kw in required_keywords:
            assert kw in instructions_lower, f"Missing keyword '{kw}'"


class TestAgentUpsert:

    @pytest.mark.asyncio
    async def test_upsert_is_idempotent(self):
        from app.seeds.auto_draft_agent import seed_auto_draft_agent
        mock_session = AsyncMock()
        mock_session.execute = AsyncMock(return_value=MagicMock())
        mock_session.commit = AsyncMock()

        await seed_auto_draft_agent(mock_session)
        first_call_count = mock_session.execute.call_count

        mock_session.execute.reset_mock()
        await seed_auto_draft_agent(mock_session)
        second_call_count = mock_session.execute.call_count

        assert first_call_count == second_call_count

    @pytest.mark.asyncio
    async def test_upsert_updates_instructions_without_duplicates(self):
        from app.seeds.auto_draft_agent import seed_auto_draft_agent
        mock_session = AsyncMock()
        mock_session.execute = AsyncMock(return_value=MagicMock())
        mock_session.commit = AsyncMock()

        await seed_auto_draft_agent(mock_session)

        calls = mock_session.execute.call_args_list
        sql_texts = [str(call[0][0]) if call[0] else "" for call in calls]
        has_upsert = any("ON CONFLICT" in s or "on conflict" in s.lower() for s in sql_texts)
        assert has_upsert, "Seed must use ON CONFLICT (upsert) to be idempotent"
```

## Implementation Details

### Constants

The module must export these constants:

- `AGENCY_NAME = "Auto Draft Agent"`
- `AGENCY_SLUG = "auto-draft-agent"`
- `AGENCY_TENANT_ID = "__system__"`
- `AGENCY_VISIBILITY = "template"`
- `AGENCY_DESCRIPTION = "สร้าง presentation อัตโนมัติจาก brief เดียว"`
- `AGENCY_STATUS = "active"`
- `AGENT_TOOL_IDS` -- list of 5 tool IDs
- `AGENT_INSTRUCTIONS` -- full 7-step decision process

### Tool Assignments

5 tools:
1. `builtin-skill-discovery` -- find the best article/media skill
2. `builtin-model-suggest` -- pick optimal image/video model
3. `builtin-auto-draft` -- execute presentation generation
4. `builtin-rag-knowledge` -- retrieve knowledge base context
5. `builtin-file-parse` -- parse uploaded files into topics

### Agent Instructions (7-Step Decision Process)

**Step 1 -- Analyze Brief:** Parse topic, identify domain, determine complexity (simple=5, moderate=8-10, complex=12-15 slides).

**Step 2 -- Select Article Skill:** Use `builtin-skill-discovery`. Domain-to-skill mapping:

| Domain | Preferred Skill |
|--------|----------------|
| business/marketing/education/tech/creative | general-article-writer |
| health | health-wellness-reviewer |
| lifestyle | home-decor-textile-reviewer |
| product-review/electronics | electronics-reviewer |
| product-review/food | food-grocery-reviewer |

**Step 3 -- Select Media Model:** Use `builtin-model-suggest` with purpose "image" (default).

**Step 4 -- Select Style Preset:** Domain-to-style mapping:

| Domain | Default Style |
|--------|--------------|
| business/tech | corporate-blue |
| marketing | warm-sunset |
| education | light-minimalist |
| creative | creative-bold |
| health | fresh-green |

**Step 5 -- Fill Parameters:** Construct auto-draft request with num_slides, language ("th" default), canvas_preset ("16:9" default).

**Step 6 -- Generate:** Call `builtin-auto-draft`.

**Step 7 -- Envelope Output:** Format result as AgencyResultEnvelope.

**Critical rule:** "NEVER ask the user follow-up questions if you can make a reasonable default decision."

### Upsert Logic

The `seed_auto_draft_agent` function must:

1. Generate deterministic UUIDs using `uuid.uuid5(uuid.NAMESPACE_URL, "smartspec:auto-draft-agent")`
2. Use `INSERT INTO agencies (...) ON CONFLICT (tenantId, slug) DO UPDATE SET ...`
3. Use `INSERT INTO agency_agents (...) ON CONFLICT (agencyId, name) DO UPDATE SET ...`
4. For tool assignments: delete existing tools for the agent, re-insert all 5
5. Handle `__system__` tenant creation if needed

### Directory Creation

Create `python-backend/app/seeds/` directory with `__init__.py`.

### Integration with Startup

Call from existing startup path (e.g., `app/main.py` or `app/core/seed.py`).

## Implementation Checklist

1. Create `python-backend/app/seeds/` directory with `__init__.py`
2. Write test file
3. Run tests (should fail)
4. Create seed script with constants and upsert logic
5. Run tests (should pass)
6. Integrate seed call into application startup
