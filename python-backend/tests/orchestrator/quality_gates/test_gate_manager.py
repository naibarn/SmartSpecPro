"""
Tests for Quality Gate Manager
Phase 2: Quality & Intelligence
"""

import pytest
from datetime import datetime
from unittest.mock import AsyncMock, MagicMock, patch

from app.orchestrator.quality_gates.gate_manager import (
    QualityGateManager,
    GateResult,
    GateStatus,
    GateType,
    GateConfig,
    ValidationIssue,
    ValidatorType,
    BaseValidator,
)


class TestGateResult:
    """Tests for GateResult dataclass."""
    
    def test_gate_result_creation(self):
        """Test creating a GateResult."""
        result = GateResult(
            gate_type=GateType.PRE_EXECUTION,
            status=GateStatus.PASSED,
        )
        
        assert result.gate_type == GateType.PRE_EXECUTION
        assert result.status == GateStatus.PASSED
        assert result.passed_checks == 0
        assert result.failed_checks == 0
    
    def test_gate_result_add_issue(self):
        """Test adding issues to GateResult."""
        result = GateResult()
        
        # Add error
        result.add_issue(ValidationIssue(
            severity="error",
            category="test",
            message="Test error",
        ))
        
        assert result.failed_checks == 1
        assert result.error_count == 1
        
        # Add warning
        result.add_issue(ValidationIssue(
            severity="warning",
            category="test",
            message="Test warning",
        ))
        
        assert result.warning_checks == 1
        assert result.warning_count == 1
    
    def test_gate_result_pass_rate(self):
        """Test pass rate calculation."""
        result = GateResult(
            passed_checks=8,
            failed_checks=2,
        )
        
        assert result.total_checks == 10
        assert result.pass_rate == 80.0
    
    def test_gate_result_duration(self):
        """Test duration calculation."""
        result = GateResult()
        result.started_at = datetime(2024, 1, 1, 12, 0, 0)
        result.completed_at = datetime(2024, 1, 1, 12, 0, 1)
        
        assert result.duration_ms == 1000
    
    def test_gate_result_to_dict(self):
        """Test serialization to dict."""
        result = GateResult(
            gate_type=GateType.CI_BUILD,
            status=GateStatus.PASSED,
            passed_checks=5,
        )
        
        data = result.to_dict()
        
        assert data["gate_type"] == "ci_build"
        assert data["status"] == "passed"
        assert data["passed_checks"] == 5


class TestGateConfig:
    """Tests for GateConfig dataclass."""
    
    def test_gate_config_defaults(self):
        """Test default configuration."""
        config = GateConfig(gate_type=GateType.PRE_EXECUTION)
        
        assert config.enabled is True
        assert config.blocking is True
        assert config.min_coverage == 60.0
        assert config.max_complexity == 15
    
    def test_gate_config_custom(self):
        """Test custom configuration."""
        config = GateConfig(
            gate_type=GateType.PRE_RELEASE,
            enabled=True,
            blocking=True,
            validators=[ValidatorType.CODE_QUALITY, ValidatorType.SECURITY],
            thresholds={"min_coverage": 90},
        )
        
        assert len(config.validators) == 2
        assert config.thresholds["min_coverage"] == 90


class TestValidationIssue:
    """Tests for ValidationIssue dataclass."""
    
    def test_validation_issue_creation(self):
        """Test creating a ValidationIssue."""
        issue = ValidationIssue(
            severity="error",
            category="security",
            message="SQL injection detected",
            file="app/api.py",
            line=42,
            rule="S001",
            suggestion="Use parameterized queries",
        )
        
        assert issue.severity == "error"
        assert issue.category == "security"
        assert issue.file == "app/api.py"
        assert issue.line == 42
    
    def test_validation_issue_to_dict(self):
        """Test serialization to dict."""
        issue = ValidationIssue(
            severity="warning",
            category="style",
            message="Line too long",
        )
        
        data = issue.to_dict()
        
        assert data["severity"] == "warning"
        assert data["category"] == "style"
        assert "issue_id" in data


class MockValidator(BaseValidator):
    """Mock validator for testing."""
    
    validator_type = ValidatorType.CODE_QUALITY
    
    def __init__(self, issues: list = None, metrics: dict = None):
        self._issues = issues or []
        self._metrics = metrics or {}
    
    async def validate(self, context, config):
        return self._issues
    
    async def get_metrics(self, context):
        return self._metrics


