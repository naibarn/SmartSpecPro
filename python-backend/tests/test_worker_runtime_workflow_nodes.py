"""Tests for additive worker-runtime workflow node registration."""


def test_worker_runtime_nodes_registered_in_registry():
    from app.orchestrator.node_registry import NodeRegistry

    registry = NodeRegistry.get_instance()
    expected_types = {
        "dispatch_worker_job",
        "wait_for_worker_completion",
        "publish_worker_artifacts",
        "trigger_worker_rag_index",
    }

    for node_type in expected_types:
        spec = registry.get_node_type(node_type)
        assert spec is not None
        assert spec.type == node_type
        assert spec.executor == "app.orchestrator.node_executors.worker_runtime_executor.WorkerRuntimeExecutor"


def test_dispatch_worker_job_contract_matches_expected_fields():
    from app.orchestrator.node_registry import NodeRegistry

    registry = NodeRegistry.get_instance()
    spec = registry.get_node_type("dispatch_worker_job")
    assert spec is not None

    input_names = [item.name for item in spec.inputs]
    assert input_names == [
        "jobType",
        "runtimeType",
        "jobRequest",
        "inputJson",
        "instructionsJson",
        "capabilityFamilies",
        "preferredWorkerId",
        "timeoutSeconds",
        "idempotencyKey",
    ]

    output_names = [item.name for item in spec.outputs]
    assert output_names == [
        "workerJobId",
        "status",
        "runtimeType",
        "jobType",
        "created",
        "workerJob",
        "queueMetadata",
        "error",
    ]


def test_wait_for_worker_completion_exposes_terminal_contract():
    from app.orchestrator.node_registry import NodeRegistry

    registry = NodeRegistry.get_instance()
    spec = registry.get_node_type("wait_for_worker_completion")
    assert spec is not None

    output_names = [item.name for item in spec.outputs]
    assert output_names == [
        "workerJobId",
        "terminalStatus",
        "completed",
        "failed",
        "timedOut",
        "failureSummary",
        "workerJob",
        "artifactRefs",
        "publishedArtifacts",
        "error",
    ]
