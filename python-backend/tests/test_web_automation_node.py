"""Tests for the web_automation workflow node registration."""

import pytest


class TestWebAutomationNode:
    def test_node_registered_in_registry(self):
        from app.orchestrator.node_registry import NodeRegistry

        registry = NodeRegistry.get_instance()
        spec = registry.get_node_type("web_automation")
        assert spec is not None
        assert spec.type == "web_automation"
        assert spec.category == "integrations"

        input_names = [i.name for i in spec.inputs]
        assert "prompt" in input_names
        assert "url" in input_names
        assert "goal" in input_names
        assert "vision_model" in input_names

        output_names = [o.name for o in spec.outputs]
        assert "extracted_data" in output_names

    def test_node_has_correct_executor_path(self):
        from app.orchestrator.node_registry import NodeRegistry

        registry = NodeRegistry.get_instance()
        spec = registry.get_node_type("web_automation")
        assert spec is not None
        assert spec.executor == "app.orchestrator.node_executors.web_automation_executor.WebAutomationExecutor"

    def test_executor_returns_dict(self):
        from app.orchestrator.node_executors.web_automation_executor import WebAutomationExecutor

        executor = WebAutomationExecutor()
        import asyncio
        result = asyncio.get_event_loop().run_until_complete(
            executor.execute({"prompt": "test"}, {"tenant_id": "t1"})
        )
        assert isinstance(result, dict)
        assert "status" in result
