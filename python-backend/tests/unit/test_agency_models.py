"""Tests for agency SQLAlchemy models (agency_messages, agency_runs)."""

import pytest
from sqlalchemy.ext.asyncio import AsyncSession, create_async_engine, async_sessionmaker
from sqlalchemy.pool import StaticPool
from app.core.database import Base
from app.models.agency import AgencyMessage, AgencyRun, AgencyRunArtifact, AgencyRunStatus


@pytest.fixture(scope="function")
async def agency_db():
    """Create in-memory SQLite DB with only agency tables for testing.

    We create only agency-specific tables (not all Base.metadata) because
    other models use JSONB columns which SQLite doesn't support.
    """
    engine = create_async_engine(
        "sqlite+aiosqlite:///:memory:",
        poolclass=StaticPool,
        connect_args={"check_same_thread": False},
    )
    async with engine.begin() as conn:
        await conn.run_sync(
            lambda sync_conn: Base.metadata.create_all(
                sync_conn,
                tables=[AgencyMessage.__table__, AgencyRun.__table__, AgencyRunArtifact.__table__],
            )
        )
    session_factory = async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)
    async with session_factory() as session:
        yield session
    await engine.dispose()


@pytest.mark.unit
@pytest.mark.agency
class TestAgencyMessage:
    """Tests for the agency_messages SQLAlchemy model."""

    async def test_create_message_without_fk_constraint(self, agency_db):
        """agency_messages has no DB FK to agency_conversations (Drizzle-owned table)."""
        msg = AgencyMessage(
            id=1,  # explicit ID: SQLite BIGINT doesn't auto-increment
            conversation_id="conv-uuid-1234",
            agent_name="Researcher",
            role="assistant",
            content="Hello from agent",
        )
        agency_db.add(msg)
        await agency_db.commit()
        await agency_db.refresh(msg)
        assert msg.id is not None
        assert msg.conversation_id == "conv-uuid-1234"

    async def test_pii_redacted_defaults_to_false(self, agency_db):
        """pii_redacted flag defaults to False."""
        msg = AgencyMessage(
            id=2,
            conversation_id="conv-uuid-1234",
            agent_name="Writer",
            role="assistant",
            content="Some content",
        )
        agency_db.add(msg)
        await agency_db.commit()
        await agency_db.refresh(msg)
        assert msg.pii_redacted is False

    async def test_all_role_values_accepted(self, agency_db):
        """role column accepts user, assistant, system, tool."""
        for i, role in enumerate(("user", "assistant", "system", "tool"), start=10):
            msg = AgencyMessage(
                id=i,
                conversation_id="conv-uuid-1234",
                agent_name="Agent",
                role=role,
                content=f"Message with role {role}",
            )
            agency_db.add(msg)
        await agency_db.commit()


@pytest.mark.unit
@pytest.mark.agency
class TestAgencyRun:
    """Tests for the agency_runs SQLAlchemy model."""

    async def test_create_run_with_all_status_values(self, agency_db):
        """agency_runs accepts all defined status values."""
        for status in AgencyRunStatus:
            run = AgencyRun(
                id=f"run-{status.value}",
                conversation_id="conv-uuid-1234",
                user_id=1,
                agency_id="agency-uuid-1234",
                tenant_id="tenant-uuid-1234",
                status=status.value,
            )
            agency_db.add(run)
        await agency_db.commit()

    async def test_total_credits_calculation(self, agency_db):
        """total_credits_used = gateway_cost + multiplier_markup."""
        run = AgencyRun(
            id="run-cost-test",
            conversation_id="conv-uuid-1234",
            user_id=1,
            agency_id="agency-uuid-1234",
            tenant_id="tenant-uuid-1234",
            status="completed",
            total_gateway_cost=10.0,
            multiplier_markup=5.0,
            total_credits_used=15.0,
        )
        agency_db.add(run)
        await agency_db.commit()
        await agency_db.refresh(run)
        assert float(run.total_credits_used) == float(run.total_gateway_cost) + float(run.multiplier_markup)

    async def test_to_dict_returns_expected_shape(self, agency_db):
        """to_dict() returns a dict with all expected keys."""
        run = AgencyRun(
            id="run-dict-test",
            conversation_id="conv-uuid-1234",
            user_id=1,
            agency_id="agency-uuid-1234",
            tenant_id="tenant-uuid-1234",
            status="queued",
        )
        agency_db.add(run)
        await agency_db.commit()
        d = run.to_dict()
        assert "id" in d
        assert "status" in d
        assert "conversationId" in d
        assert "agencyId" in d
        assert "structuredResult" in d
        assert "structuredResultParseStatus" in d


@pytest.mark.unit
@pytest.mark.agency
class TestAgencyRunArtifact:
    """Tests for the agency_run_artifacts SQLAlchemy model."""

    async def test_create_preview_artifact(self, agency_db):
        """agency_run_artifacts persists preview metadata additively."""
        artifact = AgencyRunArtifact(
            id="artifact-1",
            run_id="run-1",
            conversation_id="conv-uuid-1234",
            agency_id="agency-uuid-1234",
            tenant_id="tenant-uuid-1234",
            artifact_type="research_report",
            intent="research_report",
            state="preview_generated",
            commit_status="not_committed",
            commit_token="commit-token-1",
            summary="Research preview ready.",
        )
        agency_db.add(artifact)
        await agency_db.commit()
        await agency_db.refresh(artifact)

        assert artifact.id == "artifact-1"
        assert artifact.state == "preview_generated"
        assert artifact.commit_status == "not_committed"
