"""
SmartSpec Autopilot - Automated workflow orchestration.

This package provides CLI tools for orchestrating SmartSpec workflows.
"""

# Lazy import to avoid importing unnecessary dependencies
# Import 'app' only when needed (e.g., when running the Typer CLI)
__all__ = ["app"]


def __getattr__(name):
    """Lazy import for better startup performance and optional dependencies."""
    if name == "app":
        from .cli import app
        return app
    raise AttributeError(f"module '{__name__}' has no attribute '{name}'")
