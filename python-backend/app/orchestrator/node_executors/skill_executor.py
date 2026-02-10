"""Skill node executor with dynamic skill discovery."""
import re
from typing import Any, Dict, Optional, List
from app.orchestrator.node_executors.base import ExecutionContext, NodeExecutionData

# TODO: Uncomment when SkillRegistryService is available
# from app.services.skill_registry_service import SkillRegistryService


class SkillExecutor:
    """
    Executor for Skill nodes.

    Skills are dynamically discovered from the skill registry.
    Each skill has:
    - input.schema.json - Input validation schema
    - ui.schema.json - UI configuration for frontend
    - skill.md - Skill definition with prompts/logic
    - handler (optional) - Custom Python/JS execution logic
    """

    # Only allow alphanumeric, underscores, hyphens (no path separators, dots, etc.)
    SAFE_SKILL_ID_PATTERN = re.compile(r"^[a-zA-Z0-9_\-]{1,100}$")

    async def execute(
        self,
        data: NodeExecutionData,
        context: ExecutionContext,
    ) -> Dict[str, Any]:
        """
        Execute a skill node.

        Flow:
        1. Resolve skill ID from config (e.g., 'analyze_sentiment')
        2. Load skill definition from registry
        3. Validate inputs against input schema
        4. Execute skill handler or LLM-based execution
        5. Return outputs

        Args:
            data: Node execution data with skill_id and inputs
            context: Execution context

        Returns:
            dict: Skill execution result
                - outputs: Dict[str, Any] - Skill outputs
                - skill_id: str - Skill ID executed
                - skill_version: str - Skill version
                - cost: float - Execution cost
        """
        config = data.config
        inputs = data.inputs

        # Get skill ID
        skill_id = config.get("skill_id")
        if not skill_id:
            return {
                "error": "Skill node requires a skill_id in configuration",
                "outputs": {},
            }

        # Validate skill_id format (prevent path traversal / injection)
        if not self.SAFE_SKILL_ID_PATTERN.match(str(skill_id)):
            return {
                "error": f"Invalid skill_id format: must be alphanumeric with underscores/hyphens, max 100 chars",
                "outputs": {},
            }

        # Load skill from registry
        # TODO: Integrate with SkillRegistryService
        # skill_registry = SkillRegistryService()
        # skill = await skill_registry.get_skill(skill_id)
        #
        # if not skill:
        #     return {
        #         "error": f"Skill not found: {skill_id}",
        #         "outputs": {},
        #     }
        #
        # # Validate inputs
        # validation_errors = skill.validate_inputs(inputs)
        # if validation_errors:
        #     return {
        #         "error": f"Invalid inputs: {validation_errors}",
        #         "outputs": {},
        #     }
        #
        # # Execute skill
        # if skill.has_handler:
        #     # Use custom handler
        #     result = await skill.execute_handler(inputs, context)
        # else:
        #     # Use LLM-based execution with skill.md prompt
        #     result = await skill.execute_llm(inputs, context)
        #
        # return {
        #     "outputs": result.outputs,
        #     "skill_id": skill_id,
        #     "skill_version": skill.version,
        #     "cost": result.cost,
        # }

        # Temporary: Return mock result
        return {
            "outputs": {
                "result": f"Skill '{skill_id}' executed successfully",
                "inputs_received": inputs,
                "status": "success",
            },
            "skill_id": skill_id,
            "skill_version": "1.0.0",
            "cost": 0.5,  # Mock cost
            "note": "Mock skill execution. TODO: Integrate with SkillRegistryService.",
        }

    async def list_available_skills(self) -> List[Dict[str, Any]]:
        """
        List all available skills from registry.

        Returns:
            list: Available skills with metadata
        """
        # TODO: Query skill registry
        # skill_registry = SkillRegistryService()
        # skills = await skill_registry.list_skills()
        # return [
        #     {
        #         "skill_id": skill.id,
        #         "name": skill.name,
        #         "description": skill.description,
        #         "category": skill.category,
        #         "version": skill.version,
        #         "inputs": skill.input_schema,
        #         "outputs": skill.output_schema,
        #     }
        #     for skill in skills
        # ]

        # Temporary: Return mock list
        return [
            {
                "skill_id": "analyze_sentiment",
                "name": "Analyze Sentiment",
                "description": "Analyze sentiment of text (positive/negative/neutral)",
                "category": "text_analysis",
                "version": "1.0.0",
            },
            {
                "skill_id": "extract_entities",
                "name": "Extract Entities",
                "description": "Extract named entities (people, places, organizations)",
                "category": "text_analysis",
                "version": "1.0.0",
            },
            {
                "skill_id": "summarize_text",
                "name": "Summarize Text",
                "description": "Generate concise summary of long text",
                "category": "text_processing",
                "version": "1.0.0",
            },
        ]


# For backward compatibility
async def execute_skill(data: NodeExecutionData, context: ExecutionContext) -> Dict[str, Any]:
    """Legacy function wrapper for skill execution."""
    executor = SkillExecutor()
    return await executor.execute(data, context)
