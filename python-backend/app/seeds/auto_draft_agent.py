"""
Auto Draft Agent seed — Spec 035 Section 07.

Seeds the Auto Draft Agent as a system-level template agency.
Uses idempotent upsert keyed on (tenantId, slug) so it can be
re-run safely during deployments without creating duplicates.

Usage:
    from app.seeds.auto_draft_agent import seed_auto_draft_agent
    async with db_session() as session:
        await seed_auto_draft_agent(session)
"""

import uuid

from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

import structlog

logger = structlog.get_logger(__name__)

# ── Constants (importable by tests and startup) ────────────────────────────

AGENCY_NAME = "Auto Draft Agent"
AGENCY_SLUG = "auto-draft-agent"
AGENCY_TENANT_ID = "__system__"
AGENCY_VISIBILITY = "template"
AGENCY_STATUS = "active"
AGENCY_DESCRIPTION = "สร้าง presentation อัตโนมัติจาก brief เดียว"

AGENT_TOOL_IDS = [
    "builtin-skill-discovery",
    "builtin-model-suggest",
    "builtin-auto-draft",
    "builtin-rag-knowledge",
    "builtin-file-parse",
]

AGENT_INSTRUCTIONS = """You are the Auto Draft Agent. Your task is to generate a complete presentation from a single user brief using a structured 7-step decision process. NEVER ask the user follow-up questions if you can make a reasonable default decision.

## 7-Step Decision Process

### Step 1 — Analyze Brief
Parse the topic to identify:
- Domain (business, marketing, education, tech, creative, health, lifestyle, product-review)
- Complexity level: simple=5 slides, moderate=8-10 slides, complex=12-15 slides
- Key concepts and audience

### Step 2 — Select Article Skill
Use `builtin-skill-discovery` with category="prompt_enhancement" to find the best writing skill.
Domain-to-skill mapping:
| Domain | Preferred Skill |
|--------|----------------|
| business/marketing/education/tech/creative | general-article-writer |
| health | health-wellness-reviewer |
| lifestyle | home-decor-textile-reviewer |
| product-review/electronics | electronics-reviewer |
| product-review/food | food-grocery-reviewer |

### Step 3 — Select Media Model
Use `builtin-model-suggest` with purpose="image" to pick the optimal image model.
Default to balanced quality_preference.

### Step 4 — Select Style Preset
Domain-to-style mapping:
| Domain | Default Style |
|--------|--------------|
| business/tech | corporate-blue |
| marketing | warm-sunset |
| education | light-minimalist |
| creative | creative-bold |
| health | fresh-green |
| Default | light-minimalist |

### Step 5 — Fill Parameters
Construct the auto-draft param set:
- num_slides: from complexity analysis
- language: "th" (Thai default unless user specifies otherwise)
- canvas_preset: "16:9" (standard widescreen)
- style_preset: from step 4
- article_skill_slug: from step 2
- image_model_id: from step 3

### Step 6 — Generate
Call `builtin-auto-draft` with the assembled params.
Monitor the response for success/failure.
If the draft fails, report the error clearly with the sanitized error message.

### Step 7 — Envelope Output
Format the result as an AgencyResultEnvelope:
- On success: include deck_id, slide_count, credits_used, and a brief summary of what was generated
- On failure: include the error, recommend retry with adjusted params

## Important Rules
- NEVER expose internal API tokens or encryption keys in messages
- NEVER ask the user for information you can derive from context
- Use `builtin-rag-knowledge` when the brief references company-specific knowledge
- Use `builtin-file-parse` when the user provides a file URL for batch processing
- All generate calls must include a trace_id for audit correlation
"""

# ── Deterministic UUID generation ─────────────────────────────────────────

_AGENCY_ID = str(uuid.uuid5(uuid.NAMESPACE_URL, "smartspec:auto-draft-agent"))
_AGENT_ID = str(uuid.uuid5(uuid.NAMESPACE_URL, "smartspec:auto-draft-agent:main-agent"))


# ── Seed function ──────────────────────────────────────────────────────────


async def seed_auto_draft_agent(session: AsyncSession) -> None:
    """Idempotently seed the Auto Draft Agent template.

    Uses ON CONFLICT DO UPDATE to safely re-run during deployments.
    The __system__ tenant is created if it does not exist.
    """
    # 1. Ensure __system__ tenant exists
    await session.execute(
        text("""
            INSERT INTO tenants (id, name, domain, plan)
            VALUES (:id, :name, :domain, :plan)
            ON CONFLICT (id) DO NOTHING
        """),
        {
            "id": AGENCY_TENANT_ID,
            "name": "System",
            "domain": "__system__",
            "plan": "enterprise",
        },
    )

    # 2. Upsert agency
    await session.execute(
        text("""
            INSERT INTO agencies (
                id, "tenantId", slug, name, description,
                "systemPrompt", status, visibility
            ) VALUES (
                :id, :tenantId, :slug, :name, :description,
                :systemPrompt, :status, :visibility
            )
            ON CONFLICT ("tenantId", slug) DO UPDATE SET
                name = EXCLUDED.name,
                description = EXCLUDED.description,
                "systemPrompt" = EXCLUDED."systemPrompt",
                status = EXCLUDED.status,
                visibility = EXCLUDED.visibility
        """),
        {
            "id": _AGENCY_ID,
            "tenantId": AGENCY_TENANT_ID,
            "slug": AGENCY_SLUG,
            "name": AGENCY_NAME,
            "description": AGENCY_DESCRIPTION,
            "systemPrompt": f"You are the {AGENCY_NAME}.",
            "status": AGENCY_STATUS,
            "visibility": AGENCY_VISIBILITY,
        },
    )

    # 3. Upsert agent node
    await session.execute(
        text("""
            INSERT INTO agency_agents (
                id, "agencyId", name, instructions,
                "isEntryPoint", "nodeType"
            ) VALUES (
                :id, :agencyId, :name, :instructions,
                :isEntryPoint, :nodeType
            )
            ON CONFLICT ("agencyId", name) DO UPDATE SET
                instructions = EXCLUDED.instructions,
                "isEntryPoint" = EXCLUDED."isEntryPoint",
                "nodeType" = EXCLUDED."nodeType"
        """),
        {
            "id": _AGENT_ID,
            "agencyId": _AGENCY_ID,
            "name": "Auto Draft Agent",
            "instructions": AGENT_INSTRUCTIONS,
            "isEntryPoint": True,
            "nodeType": "agent",
        },
    )

    # 4. Replace tool assignments (delete + re-insert to keep in sync)
    await session.execute(
        text('DELETE FROM agency_agent_tools WHERE "agentId" = :agentId'),
        {"agentId": _AGENT_ID},
    )

    for tool_id in AGENT_TOOL_IDS:
        tool_uuid = str(uuid.uuid5(uuid.NAMESPACE_URL, f"smartspec:auto-draft-agent:{tool_id}"))
        await session.execute(
            text("""
                INSERT INTO agency_agent_tools (id, "agentId", "toolId", "toolConfig")
                VALUES (:id, :agentId, :toolId, :toolConfig)
                ON CONFLICT (id) DO UPDATE SET
                    "toolId" = EXCLUDED."toolId",
                    "toolConfig" = EXCLUDED."toolConfig"
            """),
            {
                "id": tool_uuid,
                "agentId": _AGENT_ID,
                "toolId": tool_id,
                "toolConfig": None,
            },
        )

    await session.commit()
    logger.info("auto_draft_agent_seeded", agency_id=_AGENCY_ID, agent_id=_AGENT_ID)
