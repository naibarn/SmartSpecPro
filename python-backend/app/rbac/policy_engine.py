"""
Policy Engine for Advanced Access Control
Phase 3: SaaS Readiness
"""

import structlog
from dataclasses import dataclass, field
from datetime import datetime
from enum import Enum
from typing import Optional, Dict, Any, List, Callable, Awaitable
import uuid

from .models import ResourceType

logger = structlog.get_logger(__name__)


class PolicyEffect(str, Enum):
    """Policy effect - allow or deny."""
    ALLOW = "allow"
    DENY = "deny"


class ConditionOperator(str, Enum):
    """Condition operators."""
    EQUALS = "eq"
    NOT_EQUALS = "neq"
    GREATER_THAN = "gt"
    LESS_THAN = "lt"
    GREATER_THAN_OR_EQUALS = "gte"
    LESS_THAN_OR_EQUALS = "lte"
    IN = "in"
    NOT_IN = "not_in"
    CONTAINS = "contains"
    STARTS_WITH = "starts_with"
    ENDS_WITH = "ends_with"
    EXISTS = "exists"
    NOT_EXISTS = "not_exists"


@dataclass
class PolicyCondition:
    """
    Condition for policy evaluation.
    
    Example:
        PolicyCondition(
            field="resource.owner_id",
            operator=ConditionOperator.EQUALS,
            value="${user.id}",  # Variable reference
        )
    """
    
    field: str  # Field path (e.g., "resource.owner_id", "user.role")
    operator: ConditionOperator
    value: Any  # Can be literal or variable reference (${...})
    
    def evaluate(self, context: Dict[str, Any]) -> bool:
        """
        Evaluate condition against context.
        
        Args:
            context: Evaluation context with user, resource, etc.
        
        Returns:
            True if condition is satisfied
        """
        # Get field value from context
        field_value = self._get_field_value(self.field, context)
        
        # Resolve value (handle variable references)
        compare_value = self._resolve_value(self.value, context)
        
        # Apply operator
        return self._apply_operator(field_value, compare_value)
    
    def _get_field_value(self, path: str, context: Dict[str, Any]) -> Any:
        """Get value from context using dot notation path."""
        parts = path.split(".")
        value = context
        
        for part in parts:
            if isinstance(value, dict):
                value = value.get(part)
            elif hasattr(value, part):
                value = getattr(value, part)
            else:
                return None
        
        return value
    
    def _resolve_value(self, value: Any, context: Dict[str, Any]) -> Any:
        """Resolve variable references in value."""
        if isinstance(value, str) and value.startswith("${") and value.endswith("}"):
            path = value[2:-1]
            return self._get_field_value(path, context)
        return value
    
    def _apply_operator(self, field_value: Any, compare_value: Any) -> bool:
        """Apply operator to values."""
        if self.operator == ConditionOperator.EQUALS:
            return field_value == compare_value
        elif self.operator == ConditionOperator.NOT_EQUALS:
            return field_value != compare_value
        elif self.operator == ConditionOperator.GREATER_THAN:
            return field_value > compare_value
        elif self.operator == ConditionOperator.LESS_THAN:
            return field_value < compare_value
        elif self.operator == ConditionOperator.GREATER_THAN_OR_EQUALS:
            return field_value >= compare_value
        elif self.operator == ConditionOperator.LESS_THAN_OR_EQUALS:
            return field_value <= compare_value
        elif self.operator == ConditionOperator.IN:
            return field_value in compare_value
        elif self.operator == ConditionOperator.NOT_IN:
            return field_value not in compare_value
        elif self.operator == ConditionOperator.CONTAINS:
            return compare_value in field_value if field_value else False
        elif self.operator == ConditionOperator.STARTS_WITH:
            return field_value.startswith(compare_value) if field_value else False
        elif self.operator == ConditionOperator.ENDS_WITH:
            return field_value.endswith(compare_value) if field_value else False
        elif self.operator == ConditionOperator.EXISTS:
            return field_value is not None
        elif self.operator == ConditionOperator.NOT_EXISTS:
            return field_value is None
        
        return False
    
    def to_dict(self) -> Dict[str, Any]:
        """Convert to dictionary."""
        return {
            "field": self.field,
            "operator": self.operator.value,
            "value": self.value,
        }


