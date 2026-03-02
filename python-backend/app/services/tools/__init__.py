"""
Tools package — browser automation, cross-agency calls, and other sandboxed execution tools.
"""

from .browser_tool import BrowserSSRFGuard, BrowserSession, ConcurrencyGuard
from .agency_call_tool import (
    AgencyCallError,
    execute_agency_call,
    validate_tenant_isolation,
    check_rbac,
    check_depth,
    check_loop,
    record_in_chain,
    check_budget,
    record_spend,
    acquire_semaphore,
    release_semaphore,
    check_allowed_agencies,
)

__all__ = [
    "BrowserSSRFGuard",
    "BrowserSession",
    "ConcurrencyGuard",
    "AgencyCallError",
    "execute_agency_call",
    "validate_tenant_isolation",
    "check_rbac",
    "check_depth",
    "check_loop",
    "record_in_chain",
    "check_budget",
    "record_spend",
    "acquire_semaphore",
    "release_semaphore",
    "check_allowed_agencies",
]
