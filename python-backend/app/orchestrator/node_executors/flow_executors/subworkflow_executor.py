"""Subworkflow Executor - Execute another workflow as a sub-process."""

import asyncio
import logging
from datetime import datetime, timezone
from typing import Any

from app.orchestrator.node_executors.base import ExecutionContext, NodeExecutionData

logger = logging.getLogger(__name__)


class SubworkflowExecutor:
    """
    Execute another workflow as a sub-process.

    Features:
    - Pass inputs to subworkflow
    - Map outputs back
    - Inherit context (tenant, user)
    - Timeout control
    """

    MAX_TIMEOUT = 300  # 5 minutes

    async def execute(
        self, data: NodeExecutionData, context: ExecutionContext
    ) -> dict[str, Any]:
        """Execute subworkflow."""
        subworkflow_id = data.inputs.get("workflow_id")
        inputs = data.inputs.get("inputs", {})
        timeout = min(data.inputs.get("timeout", 60), self.MAX_TIMEOUT)
        output_mapping = data.inputs.get("output_mapping", {})

        if not subworkflow_id:
            raise ValueError("workflow_id is required")

        # TODO: Load subworkflow from database
        # For now, return stub response
        logger.warning(
            "SubworkflowExecutor.execute() called - using stub implementation. "
            "Full implementation requires database access."
        )

        started_at = datetime.now(timezone.utc)

        # Simulate execution
        await asyncio.sleep(0.1)

        # Mock result
        raw_result = {
            "subworkflow_id": subworkflow_id,
            "executed": True,
            "inputs_received": list(inputs.keys()),
        }

        # Map outputs if specified
        mapped_outputs = self._map_outputs(raw_result, output_mapping)

        return {
            "success": True,
            "outputs": mapped_outputs,
            "raw_outputs": raw_result,
            "execution_time": (datetime.now(timezone.utc) - started_at).total_seconds(),
            "note": "STUB: Subworkflow execution not fully implemented",
        }

    def _map_outputs(self, result: dict, mapping: dict) -> dict:
        """Map subworkflow outputs to specified keys."""
        if not mapping:
            return result

        mapped = {}
        for target_key, source_path in mapping.items():
            # Navigate path (e.g., "data.result.value")
            value = result
            for key in source_path.split("."):
                value = value.get(key, {}) if isinstance(value, dict) else None
                if value is None:
                    break
            mapped[target_key] = value

        return mapped