class TestQualityGateManager:
    """Tests for QualityGateManager."""
    
    @pytest.fixture
    def manager(self):
        """Create a QualityGateManager instance."""
        return QualityGateManager()
    
    def test_initialization(self, manager):
        """Test manager initialization."""
        assert manager is not None
        assert len(manager._gate_configs) > 0
    
    def test_register_validator(self, manager):
        """Test registering a validator."""
        validator = MockValidator()
        manager.register_validator(validator)
        
        assert ValidatorType.CODE_QUALITY in manager._validators
    
    def test_configure_gate(self, manager):
        """Test configuring a gate."""
        config = GateConfig(
            gate_type=GateType.PRE_EXECUTION,
            enabled=True,
            blocking=False,
            thresholds={"min_coverage": 50},
        )
        
        manager.configure_gate(config)
        
        assert manager._gate_configs[GateType.PRE_EXECUTION].blocking is False
    
    @pytest.mark.asyncio
    async def test_run_gate_disabled(self, manager):
        """Test running a disabled gate."""
        config = GateConfig(
            gate_type=GateType.PRE_EXECUTION,
            enabled=False,
        )
        manager.configure_gate(config)
        
        result = await manager.run_gate(GateType.PRE_EXECUTION, {})
        
        assert result.status == GateStatus.SKIPPED
    
    @pytest.mark.asyncio
    async def test_run_gate_with_validator(self, manager):
        """Test running a gate with a validator."""
        # Register validator that returns no issues
        validator = MockValidator(
            issues=[],
            metrics={"coverage": 80},
        )
        manager.register_validator(validator)
        
        # Configure gate
        config = GateConfig(
            gate_type=GateType.POST_EXECUTION,
            validators=[ValidatorType.CODE_QUALITY],
            thresholds={},
        )
        manager.configure_gate(config)
        
        result = await manager.run_gate(GateType.POST_EXECUTION, {})
        
        assert result.status == GateStatus.PASSED
        assert result.passed_checks == 1
    
    @pytest.mark.asyncio
    async def test_run_gate_with_errors(self, manager):
        """Test running a gate that finds errors."""
        # Register validator that returns errors
        validator = MockValidator(
            issues=[
                ValidationIssue(severity="error", category="test", message="Error 1"),
                ValidationIssue(severity="error", category="test", message="Error 2"),
            ],
        )
        manager.register_validator(validator)
        
        config = GateConfig(
            gate_type=GateType.CI_BUILD,
            validators=[ValidatorType.CODE_QUALITY],
        )
        manager.configure_gate(config)
        
        result = await manager.run_gate(GateType.CI_BUILD, {})
        
        assert result.status == GateStatus.FAILED
        assert result.error_count == 2
    
    @pytest.mark.asyncio
    async def test_run_gate_threshold_check(self, manager):
        """Test threshold checking in gates."""
        validator = MockValidator(
            issues=[],
            metrics={"coverage": 50},  # Below threshold
        )
        manager.register_validator(validator)
        
        config = GateConfig(
            gate_type=GateType.PRE_RELEASE,
            validators=[ValidatorType.CODE_QUALITY],
            thresholds={"min_coverage": 80},
        )
        manager.configure_gate(config)
        
        result = await manager.run_gate(GateType.PRE_RELEASE, {})
        
        assert result.status == GateStatus.FAILED
    
    def test_should_block(self, manager):
        """Test blocking gate detection."""
        results = {
            GateType.PRE_EXECUTION: GateResult(
                gate_type=GateType.PRE_EXECUTION,
                status=GateStatus.PASSED,
            ),
            GateType.POST_EXECUTION: GateResult(
                gate_type=GateType.POST_EXECUTION,
                status=GateStatus.FAILED,
            ),
        }
        
        # POST_EXECUTION is blocking by default
        assert manager.should_block(results) is True
    
    def test_get_summary(self, manager):
        """Test getting summary."""
        # Add some results to history
        manager._results_history = [
            GateResult(gate_type=GateType.PRE_EXECUTION, status=GateStatus.PASSED),
            GateResult(gate_type=GateType.PRE_EXECUTION, status=GateStatus.PASSED),
            GateResult(gate_type=GateType.POST_EXECUTION, status=GateStatus.FAILED),
        ]
        
        summary = manager.get_summary()
        
        assert summary["total_runs"] == 3
        assert summary["by_status"]["passed"] == 2
        assert summary["by_status"]["failed"] == 1
