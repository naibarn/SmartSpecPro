"""Tests for sandbox_audit.py — structured audit event emission."""
import json
import os
import tempfile
from unittest.mock import patch

import pytest

from app.services.sandbox_audit import SandboxAuditService

pytestmark = [pytest.mark.sandbox, pytest.mark.unit]


class TestAuditEvents:
    """Sandbox audit service emits structured lifecycle events."""

    @pytest.mark.asyncio
    async def test_emit_event_for_each_lifecycle_stage(self):
        """Each sandbox status transition emits an audit event with the correct event_type."""
        with tempfile.TemporaryDirectory() as tmpdir:
            service = SandboxAuditService(audit_log_dir=tmpdir)

            for event_type in ["sandbox_job_accepted", "sandbox_created",
                               "sandbox_executing", "sandbox_completed"]:
                service.emit(
                    event_type=event_type,
                    sandbox_job_id="job-123",
                    tenant_id="tenant-1",
                    user_id=42,
                    feature_type="media",
                    profile_slug="media-processing",
                )

            # Check the audit log file
            log_files = os.listdir(tmpdir)
            assert len(log_files) == 1
            assert log_files[0].startswith("audit-")
            assert log_files[0].endswith(".jsonl")

            with open(os.path.join(tmpdir, log_files[0])) as f:
                lines = f.readlines()
                assert len(lines) == 4
                events = [json.loads(line) for line in lines]
                assert events[0]["eventType"] == "sandbox_job_accepted"
                assert events[3]["eventType"] == "sandbox_completed"

    @pytest.mark.asyncio
    async def test_event_includes_required_fields(self):
        """Every event includes sandboxJobId, tenantId, userId, featureType, profileSlug."""
        with tempfile.TemporaryDirectory() as tmpdir:
            service = SandboxAuditService(audit_log_dir=tmpdir)
            service.emit(
                event_type="sandbox_job_accepted",
                sandbox_job_id="job-456",
                tenant_id="tenant-2",
                user_id=99,
                feature_type="skill",
                profile_slug="code-default",
                timing_data={"totalMs": 1234},
                cost_data={"cpuSeconds": 10, "estimatedUsd": 0.05},
            )

            log_files = os.listdir(tmpdir)
            with open(os.path.join(tmpdir, log_files[0])) as f:
                event = json.loads(f.readline())

            assert event["sandboxJobId"] == "job-456"
            assert event["tenantId"] == "tenant-2"
            assert event["userId"] == 99
            assert event["featureType"] == "skill"
            assert event["profileSlug"] == "code-default"
            assert event["timing"]["totalMs"] == 1234
            assert event["cost"]["cpuSeconds"] == 10
            assert "timestamp" in event

    @pytest.mark.asyncio
    async def test_events_written_to_jsonl_audit_log(self):
        """Audit events are appended to the daily JSONL audit log file."""
        with tempfile.TemporaryDirectory() as tmpdir:
            service = SandboxAuditService(audit_log_dir=tmpdir)

            service.emit(
                event_type="sandbox_created",
                sandbox_job_id="job-789",
                tenant_id="tenant-3",
                user_id=1,
                feature_type="media",
                profile_slug="media-processing",
            )
            service.emit(
                event_type="sandbox_completed",
                sandbox_job_id="job-789",
                tenant_id="tenant-3",
                user_id=1,
                feature_type="media",
                profile_slug="media-processing",
            )

            log_files = os.listdir(tmpdir)
            with open(os.path.join(tmpdir, log_files[0])) as f:
                lines = f.readlines()
                assert len(lines) == 2
                # Each line is valid JSON
                for line in lines:
                    json.loads(line)
