"""Integration tests for workflow to skill conversion."""

import pytest
from app.conversion.analyzer import ConversionAnalyzer, CompatibilityLevel
from app.conversion.adapter_registry import AdapterRegistry


@pytest.fixture
def compatible_workflow():
    """Create a workflow that is fully compatible."""
    return {
        "id": 1,
        "nodes": [
            {"id": "1", "type": "llm_call", "config": {}},
            {"id": "2", "type": "rag_query", "config": {}},
        ],
        "edges": [
            {"source": "1", "target": "2"}
        ]
    }


@pytest.fixture
def workflow_with_adapters():
    """Create a workflow that requires adapters."""
    return {
        "id": 2,
        "nodes": [
            {"id": "1", "type": "form_input", "config": {"fields": [{"id": "name", "label": "Name"}]}},
            {"id": "2", "type": "llm_call", "config": {}},
        ],
        "edges": [
            {"source": "1", "target": "2"}
        ]
    }


@pytest.fixture
def incompatible_workflow():
    """Create a workflow that is not compatible."""
    return {
        "id": 3,
        "nodes": [
            {"id": "1", "type": "webhook_trigger", "config": {}},
            {"id": "2", "type": "llm_call", "config": {}},
        ],
        "edges": [
            {"source": "1", "target": "2"}
        ]
    }


class TestConversionAnalyzer:
    """Tests for the conversion analyzer."""

    def test_fully_compatible_workflow(self, compatible_workflow):
        """Test analysis of fully compatible workflow."""
        analyzer = ConversionAnalyzer()
        analysis = analyzer.analyze(compatible_workflow)
        
        assert analysis.eligible is True
        assert analysis.compatibility_score == 100
        assert analysis.level == CompatibilityLevel.FULLY_COMPATIBLE
        assert len(analysis.unsupported_nodes) == 0
        assert len(analysis.adapters_required) == 0
    
    def test_workflow_requiring_adapters(self, workflow_with_adapters):
        """Test analysis of workflow requiring adapters."""
        analyzer = ConversionAnalyzer()
        analysis = analyzer.analyze(workflow_with_adapters)
        
        assert analysis.eligible is True
        assert analysis.compatibility_score == 90  # 100 - 10 for adapter
        assert analysis.level == CompatibilityLevel.ADAPTER_REQUIRED
        assert len(analysis.unsupported_nodes) == 0
        assert len(analysis.adapters_required) == 1
        assert analysis.adapters_required[0].adapter_required == "conversational_input"
    
    def test_incompatible_workflow(self, incompatible_workflow):
        """Test analysis of incompatible workflow."""
        analyzer = ConversionAnalyzer()
        analysis = analyzer.analyze(incompatible_workflow)
        
        assert analysis.eligible is False
        assert analysis.compatibility_score == 80  # 100 - 20 for unsupported
        assert analysis.level == CompatibilityLevel.NOT_COMPATIBLE
        assert len(analysis.unsupported_nodes) == 1
        assert analysis.unsupported_nodes[0].node_type == "webhook_trigger"
    
    def test_parallel_node_penalty(self, compatible_workflow):
        """Test penalty for parallel nodes."""
        analyzer = ConversionAnalyzer()
        
        # Add parallel node
        workflow = compatible_workflow.copy()
        workflow["nodes"] = [
            {"id": "1", "type": "parallel", "config": {}},
            {"id": "2", "type": "llm_call", "config": {}},
        ]
        
        analysis = analyzer.analyze(workflow)
        
        # Should have penalty for parallel node (unsupported) + parallel branches
        assert analysis.compatibility_score == 70  # 100 - 20 (unsupported) - 10 (parallel)
    
    def test_complexity_calculation(self, compatible_workflow):
        """Test complexity score calculation."""
        analyzer = ConversionAnalyzer()
        analysis = analyzer.analyze(compatible_workflow)
        
        # 2 nodes (4 points) + 1 edge (1 point) = 5 points
        assert analysis.complexity_score == 5
    
    def test_recommendations_for_unsupported(self, incompatible_workflow):
        """Test recommendations for unsupported nodes."""
        analyzer = ConversionAnalyzer()
        analysis = analyzer.analyze(incompatible_workflow)
        
        assert len(analysis.recommendations) > 0
        assert "unsupported" in analysis.recommendations[0].lower()
    
    def test_recommendations_for_adapters(self, workflow_with_adapters):
        """Test recommendations for adapters."""
        analyzer = ConversionAnalyzer()
        analysis = analyzer.analyze(workflow_with_adapters)
        
        assert len(analysis.recommendations) > 0
        assert "adapters" in analysis.recommendations[0].lower()


class TestNodeAdapters:
    """Tests for node adapters."""

    def test_form_input_adapter(self):
        """Test form input to conversational adapter."""
        node = {
            "id": "1",
            "type": "form_input",
            "config": {
                "fields": [
                    {"id": "name", "label": "Full Name", "type": "text", "required": True},
                    {"id": "email", "label": "Email Address", "type": "email", "required": True},
                ]
            }
        }
        
        adapted = AdapterRegistry.adapt_node(node)
        
        assert adapted["type"] == "conversational_input"
        assert adapted["original_type"] == "form_input"
        assert len(adapted["config"]["fields"]) == 2
        assert adapted["config"]["collection_strategy"] == "sequential"
    
    def test_approval_gate_adapter(self):
        """Test approval gate to chat approval adapter."""
        node = {
            "id": "2",
            "type": "approval_gate",
            "config": {
                "message": "Please approve this request",
                "timeout": 3600,
                "escalate_on_timeout": True,
                "escalate_to": "manager@example.com"
            }
        }
        
        adapted = AdapterRegistry.adapt_node(node)
        
        assert adapted["type"] == "chat_approval"
        assert adapted["original_type"] == "approval_gate"
        assert adapted["config"]["timeout_seconds"] == 3600
        assert adapted["config"]["escalation"]["enabled"] is True
    
    def test_file_upload_adapter(self):
        """Test file upload to file attachment adapter."""
        node = {
            "id": "3",
            "type": "file_upload",
            "config": {
                "prompt": "Upload your document",
                "accepted_types": [".pdf", ".doc"],
                "max_size_mb": 10,
                "multiple": False
            }
        }
        
        adapted = AdapterRegistry.adapt_node(node)
        
        assert adapted["type"] == "file_attachment"
        assert adapted["original_type"] == "file_upload"
        assert adapted["config"]["max_size_mb"] == 10
    
    def test_no_adapter_for_compatible_node(self):
        """Test that compatible nodes are not modified."""
        node = {
            "id": "4",
            "type": "llm_call",
            "config": {"model": "gpt-4"}
        }
        
        adapted = AdapterRegistry.adapt_node(node)
        
        # Should remain unchanged
        assert adapted["type"] == "llm_call"
        assert adapted["config"]["model"] == "gpt-4"
    
    def test_adapter_registry_get_adapter(self):
        """Test getting adapter from registry."""
        from app.conversion.adapters.form_input_adapter import FormInputAdapter
        
        adapter = AdapterRegistry.get_adapter("form_input")
        assert adapter is not None
        assert isinstance(adapter, FormInputAdapter)
        
        # Unknown type
        adapter = AdapterRegistry.get_adapter("unknown_type")
        assert adapter is None
