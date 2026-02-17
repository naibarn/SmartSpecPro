"""Form Input Adapter."""

from typing import Dict, Any

from .base import NodeAdapter


class FormInputAdapter(NodeAdapter):
    """
    Transform form_input node to conversational input.

    Strategy: Sequential field collection
    - Bot asks for each field one at a time
    - Validates each response
    - Collects all responses before continuing
    """

    def can_adapt(self, node_type: str) -> bool:
        return node_type == "form_input"

    def adapt(self, node: Dict[str, Any]) -> Dict[str, Any]:
        config = node.get("config", {})
        fields = config.get("fields", [])

        conversational_fields = []
        for field in fields:
            conv_field = {
                "field_id": field.get("id"),
                "field_name": field.get("name", field.get("id")),
                "prompt": self._generate_prompt(field),
                "required": field.get("required", False),
                "type": field.get("type", "text"),
                "validation": field.get("validation"),
                "examples": field.get("examples", []),
            }
            conversational_fields.append(conv_field)

        return {
            "type": "conversational_input",
            "original_type": "form_input",
            "config": {
                "fields": conversational_fields,
                "collection_strategy": "sequential",
                "acknowledgment_message": config.get(
                    "acknowledgment", "Thank you! I have all the information I need."
                ),
            },
        }

    def _generate_prompt(self, field: Dict[str, Any]) -> str:
        """Generate natural language prompt for field."""
        label = field.get("label", field.get("id"))
        description = field.get("description", "")

        prompt = f"Please provide {label}"
        if description:
            prompt += f" ({description})"
        prompt += ":"

        return prompt
