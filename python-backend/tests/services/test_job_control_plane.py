from unittest.mock import Mock

from app.services.job_control_plane import JobControlPlaneClient, LeaseContext


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
