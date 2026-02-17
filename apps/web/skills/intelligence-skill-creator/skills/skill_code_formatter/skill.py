"""Sample skill: Code Formatter (simple)."""

def respond(input_text: str, context=None) -> str:
    # simple formatter: trim trailing spaces and ensure newline at end
    code = input_text or ""
    lines = [ln.rstrip() for ln in code.splitlines()]
    out = "\n".join(lines).rstrip() + "\n"
    # explain
    return "Formatted:\n" + out
