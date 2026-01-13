"""
SmartSpec Pro - Quality Gate Manager
Phase 2: Quality & Intelligence

Manages quality gates throughout the workflow lifecycle.
Implements the 6 Quality Gates from the roadmap:
1. Pre-commit Gate
2. PR/MR Gate
3. CI Build Gate
4. Pre-deploy Gate
5. Pre-release Gate
6. Production Gate
"""

import asyncio
from dataclasses import dataclass, field
from datetime import datetime
from enum import Enum
from typing import Any, Dict, List, Optional, Callable, Awaitable
from uuid import uuid4

import structlog

logger = structlog.get_logger()


# ==================== ENUMS ====================

class GateStatus(str, Enum):
    """Status of a quality gate check."""
    PENDING = "pending"
    RUNNING = "running"
    PASSED = "passed"
    FAILED = "failed"
    WARNING = "warning"
    SKIPPED = "skipped"


class GateType(str, Enum):
    """Types of quality gates."""
    PRE_COMMIT = "pre_commit"
    PR_MR = "pr_mr"
    CI_BUILD = "ci_build"
    PRE_DEPLOY = "pre_deploy"
    PRE_RELEASE = "pre_release"
    PRODUCTION = "production"
    
    # Workflow-specific gates
    PRE_EXECUTION = "pre_execution"
    POST_EXECUTION = "post_execution"
    PRE_HANDOFF = "pre_handoff"
    POST_HANDOFF = "post_handoff"


class ValidatorType(str, Enum):
    """Types of validators."""
    CODE_QUALITY = "code_quality"
    TEST_COVERAGE = "test_coverage"
    SECURITY = "security"
    SPEC_COMPLIANCE = "spec_compliance"
    PERFORMANCE = "performance"
    DOCUMENTATION = "documentation"


# ==================== DATA CLASSES ====================

@dataclass
class ValidationIssue:
    """Represents a single validation issue."""
    issue_id: str = field(default_factory=lambda: str(uuid4()))
    severity: str = "warning"  # error, warning, info
    category: str = ""
    message: str = ""
    file: Optional[str] = None
    line: Optional[int] = None
    column: Optional[int] = None
    rule: Optional[str] = None
    suggestion: Optional[str] = None
    
    def to_dict(self) -> Dict[str, Any]:
        return {
            "issue_id": self.issue_id,
            "severity": self.severity,
            "category": self.category,
            "message": self.message,
            "file": self.file,
            "line": self.line,
            "column": self.column,
            "rule": self.rule,
            "suggestion": self.suggestion,
        }


@dataclass
class GateResult:
    """Result of a quality gate check."""
    gate_id: str = field(default_factory=lambda: str(uuid4()))
    gate_type: GateType = GateType.PRE_EXECUTION
    status: GateStatus = GateStatus.PENDING
    
    # Results
    passed_checks: int = 0
    failed_checks: int = 0
    warning_checks: int = 0
    skipped_checks: int = 0
    
    # Issues
    issues: List[ValidationIssue] = field(default_factory=list)
    
    # Metrics
    metrics: Dict[str, Any] = field(default_factory=dict)
    
    # Timing
    started_at: Optional[datetime] = None
    completed_at: Optional[datetime] = None
    
    # Details
    validator_results: Dict[str, Any] = field(default_factory=dict)
    message: str = ""
    
    @property
    def duration_ms(self) -> int:
        if self.started_at and self.completed_at:
            return int((self.completed_at - self.started_at).total_seconds() * 1000)
        return 0
    
    @property
    def total_checks(self) -> int:
        return self.passed_checks + self.failed_checks + self.warning_checks + self.skipped_checks
    
    @property
    def pass_rate(self) -> float:
        if self.total_checks == 0:
            return 0.0
        return (self.passed_checks / self.total_checks) * 100
    
    @property
    def error_count(self) -> int:
        return sum(1 for i in self.issues if i.severity == "error")
    
    @property
    def warning_count(self) -> int:
        return sum(1 for i in self.issues if i.severity == "warning")
    
    def add_issue(self, issue: ValidationIssue):
        """Add a validation issue."""
        self.issues.append(issue)
        if issue.severity == "error":
            self.failed_checks += 1
        elif issue.severity == "warning":
            self.warning_checks += 1
    
    def to_dict(self) -> Dict[str, Any]:
        return {
            "gate_id": self.gate_id,
            "gate_type": self.gate_type.value,
            "status": self.status.value,
            "passed_checks": self.passed_checks,
            "failed_checks": self.failed_checks,
            "warning_checks": self.warning_checks,
            "skipped_checks": self.skipped_checks,
            "total_checks": self.total_checks,
            "pass_rate": self.pass_rate,
            "error_count": self.error_count,
            "warning_count": self.warning_count,
            "issues": [i.to_dict() for i in self.issues],
            "metrics": self.metrics,
            "duration_ms": self.duration_ms,
            "message": self.message,
            "started_at": self.started_at.isoformat() if self.started_at else None,
            "completed_at": self.completed_at.isoformat() if self.completed_at else None,
        }