@dataclass
class Policy:
    """
    Access control policy.
    
    Policies define fine-grained access control rules.
    """
    
    policy_id: str = field(default_factory=lambda: str(uuid.uuid4()))
    name: str = ""
    description: str = ""
    
    # Effect
    effect: PolicyEffect = PolicyEffect.ALLOW
    
    # Scope
    tenant_id: Optional[str] = None
    resource_types: List[ResourceType] = field(default_factory=list)  # Empty = all
    actions: List[str] = field(default_factory=list)  # Empty = all
    
    # Conditions (all must be true)
    conditions: List[PolicyCondition] = field(default_factory=list)
    
    # Priority (higher = evaluated first)
    priority: int = 0
    
    # Status
    is_enabled: bool = True
    
    # Metadata
    created_at: datetime = field(default_factory=datetime.utcnow)
    updated_at: datetime = field(default_factory=datetime.utcnow)
    
    def matches(
        self,
        resource_type: Optional[ResourceType],
        action: str,
    ) -> bool:
        """
        Check if policy applies to resource type and action.
        
        Args:
            resource_type: Resource type
            action: Action being performed
        
        Returns:
            True if policy applies
        """
        # Check resource type
        if self.resource_types:
            if resource_type not in self.resource_types:
                return False
        
        # Check action
        if self.actions:
            if action not in self.actions and "*" not in self.actions:
                return False
        
        return True
    
    def evaluate(self, context: Dict[str, Any]) -> Optional[PolicyEffect]:
        """
        Evaluate policy against context.
        
        Args:
            context: Evaluation context
        
        Returns:
            PolicyEffect if policy matches, None otherwise
        """
        if not self.is_enabled:
            return None
        
        # All conditions must be true
        for condition in self.conditions:
            if not condition.evaluate(context):
                return None
        
        return self.effect
    
    def to_dict(self) -> Dict[str, Any]:
        """Convert to dictionary."""
        return {
            "policy_id": self.policy_id,
            "name": self.name,
            "description": self.description,
            "effect": self.effect.value,
            "tenant_id": self.tenant_id,
            "resource_types": [rt.value for rt in self.resource_types],
            "actions": self.actions,
            "conditions": [c.to_dict() for c in self.conditions],
            "priority": self.priority,
            "is_enabled": self.is_enabled,
            "created_at": self.created_at.isoformat(),
            "updated_at": self.updated_at.isoformat(),
        }


@dataclass
class PolicyEvaluationResult:
    """Result of policy evaluation."""
    
    allowed: bool
    effect: PolicyEffect
    matching_policy: Optional[Policy] = None
    evaluated_policies: int = 0
    reason: str = ""
    
    def to_dict(self) -> Dict[str, Any]:
        """Convert to dictionary."""
        return {
            "allowed": self.allowed,
            "effect": self.effect.value,
            "matching_policy_id": self.matching_policy.policy_id if self.matching_policy else None,
            "evaluated_policies": self.evaluated_policies,
            "reason": self.reason,
        }


