"""Security tests: verify user_jwt has been removed from automation copilot."""

import inspect

from app.tasks.automation_copilot_task import automation_analyze_task, automation_execute_task


def test_analyze_task_no_jwt_param():
    """automation_analyze_task must not accept user_jwt."""
    sig = inspect.signature(automation_analyze_task.run)
    assert "user_jwt" not in sig.parameters, "user_jwt still in automation_analyze_task signature"


def test_execute_task_no_jwt_param():
    """automation_execute_task must not accept user_jwt."""
    sig = inspect.signature(automation_execute_task.run)
    assert "user_jwt" not in sig.parameters, "user_jwt still in automation_execute_task signature"


def test_analyze_request_model_no_jwt():
    """AnalyzeRequest Pydantic model must not have user_jwt field."""
    from app.api.automation_copilot import AnalyzeRequest

    assert "user_jwt" not in AnalyzeRequest.model_fields, "user_jwt still in AnalyzeRequest"


def test_execute_request_model_no_jwt():
    """ExecuteRequest Pydantic model must not have user_jwt field."""
    from app.api.automation_copilot import ExecuteRequest

    assert "user_jwt" not in ExecuteRequest.model_fields, "user_jwt still in ExecuteRequest"


def test_no_jwt_in_task_source():
    """automation_copilot_task.py must not contain user_jwt references."""
    import pathlib

    source_path = pathlib.Path(inspect.getfile(automation_analyze_task.run)).resolve()
    source = source_path.read_text()

    # No user_jwt in parameter lists or function bodies
    assert "user_jwt" not in source, "user_jwt reference found in automation_copilot_task.py"


def test_no_jwt_in_api_source():
    """automation_copilot.py API must not contain user_jwt references."""
    import pathlib
    from app.api import automation_copilot

    source_path = pathlib.Path(inspect.getfile(automation_copilot)).resolve()
    source = source_path.read_text()

    assert "user_jwt" not in source, "user_jwt reference found in automation_copilot.py API"
