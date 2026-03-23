"""Tests for agency_agent_memories table schema and SQLAlchemy model."""

import pytest
from app.models.agency_agent_memories import AgencyAgentMemory, MemoryType


def test_table_exists():
    assert AgencyAgentMemory.__tablename__ == "agency_agent_memories"


def test_tenant_id_is_varchar36():
    col = AgencyAgentMemory.__table__.columns["tenantId"]
    assert str(col.type) == "VARCHAR(36)"
    assert col.nullable is False


def test_agency_id_is_varchar36():
    col = AgencyAgentMemory.__table__.columns["agencyId"]
    assert str(col.type) == "VARCHAR(36)"
    assert col.nullable is False


def test_user_id_column_exists():
    col = AgencyAgentMemory.__table__.columns["userId"]
    assert str(col.type) == "INTEGER"
    assert col.nullable is False


def test_content_hash_column_exists():
    col = AgencyAgentMemory.__table__.columns["contentHash"]
    assert str(col.type) == "TEXT"
    assert col.nullable is False


def test_memory_type_enum_values():
    expected = {"constraint", "preference", "fact", "skill"}
    actual = {m.value for m in MemoryType}
    assert actual == expected


def test_model_to_dict():
    memory = AgencyAgentMemory(
        id=1,
        tenant_id="t-1",
        agency_id="a-1",
        user_id=42,
        agent_node_id="node-1",
        memory_type="fact",
        content="test content",
        content_hash="abc123",
        confidence=0.9,
        use_count=5,
        is_active=True,
    )
    d = memory.to_dict()
    required_keys = {
        "id", "tenantId", "agencyId", "userId", "agentNodeId",
        "memoryType", "content", "contentHash", "sourceRunId",
        "confidence", "useCount", "lastUsedAt", "createdAt",
        "updatedAt", "isActive",
    }
    assert required_keys.issubset(set(d.keys()))
    assert d["tenantId"] == "t-1"
    assert d["userId"] == 42


def test_content_hash_unique_index():
    idx_names = [idx.name for idx in AgencyAgentMemory.__table__.indexes]
    constraint_names = [c.name for c in AgencyAgentMemory.__table__.constraints]
    assert "uq_agent_memories_content" in idx_names or "uq_agent_memories_content" in constraint_names


def test_lookup_index_exists():
    idx_names = [idx.name for idx in AgencyAgentMemory.__table__.indexes]
    assert "ix_agent_memories_lookup" in idx_names
