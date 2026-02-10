"""
Data type system for workflow node ports.
"""

PORT_TYPE_COMPATIBILITY = {
    "text": {"text", "any"},
    "json": {"json", "text", "any"},  # json can stringify to text
    "array": {"array", "json", "any"},
    "image": {"image", "any"},
    "number": {"number", "text", "any"},
    "boolean": {"boolean", "any"},
    "any": {"text", "json", "array", "image", "number", "boolean", "any"},
}


def is_compatible_connection(source_type: str, target_type: str) -> bool:
    """Check if source port type can connect to target port type."""
    return target_type in PORT_TYPE_COMPATIBILITY.get(source_type, set())
