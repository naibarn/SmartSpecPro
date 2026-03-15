"""Tests for additive Browser Session workflow node registration."""


def test_browser_session_nodes_registered_in_registry():
    from app.orchestrator.node_registry import NodeRegistry

    registry = NodeRegistry.get_instance()
    expected_types = {
        "browser_session_start",
        "browser_session_instruction",
        "browser_session_wait_for_user",
        "browser_session_review_gate",
    }

    for node_type in expected_types:
        spec = registry.get_node_type(node_type)
        assert spec is not None
        assert spec.type == node_type
        assert spec.executor == "app.orchestrator.node_executors.browser_session_executor.BrowserSessionExecutor"


def test_browser_session_start_contract_matches_expected_fields():
    from app.orchestrator.node_registry import NodeRegistry

    registry = NodeRegistry.get_instance()
    spec = registry.get_node_type("browser_session_start")
    assert spec is not None

    input_names = [item.name for item in spec.inputs]
    assert input_names == ["goal", "startUrl", "launchContext"]

    output_names = [item.name for item in spec.outputs]
    assert output_names == [
        "browserSessionId",
        "sessionStatus",
        "browserSessionSummary",
        "browserSessionArtifact",
        "reviewState",
        "pendingUserStep",
        "outcome",
    ]


def test_legacy_web_automation_registration_is_preserved():
    from app.orchestrator.node_registry import NodeRegistry

    registry = NodeRegistry.get_instance()
    spec = registry.get_node_type("web_automation")

    assert spec is not None
    assert spec.type == "web_automation"
    assert spec.executor == "app.orchestrator.node_executors.web_automation_executor.WebAutomationExecutor"