@dataclass
class GateConfig:
    """Configuration for a quality gate."""
    gate_type: GateType
    enabled: bool = True
    blocking: bool = True  # If True, failures block progression
    validators: List[ValidatorType] = field(default_factory=list)
    thresholds: Dict[str, Any] = field(default_factory=dict)
    
    # Default thresholds
    min_coverage: float = 60.0
    max_complexity: int = 15
    max_issues: int = 0
    max_warnings: int = 10


# ==================== VALIDATOR INTERFACE ====================

class BaseValidator:
    """Base class for validators."""
    
    validator_type: ValidatorType = None
    
    async def validate(
        self,
        context: Dict[str, Any],
        config: GateConfig,
    ) -> List[ValidationIssue]:
        """
        Run validation and return issues.
        
        Args:
            context: Validation context (files, code, etc.)
            config: Gate configuration
            
        Returns:
            List of validation issues
        """
        raise NotImplementedError
    
    async def get_metrics(self, context: Dict[str, Any]) -> Dict[str, Any]:
        """Get metrics from validation."""
        return {}


# ==================== QUALITY GATE MANAGER ====================

class QualityGateManager:
    """
    Manages quality gates throughout the workflow.
    
    Responsibilities:
    - Register and configure gates
    - Run validators
    - Aggregate results
    - Enforce blocking rules
    """
    
    # Default gate configurations
    DEFAULT_GATES = {
        GateType.PRE_EXECUTION: GateConfig(
            gate_type=GateType.PRE_EXECUTION,
            validators=[ValidatorType.SPEC_COMPLIANCE],
            blocking=True,
            thresholds={"spec_completeness": 80},
        ),
        GateType.POST_EXECUTION: GateConfig(
            gate_type=GateType.POST_EXECUTION,
            validators=[
                ValidatorType.CODE_QUALITY,
                ValidatorType.TEST_COVERAGE,
                ValidatorType.SECURITY,
            ],
            blocking=True,
            thresholds={
                "min_coverage": 60,
                "max_complexity": 15,
                "security_issues": 0,
            },
        ),
        GateType.PRE_HANDOFF: GateConfig(
            gate_type=GateType.PRE_HANDOFF,
            validators=[ValidatorType.SPEC_COMPLIANCE],
            blocking=True,
        ),
        GateType.POST_HANDOFF: GateConfig(
            gate_type=GateType.POST_HANDOFF,
            validators=[
                ValidatorType.CODE_QUALITY,
                ValidatorType.TEST_COVERAGE,
            ],
            blocking=False,  # Warnings only
        ),
        GateType.CI_BUILD: GateConfig(
            gate_type=GateType.CI_BUILD,
            validators=[
                ValidatorType.CODE_QUALITY,
                ValidatorType.TEST_COVERAGE,
                ValidatorType.SECURITY,
            ],
            blocking=True,
            thresholds={
                "min_coverage": 75,
                "max_complexity": 10,
                "security_issues": 0,
            },
        ),
        GateType.PRE_RELEASE: GateConfig(
            gate_type=GateType.PRE_RELEASE,
            validators=[
                ValidatorType.CODE_QUALITY,
                ValidatorType.TEST_COVERAGE,
                ValidatorType.SECURITY,
                ValidatorType.DOCUMENTATION,
            ],
            blocking=True,
            thresholds={
                "min_coverage": 80,
                "max_complexity": 10,
                "security_issues": 0,
                "doc_coverage": 80,
            },
        ),
    }
    
    def __init__(self):
        """Initialize the Quality Gate Manager."""
        self._validators: Dict[ValidatorType, BaseValidator] = {}
        self._gate_configs: Dict[GateType, GateConfig] = dict(self.DEFAULT_GATES)
        self._results_history: List[GateResult] = []
        
        logger.info("quality_gate_manager_initialized")
    
    def register_validator(self, validator: BaseValidator):
        """Register a validator."""
        if validator.validator_type:
            self._validators[validator.validator_type] = validator
            logger.info(
                "validator_registered",
                validator_type=validator.validator_type.value,
            )
    
    def configure_gate(self, config: GateConfig):
        """Configure a quality gate."""
        self._gate_configs[config.gate_type] = config
        logger.info(
            "gate_configured",
            gate_type=config.gate_type.value,
            enabled=config.enabled,
            blocking=config.blocking,
        )
    
    async def run_gate(
        self,
        gate_type: GateType,
        context: Dict[str, Any],
        on_progress: Optional[Callable[[str, float], Awaitable[None]]] = None,
    ) -> GateResult:
        """
        Run a quality gate.
        
        Args:
            gate_type: Type of gate to run
            context: Validation context
            on_progress: Progress callback
            
        Returns:
            GateResult with validation results
        """
        config = self._gate_configs.get(gate_type)
        if not config:
            logger.warning("gate_not_configured", gate_type=gate_type.value)
            return GateResult(
                gate_type=gate_type,
                status=GateStatus.SKIPPED,
                message="Gate not configured",
            )
        
        if not config.enabled:
            return GateResult(
                gate_type=gate_type,
                status=GateStatus.SKIPPED,
                message="Gate disabled",
            )
        
        result = GateResult(
            gate_type=gate_type,
            status=GateStatus.RUNNING,
        )
        result.started_at = datetime.utcnow()
        
        try:
            # Run each validator
            total_validators = len(config.validators)
            for i, validator_type in enumerate(config.validators):
                validator = self._validators.get(validator_type)
                
                if not validator:
                    logger.warning(
                        "validator_not_found",
                        validator_type=validator_type.value,
                    )
                    result.skipped_checks += 1
                    continue
                
                # Report progress
                if on_progress:
                    progress = (i / total_validators) * 100
                    await on_progress(f"Running {validator_type.value}", progress)
                
                # Run validation
                try:
                    issues = await validator.validate(context, config)
                    metrics = await validator.get_metrics(context)
                    
                    # Add issues to result
                    for issue in issues:
                        result.add_issue(issue)
                    
                    # Store validator results
                    result.validator_results[validator_type.value] = {
                        "issues": len(issues),
                        "metrics": metrics,
                    }
                    
                    # Update metrics
                    result.metrics.update(metrics)
                    
                    # Count passed checks
                    if not any(i.severity == "error" for i in issues):
                        result.passed_checks += 1
                        
                except Exception as e:
                    logger.error(
                        "validator_error",
                        validator_type=validator_type.value,
                        error=str(e),
                    )
                    result.add_issue(ValidationIssue(
                        severity="error",
                        category="validator_error",
                        message=f"Validator failed: {str(e)}",
                    ))
            
            # Determine final status
            result.completed_at = datetime.utcnow()
            
            if result.error_count > 0:
                result.status = GateStatus.FAILED
                result.message = f"Gate failed with {result.error_count} errors"
            elif result.warning_count > config.thresholds.get("max_warnings", 10):
                result.status = GateStatus.WARNING
                result.message = f"Gate passed with {result.warning_count} warnings"
            else:
                result.status = GateStatus.PASSED
                result.message = "Gate passed"
            
            # Check thresholds
            if not self._check_thresholds(result, config):
                result.status = GateStatus.FAILED
                result.message = "Gate failed: thresholds not met"
            
            # Store in history
            self._results_history.append(result)
            
            logger.info(
                "gate_completed",
                gate_type=gate_type.value,
                status=result.status.value,
                duration_ms=result.duration_ms,
            )
            
            return result
            
        except Exception as e:
            result.status = GateStatus.FAILED
            result.completed_at = datetime.utcnow()
            result.message = f"Gate error: {str(e)}"
            logger.error("gate_error", gate_type=gate_type.value, error=str(e))
            return result
    
    def _check_thresholds(self, result: GateResult, config: GateConfig) -> bool:
        """Check if result meets threshold requirements."""
        thresholds = config.thresholds
        metrics = result.metrics
        
        # Check coverage threshold
        if "min_coverage" in thresholds:
            coverage = metrics.get("coverage", 0)
            if coverage < thresholds["min_coverage"]:
                result.add_issue(ValidationIssue(
                    severity="error",
                    category="threshold",
                    message=f"Coverage {coverage}% below threshold {thresholds['min_coverage']}%",
                ))
                return False
        
        # Check complexity threshold
        if "max_complexity" in thresholds:
            complexity = metrics.get("max_complexity", 0)
            if complexity > thresholds["max_complexity"]:
                result.add_issue(ValidationIssue(
                    severity="error",
                    category="threshold",
                    message=f"Complexity {complexity} exceeds threshold {thresholds['max_complexity']}",
                ))
                return False
        
        # Check security issues
        if "security_issues" in thresholds:
            security_issues = metrics.get("security_issues", 0)
            if security_issues > thresholds["security_issues"]:
                result.add_issue(ValidationIssue(
                    severity="error",
                    category="threshold",
                    message=f"Security issues {security_issues} exceeds threshold {thresholds['security_issues']}",
                ))
                return False
        
        return True
    
    async def run_workflow_gates(
        self,
        workflow_id: str,
        stage: str,
        context: Dict[str, Any],
    ) -> Dict[GateType, GateResult]:
        """
        Run all gates for a workflow stage.
        
        Args:
            workflow_id: Workflow identifier
            stage: Current stage (pre_execution, post_execution, etc.)
            context: Validation context
            
        Returns:
            Dictionary of gate results
        """
        results = {}
        
        # Map stage to gate types
        stage_gates = {
            "pre_execution": [GateType.PRE_EXECUTION],
            "post_execution": [GateType.POST_EXECUTION],
            "pre_handoff": [GateType.PRE_HANDOFF],
            "post_handoff": [GateType.POST_HANDOFF],
            "ci_build": [GateType.CI_BUILD],
            "pre_release": [GateType.PRE_RELEASE],
        }
        
        gates_to_run = stage_gates.get(stage, [])
        
        for gate_type in gates_to_run:
            result = await self.run_gate(gate_type, context)
            results[gate_type] = result
            
            # Check if blocking gate failed
            config = self._gate_configs.get(gate_type)
            if config and config.blocking and result.status == GateStatus.FAILED:
                logger.warning(
                    "blocking_gate_failed",
                    workflow_id=workflow_id,
                    gate_type=gate_type.value,
                )
                break
        
        return results
    
    def should_block(self, results: Dict[GateType, GateResult]) -> bool:
        """Check if any blocking gate failed."""
        for gate_type, result in results.items():
            config = self._gate_configs.get(gate_type)
            if config and config.blocking and result.status == GateStatus.FAILED:
                return True
        return False
    
    def get_history(
        self,
        gate_type: Optional[GateType] = None,
        limit: int = 100,
    ) -> List[GateResult]:
        """Get gate results history."""
        history = self._results_history
        
        if gate_type:
            history = [r for r in history if r.gate_type == gate_type]
        
        return history[-limit:]
    
    def get_summary(self) -> Dict[str, Any]:
        """Get summary of all gate results."""
        summary = {
            "total_runs": len(self._results_history),
            "by_status": {},
            "by_gate_type": {},
            "average_duration_ms": 0,
        }
        
        if not self._results_history:
            return summary
        
        # Count by status
        for status in GateStatus:
            count = sum(1 for r in self._results_history if r.status == status)
            if count > 0:
                summary["by_status"][status.value] = count
        
        # Count by gate type
        for gate_type in GateType:
            results = [r for r in self._results_history if r.gate_type == gate_type]
            if results:
                passed = sum(1 for r in results if r.status == GateStatus.PASSED)
                summary["by_gate_type"][gate_type.value] = {
                    "total": len(results),
                    "passed": passed,
                    "pass_rate": (passed / len(results)) * 100,
                }
        
        # Average duration
        durations = [r.duration_ms for r in self._results_history if r.duration_ms > 0]
        if durations:
            summary["average_duration_ms"] = sum(durations) / len(durations)
        
        return summary
