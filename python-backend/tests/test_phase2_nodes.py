"""Tests for Phase 2 workflow nodes."""
import pytest

from app.orchestrator.node_registry import NodeRegistry


class TestPhase2Nodes:
    """Test Phase 2 node registrations."""

    def test_manual_trigger_registered(self):
        """Test manual trigger node is registered."""
        registry = NodeRegistry.get_instance()
        node_type = registry.get_node_type("manual_trigger")

        assert node_type is not None
        assert node_type.display_name == "Manual Trigger"
        assert node_type.category == "triggers"
        assert len(node_type.inputs) == 0
        assert len(node_type.outputs) == 3
        assert node_type.outputs[0].name == "userId"
        assert node_type.outputs[1].name == "timestamp"
        assert node_type.outputs[2].name == "params"

    def test_form_input_registered(self):
        """Test form input node is registered."""
        registry = NodeRegistry.get_instance()
        node_type = registry.get_node_type("form_input")

        assert node_type is not None
        assert node_type.display_name == "Form Input"
        assert node_type.category == "inputs"
        assert len(node_type.inputs) == 1
        assert len(node_type.outputs) == 1
        assert node_type.inputs[0].name == "fields"
        assert node_type.outputs[0].name == "values"

    def test_workflow_response_registered(self):
        """Test workflow response node is registered."""
        registry = NodeRegistry.get_instance()
        node_type = registry.get_node_type("workflow_response")

        assert node_type is not None
        assert node_type.display_name == "Workflow Response"
        assert node_type.category == "outputs"
        assert len(node_type.inputs) == 2
        assert len(node_type.outputs) == 0
        assert node_type.inputs[0].name == "data"
        assert node_type.inputs[1].name == "status"

    def test_set_variable_registered(self):
        """Test set variable node is registered."""
        registry = NodeRegistry.get_instance()
        node_type = registry.get_node_type("set_variable")

        assert node_type is not None
        assert node_type.display_name == "Set Variable"
        assert node_type.category == "data"
        assert len(node_type.inputs) == 2
        assert len(node_type.outputs) == 1
        assert node_type.inputs[0].name == "variableName"
        assert node_type.inputs[1].name == "value"
        assert node_type.outputs[0].name == "value"

    def test_merge_data_registered(self):
        """Test merge data node is registered."""
        registry = NodeRegistry.get_instance()
        node_type = registry.get_node_type("merge_data")

        assert node_type is not None
        assert node_type.display_name == "Merge Data"
        assert node_type.category == "data"
        assert len(node_type.inputs) == 2
        assert len(node_type.outputs) == 1
        assert node_type.inputs[0].name == "sources"
        assert node_type.inputs[1].name == "strategy"
        assert node_type.outputs[0].name == "merged"

    def test_code_runner_registered(self):
        """Test code runner node is registered."""
        registry = NodeRegistry.get_instance()
        node_type = registry.get_node_type("code_runner")

        assert node_type is not None
        assert node_type.display_name == "Code Runner"
        assert node_type.category == "data"
        assert len(node_type.inputs) == 3
        assert len(node_type.outputs) == 2
        assert node_type.inputs[0].name == "code"
        assert node_type.inputs[1].name == "input"
        assert node_type.inputs[2].name == "timeout"
        assert node_type.outputs[0].name == "result"
        assert node_type.outputs[1].name == "stdout"

    def test_all_phase2_nodes_in_registry(self):
        """Test all Phase 2.1 and 2.2 nodes are in registry."""
        registry = NodeRegistry.get_instance()
        all_types = registry.get_all_node_types()
        type_names = [nt.type for nt in all_types]

        # Phase 2.1 nodes
        assert "manual_trigger" in type_names
        assert "form_input" in type_names
        assert "workflow_response" in type_names

        # Phase 2.2 nodes
        assert "set_variable" in type_names
        assert "merge_data" in type_names
        assert "code_runner" in type_names

    def test_node_categories(self):
        """Test that nodes have correct categories."""
        registry = NodeRegistry.get_instance()
        all_types = registry.get_all_node_types()

        categories_found = {nt.category for nt in all_types}

        # Should have new categories from Phase 2
        assert "triggers" in categories_found
        assert "inputs" in categories_found
        assert "outputs" in categories_found
        assert "data" in categories_found
