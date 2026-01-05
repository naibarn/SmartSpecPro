"""
SmartSpec Pro - Orchestrator Models
Phase 0.3 - LangGraph Integration
"""

from typing import Any, Dict, List, Optional, Literal
from pydantic import BaseModel, Field
from datetime import datetime
from enum import Enum


class ExecutionStatus(str, Enum):
    """Execution status"""
    PENDING = "pending"
    RUNNING = "running"
    COMPLETED = "completed"
    FAILED = "failed"
    PAUSED = "paused"
    CANCELLED = "cancelled"


class WorkflowStep(BaseModel):
    """A single step in workflow execution"""
    id: str
    name: str
    description: str
    status: ExecutionStatus = ExecutionStatus.PENDING
    started_at: Optional[datetime] = None
    completed_at: Optional[datetime] = None
    duration_seconds: Optional[float] = None
    output: Optional[Dict[str, Any]] = None
    error: Optional[str] = None
    llm_provider: Optional[str] = None
    llm_model: Optional[str] = None
    llm_cost: Optional[float] = None
    tokens_used: Optional[int] = None


class ExecutionState(BaseModel):
    """State of workflow execution"""
    execution_id: str
    workflow_id: str
    status: ExecutionStatus
    created_at: datetime
    updated_at: datetime
    started_at: Optional[datetime] = None
    completed_at: Optional[datetime] = None
    
    # Workflow data
    user_prompt: str
    goal: str
    project_path: Optional[str] = None
    
    # Execution progress
    current_step_id: Optional[str] = None
    steps: List[WorkflowStep] = Field(default_factory=list)
    completed_steps: int = 0
    total_steps: int = 0
    progress_percentage: float = 0.0
    
    # Aggregate data
    aggregate_output: Dict[str, Any] = Field(default_factory=dict)
    files_created: List[str] = Field(default_factory=list)
    files_modified: List[str] = Field(default_factory=list)
    files_deleted: List[str] = Field(default_factory=list)
    
    # Metrics
    total_tokens_used: int = 0
    total_cost: float = 0.0
    total_duration_seconds: float = 0.0
    
    # Checkpoints
    last_checkpoint_id: Optional[str] = None
    checkpoint_count: int = 0
    
    # Error handling
    error: Optional[str] = None
    retry_count: int = 0
    max_retries: int = 3


class CheckpointData(BaseModel):
    """Checkpoint data for resuming execution"""
    checkpoint_id: str
    execution_id: str
    created_at: datetime
    state: ExecutionState
    step_id: str
    step_name: str
    can_resume: bool = True
    metadata: Dict[str, Any] = Field(default_factory=dict)


class ParallelExecution(BaseModel):
    """Configuration for parallel execution"""
    enabled: bool = True
    max_parallel: int = 5
    steps: List[str] = Field(default_factory=list)


class ValidationRule(BaseModel):
    """Validation rule for workflow execution"""
    rule_id: str
    name: str
    description: str
    rule_type: Literal["required_file", "required_output", "quality_check", "custom"]
    parameters: Dict[str, Any] = Field(default_factory=dict)
    severity: Literal["error", "warning", "info"] = "error"


class ValidationResult(BaseModel):
    """Result of validation"""
    passed: bool
    rule_id: str
    rule_name: str
    severity: str
    message: str
    details: Optional[Dict[str, Any]] = None


class WorkflowReport(BaseModel):
    """Complete workflow execution report"""
    execution_id: str
    workflow_id: str
    status: ExecutionStatus
    created_at: datetime
    completed_at: Optional[datetime] = None
    duration_seconds: float
    
    # Summary
    summary: str
    description: str
    
    # Steps
    steps: List[WorkflowStep]
    completed_steps: int
    failed_steps: int
    
    # Outputs
    files_created: List[str]
    files_modified: List[str]
    files_deleted: List[str]
    aggregate_output: Dict[str, Any]
    
    # Metrics
    total_tokens_used: int
    total_cost: float
    llm_usage_by_provider: Dict[str, Dict[str, Any]]
    
    # Validation
    validation_results: List[ValidationResult] = Field(default_factory=list)
    validation_passed: bool = True
    
    # Next steps
    suggested_next_workflows: List[Dict[str, Any]] = Field(default_factory=list)
    
    # Issues
    issues: List[Dict[str, Any]] = Field(default_factory=list)


class OrchestratorConfig(BaseModel):
    """Configuration for orchestrator"""
    max_parallel_workflows: int = 5
    checkpoint_interval_steps: int = 1  # Checkpoint after every step
    enable_auto_retry: bool = True
    max_retries: int = 3
    enable_validation: bool = True
    enable_parallel_execution: bool = True
    checkpoint_dir: str = "./data/checkpoints"
    state_dir: str = "./data/state"
