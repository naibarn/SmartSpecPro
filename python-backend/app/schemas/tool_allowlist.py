"""Tool allowlist for skill manifest validation.

Defines allowed and disallowed tools that can be used in skill manifests.
Disallowed tools are security risks (code execution, shell access, etc.).
"""


# Allowed tools that skills can use
ALLOWED_TOOLS: set[str] = {
    # LLM operations
    "llm_call",
    "llm_stream",
    # Media generation
    "generate_image",
    "generate_video",
    "combine_videos",
    # File operations (sandboxed)
    "read_file",
    "write_file",
    "list_files",
    # Communication
    "send_email",
    "send_telegram",
    # Data processing
    "parse_json",
    "format_text",
    "extract_data",
    # Calendar integration
    "calendar_list_events",
    "calendar_create_event",
    "calendar_suggest_times",
    # Control flow
    "approval_gate",
    "conditional",
    "loop",
    "parallel",
}

# Disallowed tools that pose security risks
DISALLOWED_TOOLS: set[str] = {
    # Code execution
    "execute_code",
    "execute_shell",
    "import_module",
    "eval",
    "exec",
    "compile",
    "__import__",
    "exec_module",
    "execfile",

    # System commands
    "system",
    "popen",
    "subprocess",
    "os.system",
    "os.exec",
    "os.execl",
    "os.execle",
    "os.execlp",
    "os.execlpe",
    "os.execv",
    "os.execve",
    "os.execvp",
    "os.execvpe",
    "os.spawn",

    # Built-in access
    "__builtins__",
    "globals",
    "locals",
    "vars",
    "dir",
    "getattr",
    "setattr",
    "delattr",
    "hasattr",

    # Interactive/input
    "input",
    "raw_input",
    "breakpoint",

    # Network (use approved HTTP client instead)
    "socket",
    "urllib",
    "http",
    "requests",
    "telnetlib",
    "ftplib",
    "smtplib",

    # File system (use sandboxed read_file/write_file)
    "open",
    "file",

    # Serialization exploits
    "pickle",
    "marshal",
    "shelve",
    "dill",
}


def is_tool_allowed(tool_name: str) -> bool:
    """Check if a tool is allowed to be used in skill manifests.

    Args:
        tool_name: Name of the tool to check

    Returns:
        True if the tool is allowed, False otherwise
    """
    tool_name_lower = tool_name.lower().strip()

    # Explicitly disallowed tools always reject
    if tool_name_lower in DISALLOWED_TOOLS:
        return False

    # Must be in the allowed list
    return tool_name_lower in ALLOWED_TOOLS


def validate_tool_usage(manifest: dict) -> list[str]:
    """Validate that all tools used in a manifest are allowed.

    Args:
        manifest: The skill manifest dictionary to validate

    Returns:
        List of disallowed tool names found in the manifest (empty if all valid)
    """
    disallowed_found = []

    # Check all nodes for tool usage
    nodes = manifest.get("nodes", [])
    for node in nodes:
        tool_name = node.get("type", "")
        if tool_name and not is_tool_allowed(tool_name):
            if tool_name not in disallowed_found:
                disallowed_found.append(tool_name)

    return disallowed_found
