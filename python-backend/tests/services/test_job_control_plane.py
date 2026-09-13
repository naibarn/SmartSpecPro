from unittest.mock import Mock

import httpx
import pytest

from app.services.job_control_plane import JobControlPlaneClient, JobControlPlaneError, LeaseContext


def test_python_port_sends_only_canonical_identity_and_fence():
    client = Mock()
    client.post.return_value.json.return_value = {
        "lease": {
            "jobId": "job-1",
            "attemptId": "attempt-1",
            "leaseToken": "secret-token",
            "fencingVersion": 3,
            "expiresAt": "2026-09-12T00:00:00Z",
        }
    }
    client.post.return_value.raise_for_status.return_value = None
    control = JobControlPlaneClient(base_url="http://control-plane", client=client)

    lease = control.claim("job-1", "runner-1", "celery")
    assert lease == LeaseContext("job-1", "attempt-1", "secret-token", 3, "2026-09-12T00:00:00Z")
    assert client.post.call_args.kwargs["json"] == {"jobId": "job-1", "runnerId": "runner-1", "adapter": "celery"}


def test_python_port_loads_server_owned_executor_context():
    client = Mock()
    client.post.return_value.json.return_value = {
        "context": {"jobId": "job-1", "jobType": "media_render", "executionClass": "cpu"}
    }
    client.post.return_value.raise_for_status.return_value = None
    control = JobControlPlaneClient(base_url="http://control-plane", client=client)

    assert control.context("job-1")["jobType"] == "media_render"
    assert client.post.call_args.kwargs["json"] == {"jobId": "job-1"}


def test_python_port_maps_control_plane_domain_errors_to_stable_codes():
    client = Mock()
    response = httpx.Response(409, json={"error": "JOB_LEASE_STALE"}, request=httpx.Request("POST", "http://control-plane/heartbeat"))
    client.post.side_effect = httpx.HTTPStatusError("conflict", request=response.request, response=response)
    control = JobControlPlaneClient(base_url="http://control-plane", client=client)

    with pytest.raises(JobControlPlaneError) as error:
        control.heartbeat(LeaseContext("job-1", "attempt-1", "token", 2, ""))
    assert error.value.code == "JOB_LEASE_STALE"


def test_python_port_assert_active_uses_read_only_lease_action():
    client = Mock()
    client.post.return_value.json.return_value = {"ok": True}
    client.post.return_value.raise_for_status.return_value = None
    control = JobControlPlaneClient(base_url="http://control-plane", client=client)
    lease = LeaseContext("job-1", "attempt-1", "token", 2, "")

    control.assert_active(lease)

    assert client.post.call_args.args == ("http://control-plane/assert-active",)
    assert client.post.call_args.kwargs["json"] == {
        "jobId": "job-1",
        "attemptId": "attempt-1",
        "leaseToken": "token",
        "fencingVersion": 2,
    }
