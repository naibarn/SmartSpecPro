"""Security tests: verify user_jwt has been removed from agency creator tasks."""

import inspect

from app.tasks.agency_creator_task import create_agency_discover_task, create_agency_design_task


def test_discover_task_no_jwt_param():
    """create_agency_discover_task must not accept user_jwt."""
    sig = inspect.signature(create_agency_discover_task.run)
    assert "user_jwt" not in sig.parameters, "user_jwt still in create_agency_discover_task signature"


def test_design_task_no_jwt_param():
    """create_agency_design_task must not accept user_jwt."""
    sig = inspect.signature(create_agency_design_task.run)
    assert "user_jwt" not in sig.parameters, "user_jwt still in create_agency_design_task signature"


def test_llm_call_no_bearer_jwt():
    """The _llm_call function must not accept user_jwt or use Bearer auth."""
    from app.tasks.agency_creator_task import _llm_call

    sig = inspect.signature(_llm_call)
    assert "user_jwt" not in sig.parameters, "user_jwt still in _llm_call signature"
    assert "user_id" in sig.parameters, "user_id missing from _llm_call signature"


def test_llm_discover_no_jwt():
    """_llm_discover must take user_id not user_jwt."""
    from app.tasks.agency_creator_task import _llm_discover

    sig = inspect.signature(_llm_discover)
    assert "user_jwt" not in sig.parameters
    assert "user_id" in sig.parameters


def test_llm_design_no_jwt():
    """_llm_design must take user_id not user_jwt."""
    from app.tasks.agency_creator_task import _llm_design

    sig = inspect.signature(_llm_design)
    assert "user_jwt" not in sig.parameters
    assert "user_id" in sig.parameters


def test_llm_document_no_jwt():
    """_llm_document must take user_id not user_jwt."""
    from app.tasks.agency_creator_task import _llm_document

    sig = inspect.signature(_llm_document)
    assert "user_jwt" not in sig.parameters
    assert "user_id" in sig.parameters


def test_no_bearer_header_in_llm_calls():
    """LLM helper functions must not use Bearer JWT auth."""
    import pathlib

    source_path = pathlib.Path(inspect.getfile(create_agency_discover_task.run)).resolve()
    source = source_path.read_text()

    # Extract the _llm_call function source and check it doesn't use Bearer
    llm_call_start = source.index("async def _llm_call(")
    llm_call_end = source.index("\n\nasync def _llm_discover(")
    llm_call_source = source[llm_call_start:llm_call_end]

    assert "Bearer" not in llm_call_source, "Bearer JWT auth found in _llm_call"
    assert "Authorization" not in llm_call_source, "Authorization header found in _llm_call"
    assert "LLMGatewayClient" in llm_call_source, "LLMGatewayClient not used in _llm_call"


def test_implement_agency_uses_internal_token():
    """_implement_agency must use X-Internal-Token, not Bearer JWT."""
    import pathlib

    source_path = pathlib.Path(inspect.getfile(create_agency_discover_task.run)).resolve()
    source = source_path.read_text()

    # Extract _implement_agency source
    impl_start = source.index("async def _implement_agency(")
    impl_end = source.index("\n\nasync def _llm_document(")
    impl_source = source[impl_start:impl_end]

    assert "X-Internal-Token" in impl_source, "X-Internal-Token not found in _implement_agency"
    assert "X-User-Id" in impl_source, "X-User-Id not found in _implement_agency"
    assert "Bearer" not in impl_source, "Bearer JWT auth still in _implement_agency"
    assert "user_jwt" not in impl_source, "user_jwt reference still in _implement_agency"


def test_implement_agency_signature():
    """_implement_agency must accept user_id, not user_jwt."""
    from app.tasks.agency_creator_task import _implement_agency

    sig = inspect.signature(_implement_agency)
    assert "user_id" in sig.parameters, "user_id missing from _implement_agency"
    assert "user_jwt" not in sig.parameters, "user_jwt still in _implement_agency"