class PolicyEngine:
    """
    Policy evaluation engine.
    
    Evaluates access control policies to determine if an action is allowed.
    """
    
    def __init__(self):
        """Initialize policy engine."""
        self._policies: Dict[str, Policy] = {}
        self._logger = logger.bind(component="policy_engine")
        
        # Initialize default policies
        self._initialize_default_policies()
    
    def _initialize_default_policies(self) -> None:
        """Initialize default system policies."""
        # Owner can do anything with their resources
        owner_policy = Policy(
            policy_id="system-owner-full-access",
            name="Owner Full Access",
            description="Resource owners have full access",
            effect=PolicyEffect.ALLOW,
            conditions=[
                PolicyCondition(
                    field="resource.owner_id",
                    operator=ConditionOperator.EQUALS,
                    value="${user.id}",
                ),
            ],
            priority=100,
        )
        self._policies[owner_policy.policy_id] = owner_policy
        
        # Deny access to deleted resources
        deleted_policy = Policy(
            policy_id="system-deny-deleted",
            name="Deny Deleted Resources",
            description="Deny access to deleted resources",
            effect=PolicyEffect.DENY,
            conditions=[
                PolicyCondition(
                    field="resource.is_deleted",
                    operator=ConditionOperator.EQUALS,
                    value=True,
                ),
            ],
            priority=1000,  # High priority
        )
        self._policies[deleted_policy.policy_id] = deleted_policy
    
    async def add_policy(self, policy: Policy) -> Policy:
        """Add a policy."""
        self._policies[policy.policy_id] = policy
        self._logger.info(
            "policy_added",
            policy_id=policy.policy_id,
            name=policy.name,
        )
        return policy
    
    async def remove_policy(self, policy_id: str) -> bool:
        """Remove a policy."""
        if policy_id in self._policies:
            del self._policies[policy_id]
            self._logger.info("policy_removed", policy_id=policy_id)
            return True
        return False
    
    async def get_policy(self, policy_id: str) -> Optional[Policy]:
        """Get a policy by ID."""
        return self._policies.get(policy_id)
    
    async def list_policies(
        self,
        tenant_id: Optional[str] = None,
        resource_type: Optional[ResourceType] = None,
    ) -> List[Policy]:
        """List policies with optional filtering."""
        policies = list(self._policies.values())
        
        if tenant_id:
            policies = [
                p for p in policies
                if p.tenant_id is None or p.tenant_id == tenant_id
            ]
        
        if resource_type:
            policies = [
                p for p in policies
                if not p.resource_types or resource_type in p.resource_types
            ]
        
        # Sort by priority (descending)
        policies.sort(key=lambda p: p.priority, reverse=True)
        return policies
    
    async def evaluate(
        self,
        user: Dict[str, Any],
        resource: Dict[str, Any],
        action: str,
        resource_type: Optional[ResourceType] = None,
        tenant_id: Optional[str] = None,
        additional_context: Optional[Dict[str, Any]] = None,
    ) -> PolicyEvaluationResult:
        """
        Evaluate policies for an access request.
        
        Args:
            user: User information
            resource: Resource information
            action: Action being performed
            resource_type: Type of resource
            tenant_id: Tenant ID
            additional_context: Additional context for evaluation
        
        Returns:
            PolicyEvaluationResult
        """
        # Build evaluation context
        context = {
            "user": user,
            "resource": resource,
            "action": action,
            "resource_type": resource_type,
            "tenant_id": tenant_id,
            "timestamp": datetime.utcnow(),
            **(additional_context or {}),
        }
        
        # Get applicable policies
        policies = await self.list_policies(tenant_id, resource_type)
        
        evaluated = 0
        for policy in policies:
            if not policy.matches(resource_type, action):
                continue
            
            evaluated += 1
            effect = policy.evaluate(context)
            
            if effect is not None:
                allowed = effect == PolicyEffect.ALLOW
                
                self._logger.debug(
                    "policy_evaluated",
                    policy_id=policy.policy_id,
                    effect=effect.value,
                    action=action,
                )
                
                return PolicyEvaluationResult(
                    allowed=allowed,
                    effect=effect,
                    matching_policy=policy,
                    evaluated_policies=evaluated,
                    reason=f"Policy '{policy.name}' matched",
                )
        
        # Default deny if no policy matched
        return PolicyEvaluationResult(
            allowed=False,
            effect=PolicyEffect.DENY,
            evaluated_policies=evaluated,
            reason="No matching policy found (default deny)",
        )
    
    async def check_access(
        self,
        user_id: str,
        resource_id: str,
        action: str,
        resource_type: ResourceType,
        tenant_id: Optional[str] = None,
        resource_loader: Optional[Callable[[str], Awaitable[Dict[str, Any]]]] = None,
        user_loader: Optional[Callable[[str], Awaitable[Dict[str, Any]]]] = None,
    ) -> bool:
        """
        Simplified access check.
        
        Args:
            user_id: User ID
            resource_id: Resource ID
            action: Action
            resource_type: Resource type
            tenant_id: Tenant ID
            resource_loader: Optional function to load resource data
            user_loader: Optional function to load user data
        
        Returns:
            True if access is allowed
        """
        # Load user data
        if user_loader:
            user = await user_loader(user_id)
        else:
            user = {"id": user_id}
        
        # Load resource data
        if resource_loader:
            resource = await resource_loader(resource_id)
        else:
            resource = {"id": resource_id}
        
        result = await self.evaluate(
            user=user,
            resource=resource,
            action=action,
            resource_type=resource_type,
            tenant_id=tenant_id,
        )
        
        return result.allowed


# Global instance
_policy_engine: Optional[PolicyEngine] = None


def get_policy_engine() -> PolicyEngine:
    """Get global policy engine instance."""
    global _policy_engine
    if _policy_engine is None:
        _policy_engine = PolicyEngine()
    return _policy_engine
