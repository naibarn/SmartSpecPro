"""
Unit Tests for Orchestrator Models
Tests Pydantic models for workflow orchestration
"""

import pytest
from datetime import datetime
from pydantic import ValidationError

from app.orchestrator.models import (
    ExecutionStatus,
    WorkflowStep,
    ExecutionState,
    CheckpointData,
    ParallelExecution,
    ValidationRule,
    ValidationResult,
    WorkflowReport,
    OrchestratorConfig
)


class TestExecutionStatus:
    """Test ExecutionStatus enum"""
    
    def test_status_values(self):
        """Test all status values exist"""
        assert ExecutionStatus.PENDING == "pending"
        assert ExecutionStatus.RUNNING == "running"
        assert ExecutionStatus.COMPLETED == "completed"
        assert ExecutionStatus.FAILED == "failed"
        assert ExecutionStatus.PAUSED == "paused"
        assert ExecutionStatus.CANCELLED == "cancelled"
    
    def test_status_is_string_enum(self):
        """Test ExecutionStatus is a string enum"""
        assert isinstance(ExecutionStatus.PENDING, str)
        assert ExecutionStatus.PENDING.value == "pending"


class TestWorkflowStep:
    """Test WorkflowStep model"""
    
    def test_workflow_step_creation(self):
        """Test creating a WorkflowStep"""
        step = WorkflowStep(
            id="step_1",
            name="Test Step",
            description="A test step"
        )
        
        assert step.id == "step_1"
        assert step.name == "Test Step"
        assert step.status == ExecutionStatus.PENDING
    
    def test_workflow_step_with_all_fields(self):
        """Test WorkflowStep with all fields"""
        now = datetime.utcnow()
        step = WorkflowStep(
            id="step_1",
            name="Test Step",
            description="A test step",
            status=ExecutionStatus.COMPLETED,
            started_at=now,
            completed_at=now,
            duration_seconds=5.5,
            output={"result": "success"},
            llm_provider="openai",
            llm_model="gpt-4",
            llm_cost=0.05,
            tokens_used=1000
        )
        
        assert step.status == ExecutionStatus.COMPLETED
        assert step.duration_seconds == 5.5
        assert step.tokens_used == 1000
    
    def test_workflow_step_with_error(self):
        """Test WorkflowStep with error"""
        step = WorkflowStep(
            id="step_1",
            name="Failed Step",
            description="A failed step",
            status=ExecutionStatus.FAILED,
            error="Something went wrong"
        )
        
        assert step.status == ExecutionStatus.FAILED
        assert step.error == "Something went wrong"


class TestExecutionState:
    """Test ExecutionState model"""
    
    def test_execution_state_creation(self):
        """Test creating an ExecutionState"""
        now = datetime.utcnow()
        state = ExecutionState(
            execution_id="exec_123",
            workflow_id="wf_456",
            status=ExecutionStatus.RUNNING,
            created_at=now,
            updated_at=now,
            user_prompt="Generate a spec",
            goal="Create software specification"
        )
        
        assert state.execution_id == "exec_123"
        assert state.workflow_id == "wf_456"
        assert state.status == ExecutionStatus.RUNNING
    
    def test_execution_state_defaults(self):
        """Test ExecutionState default values"""
        now = datetime.utcnow()
        state = ExecutionState(
            execution_id="exec_123",
            workflow_id="wf_456",
            status=ExecutionStatus.PENDING,
            created_at=now,
            updated_at=now,
            user_prompt="Test",
            goal="Test goal"
        )
        
        assert state.completed_steps == 0
        assert state.total_steps == 0
        assert state.progress_percentage == 0.0
        assert state.total_tokens_used == 0
        assert state.total_cost == 0.0
        assert state.retry_count == 0
        assert state.max_retries == 3
    
    def test_execution_state_with_steps(self):
        """Test ExecutionState with steps"""
        now = datetime.utcnow()
        steps = [
            WorkflowStep(id="s1", name="Step 1", description="First step"),
            WorkflowStep(id="s2", name="Step 2", description="Second step")
        ]
        
        state = ExecutionState(
            execution_id="exec_123",
            workflow_id="wf_456",
            status=ExecutionStatus.RUNNING,
            created_at=now,
            updated_at=now,
            user_prompt="Test",
            goal="Test goal",
            steps=steps,
            total_steps=2
        )
        
        assert len(state.steps) == 2
        assert state.total_steps == 2


class TestCheckpointData:
    """Test CheckpointData model"""
    
    def test_checkpoint_creation(self):
        """Test creating a CheckpointData"""
        now = datetime.utcnow()
        state = ExecutionState(
            execution_id="exec_123",
            workflow_id="wf_456",
            status=ExecutionStatus.PAUSED,
            created_at=now,
            updated_at=now,
            user_prompt="Test",
            goal="Test goal"
        )
        
        checkpoint = CheckpointData(
            checkpoint_id="cp_789",
            execution_id="exec_123",
            created_at=now,
            state=state,
            step_id="step_1",
            step_name="Test Step"
        )
        
        assert checkpoint.checkpoint_id == "cp_789"
        assert checkpoint.can_resume is True
    
    def test_checkpoint_with_metadata(self):
        """Test CheckpointData with metadata"""
        now = datetime.utcnow()
        state = ExecutionState(
            execution_id="exec_123",
            workflow_id="wf_456",
            status=ExecutionStatus.PAUSED,
            created_at=now,
            updated_at=now,
            user_prompt="Test",
            goal="Test goal"
        )
        
        checkpoint = CheckpointData(
            checkpoint_id="cp_789",
            execution_id="exec_123",
            created_at=now,
            state=state,
            step_id="step_1",
            step_name="Test Step",
            metadata={"reason": "user_requested"}
        )
        
        assert checkpoint.metadata["reason"] == "user_requested"


