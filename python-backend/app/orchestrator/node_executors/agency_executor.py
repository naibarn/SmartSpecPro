"""Agency run node executor for workflow integration.

Executes a multi-agent agency as a workflow node step.
Delegates to AgencyService for the actual run.
"""
import asyncio
import re
from typing import Any

import structlog

from app.core.database import AsyncSessionLocal
from app.orchestrator.node_executors.base import ExecutionContext, NodeExecutionData
from app.services.agency_service import AgencyService, RunContext

logger = structlog.get_logger(__name__)

DEFAULT_TIMEOUT_SECONDS = 600

# UUID v4 pattern for agency_id validation
_UUID_PATTERN = re.compile(
    r"^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$", re.IGNORECASE
)


async def _get_agency_service() -> AgencyService:
    """Create an AgencyService with a fresh DB session."""
    session = AsyncSessionLocal()
    return AgencyService(session)


class AgencyExecutor:
    """Executor for 'agency_run' workflow nodes.

    Loads an agency by ID, executes it with the provided message input,
    and returns the agency's final response as the node output.
    """

    async def execute(
        self,
        data: NodeExecutionData,
        context: ExecutionContext,
    ) -> dict[str, Any]:
        """Reject the retired Agency workflow node before any DB/credit work."""
        return {
            "outputs": {"result": "", "status": "retired"},
            "error": "Agency Swarm workflow nodes are retired; use the OpenAI Agents Orchestra",
        }

        inputs = data.inputs or {}
        config = data.config or {}

        # Resolve agency_id from inputs or config
        agency_id = (
            inputs.get("agency_id")
            or config.get("agency_id")
            or inputs.get("agencyId")
            or config.get("agencyId")
        )
        if not agency_id:
            return {
                "outputs": {"result": "", "status": "error"},
                "error": "Agency node requires agency_id in inputs or config",
            }

        # Validate agency_id format
        agency_id_str = str(agency_id)
        if not _UUID_PATTERN.match(agency_id_str):
            return {
                "outputs": {"result": "", "status": "error"},
                "error": "Invalid agency_id format (expected UUID)",
            }

        message = inputs.get("message", "")
        if not message:
            return {
                "outputs": {"result": "", "status": "error"},
                "error": "Agency node requires a message input",
            }

        # Build RunContext from ExecutionContext
        user_token = context.extra_data.get("user_token", "")
        run_context = RunContext(
            user_id=context.user_id,
            tenant_id=context.tenant_id or "",
            conversation_id=context.execution_id,
            user_token=user_token,
        )

        # Determine timeout
        timeout = float(
            config.get("timeout_seconds")
            or context.extra_data.get("timeout_seconds")
            or DEFAULT_TIMEOUT_SECONDS
        )

        # Create service with managed session
        session = AsyncSessionLocal()
        service = AgencyService(session)
        try:
            run_result = await asyncio.wait_for(
                service.execute_run(
                    agency_id=agency_id_str,
                    message=str(message),
                    context=run_context,
                ),
                timeout=timeout,
            )

            return {
                "outputs": {
                    "result": run_result.response,
                    "status": "success",
                    "run_metadata": {
                        "run_id": run_result.run_id,
                        "agent_steps": run_result.step_count,
                        "duration_ms": run_result.duration_ms,
                        "agent_name": run_result.agent_name,
                        "total_tokens": run_result.total_tokens,
                    },
                },
                "agency_id": agency_id_str,
                "cost": 0,  # Credits tracked by AgencyCreditManager inside service
            }

        except asyncio.TimeoutError:
            logger.warning(
                "agency_executor_timeout",
                agency_id=agency_id_str,
                timeout=timeout,
            )
            return {
                "outputs": {"result": "", "status": "error"},
                "error": f"Agency run timed out after {timeout}s",
                "agency_id": agency_id_str,
            }
        except Exception as exc:
            logger.error(
                "agency_executor_failed",
                agency_id=agency_id_str,
                error=str(exc),
                exc_info=True,
            )
            return {
                "outputs": {"result": "", "status": "error"},
                "error": f"Agency execution failed: {exc}",
                "agency_id": agency_id_str,
            }
        finally:
            await session.close()