class TestParallelExecution:
    """Test ParallelExecution model"""
    
    def test_parallel_execution_defaults(self):
        """Test ParallelExecution default values"""
        config = ParallelExecution()
        
        assert config.enabled is True
        assert config.max_parallel == 5
        assert config.steps == []
    
    def test_parallel_execution_custom(self):
        """Test ParallelExecution with custom values"""
        config = ParallelExecution(
            enabled=True,
            max_parallel=10,
            steps=["step_1", "step_2", "step_3"]
        )
        
        assert config.max_parallel == 10
        assert len(config.steps) == 3


class TestValidationRule:
    """Test ValidationRule model"""
    
    def test_validation_rule_creation(self):
        """Test creating a ValidationRule"""
        rule = ValidationRule(
            rule_id="rule_1",
            name="Required File",
            description="Check if file exists",
            rule_type="required_file"
        )
        
        assert rule.rule_id == "rule_1"
        assert rule.rule_type == "required_file"
        assert rule.severity == "error"
    
    def test_validation_rule_types(self):
        """Test different validation rule types"""
        types = ["required_file", "required_output", "quality_check", "custom"]
        
        for rule_type in types:
            rule = ValidationRule(
                rule_id=f"rule_{rule_type}",
                name=f"Test {rule_type}",
                description="Test rule",
                rule_type=rule_type
            )
            assert rule.rule_type == rule_type
    
    def test_validation_rule_severities(self):
        """Test different severity levels"""
        severities = ["error", "warning", "info"]
        
        for severity in severities:
            rule = ValidationRule(
                rule_id="rule_1",
                name="Test",
                description="Test",
                rule_type="custom",
                severity=severity
            )
            assert rule.severity == severity


class TestValidationResult:
    """Test ValidationResult model"""
    
    def test_validation_result_passed(self):
        """Test passed validation result"""
        result = ValidationResult(
            passed=True,
            rule_id="rule_1",
            rule_name="Test Rule",
            severity="error",
            message="Validation passed"
        )
        
        assert result.passed is True
    
    def test_validation_result_failed(self):
        """Test failed validation result"""
        result = ValidationResult(
            passed=False,
            rule_id="rule_1",
            rule_name="Test Rule",
            severity="error",
            message="File not found",
            details={"expected": "spec.md", "found": None}
        )
        
        assert result.passed is False
        assert result.details is not None


class TestWorkflowReport:
    """Test WorkflowReport model"""
    
    def test_workflow_report_creation(self):
        """Test creating a WorkflowReport"""
        now = datetime.utcnow()
        report = WorkflowReport(
            execution_id="exec_123",
            workflow_id="wf_456",
            status=ExecutionStatus.COMPLETED,
            created_at=now,
            completed_at=now,
            duration_seconds=120.5,
            summary="Workflow completed successfully",
            description="Generated software specification",
            steps=[],
            completed_steps=5,
            failed_steps=0,
            files_created=["spec.md"],
            files_modified=[],
            files_deleted=[],
            aggregate_output={},
            total_tokens_used=5000,
            total_cost=0.25,
            llm_usage_by_provider={"openai": {"tokens": 5000, "cost": 0.25}}
        )
        
        assert report.status == ExecutionStatus.COMPLETED
        assert report.duration_seconds == 120.5
        assert report.validation_passed is True
    
    def test_workflow_report_with_issues(self):
        """Test WorkflowReport with issues"""
        now = datetime.utcnow()
        report = WorkflowReport(
            execution_id="exec_123",
            workflow_id="wf_456",
            status=ExecutionStatus.COMPLETED,
            created_at=now,
            duration_seconds=60.0,
            summary="Completed with warnings",
            description="Test",
            steps=[],
            completed_steps=3,
            failed_steps=1,
            files_created=[],
            files_modified=[],
            files_deleted=[],
            aggregate_output={},
            total_tokens_used=1000,
            total_cost=0.05,
            llm_usage_by_provider={},
            issues=[{"type": "warning", "message": "Step 3 had issues"}]
        )
        
        assert len(report.issues) == 1


class TestOrchestratorConfig:
    """Test OrchestratorConfig model"""
    
    def test_config_defaults(self):
        """Test OrchestratorConfig default values"""
        config = OrchestratorConfig()
        
        assert config.max_parallel_workflows == 5
        assert config.checkpoint_interval_steps == 1
        assert config.enable_auto_retry is True
        assert config.max_retries == 3
        assert config.enable_validation is True
        assert config.enable_parallel_execution is True
    
    def test_config_custom_values(self):
        """Test OrchestratorConfig with custom values"""
        config = OrchestratorConfig(
            max_parallel_workflows=10,
            checkpoint_interval_steps=5,
            enable_auto_retry=False,
            max_retries=5,
            checkpoint_dir="/custom/checkpoints",
            state_dir="/custom/state"
        )
        
        assert config.max_parallel_workflows == 10
        assert config.checkpoint_interval_steps == 5
        assert config.enable_auto_retry is False
        assert config.checkpoint_dir == "/custom/checkpoints"
