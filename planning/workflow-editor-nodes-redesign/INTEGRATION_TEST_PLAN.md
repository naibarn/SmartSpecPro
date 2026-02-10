# Integration Test Plan - Workflow Editor Redesign

## Overview

This document outlines the comprehensive integration test suite for the workflow editor redesign. Tests validate that all components (Sections 01-14) work together correctly in real-world scenarios.

**Test Framework:** pytest (Python), Vitest (TypeScript/React)
**Markers:** `@pytest.mark.integration`, `@pytest.mark.e2e`
**Coverage Target:** All critical user paths

## Test Categories

### 1. Basic Workflow Execution (E2E)

**File:** `python-backend/tests/integration/test_workflow_e2e.py`

#### Test: Simple LLM Call
```python
@pytest.mark.integration
async def test_simple_llm_call_execution(test_db, test_user):
    """
    Verify end-to-end execution of single LLM node.

    Steps:
    1. Create workflow with single llm_call node
    2. Compile workflow
    3. Execute workflow
    4. Verify output contains response text
    5. Verify credit deduction occurred
    """
    workflow = {
        "nodes": [{
            "id": "llm1",
            "type": "workflow",
            "data": {
                "nodeType": "llm_call",
                "label": "Test LLM",
                "config": {
                    "prompt": "Say hello",
                    "model": "gpt-4o-mini"
                }
            }
        }],
        "edges": []
    }

    # Compile
    compiler = FlowCompiler()
    manifest = compiler.compile(workflow)
    assert manifest["steps"]

    # Execute
    orchestrator = WorkflowOrchestrator()
    context = ExecutionContext(user_id=test_user.id)
    result = await orchestrator.execute(manifest, context)

    # Verify
    assert result["status"] == "completed"
    assert "llm1" in result["node_results"]
    assert result["node_results"]["llm1"]["output"]["text"]
    assert result["node_results"]["llm1"]["usage"]["total_tokens"] > 0
```

#### Test: Multi-Node Chain (RAG → LLM)
```python
@pytest.mark.integration
async def test_rag_to_llm_chain(test_db, test_user, mock_rag_collection):
    """
    Verify data flows through connected nodes with expression resolution.

    Steps:
    1. Create RAG node → LLM node
    2. LLM prompt uses {{rag_node.context}}
    3. Execute
    4. Verify RAG output passed to LLM
    """
    workflow = {
        "nodes": [
            {
                "id": "rag1",
                "type": "workflow",
                "data": {
                    "nodeType": "rag_query",
                    "config": {
                        "collection": "test_collection",
                        "query": "What is RAG?"
                    }
                }
            },
            {
                "id": "llm1",
                "type": "workflow",
                "data": {
                    "nodeType": "llm_call",
                    "config": {
                        "prompt": "Based on this context: {{rag1.context}}, answer the question"
                    }
                }
            }
        ],
        "edges": [{
            "source": "rag1",
            "target": "llm1",
            "sourceHandle": "context",
            "targetHandle": "prompt"
        }]
    }

    # Compile and execute
    manifest = FlowCompiler().compile(workflow)
    result = await WorkflowOrchestrator().execute(manifest, context)

    # Verify expression resolution
    llm_input = result["node_results"]["llm1"]["input"]["prompt"]
    assert "{{rag1.context}}" not in llm_input  # Expression resolved
    assert mock_rag_collection.documents[0].content in llm_input
```

### 2. Conditional Branching

**File:** `python-backend/tests/integration/test_conditional_execution.py`

#### Test: Conditional True Path
```python
@pytest.mark.integration
async def test_conditional_true_path(test_db, test_user):
    """
    Verify conditional takes true path when condition met.
    """
    workflow = create_conditional_workflow(
        condition="{{llm1.text_length}} > 100",
        llm_response_length=150
    )

    result = await execute_workflow(workflow, test_user)

    assert result["node_results"]["conditional1"]["output"]["branch"] == "true"
    assert result["node_results"]["image1"]["status"] == "success"  # True path executed
```

#### Test: Conditional False Path
```python
@pytest.mark.integration
async def test_conditional_false_path(test_db, test_user):
    """
    Verify conditional takes false path when condition not met.
    """
    workflow = create_conditional_workflow(
        condition="{{llm1.text_length}} > 100",
        llm_response_length=50
    )

    result = await execute_workflow(workflow, test_user)

    assert result["node_results"]["conditional1"]["output"]["branch"] == "false"
    assert result["node_results"]["image1"]["status"] == "skipped"  # True path skipped
```

### 3. Loop Execution

**File:** `python-backend/tests/integration/test_loop_execution.py`

#### Test: Loop Count Mode
```python
@pytest.mark.integration
async def test_loop_count_mode(test_db, test_user):
    """
    Verify loop executes exact count of iterations.
    """
    workflow = {
        "nodes": [
            {
                "id": "loop1",
                "type": "workflow",
                "data": {
                    "nodeType": "loop",
                    "config": {"count": 3}
                }
            },
            {
                "id": "llm1",
                "parentId": "loop1",  # Inside loop
                "type": "workflow",
                "data": {
                    "nodeType": "llm_call",
                    "config": {"prompt": "Iteration {{loop.index}}"}
                }
            }
        ],
        "edges": []
    }

    result = await execute_workflow(workflow, test_user)

    assert len(result["node_results"]["loop1"]["results"]) == 3
    assert result["node_results"]["loop1"]["iterations"] == 3
```

#### Test: Loop Data Mode
```python
@pytest.mark.integration
async def test_loop_data_mode(test_db, test_user):
    """
    Verify loop iterates over array data.
    """
    workflow = create_loop_workflow(
        data=["item1", "item2", "item3"],
        llm_prompt="Process: {{loop.item}}"
    )

    result = await execute_workflow(workflow, test_user)

    assert len(result["node_results"]["loop1"]["results"]) == 3
    # Verify each iteration processed correct item
    for i, item in enumerate(["item1", "item2", "item3"]):
        assert item in result["node_results"]["loop1"]["results"][i]["text"]
```

### 4. Approval Gates

**File:** `python-backend/tests/integration/test_approval_execution.py`

#### Test: Approval Approved Path
```python
@pytest.mark.integration
async def test_approval_approved_path(test_db, test_user, test_approver):
    """
    Verify workflow pauses for approval and continues on approval.
    """
    workflow = create_approval_workflow(approvers=[test_approver.id])

    # Start execution
    execution_id = await start_workflow_execution(workflow, test_user)

    # Verify paused
    status = await get_execution_status(execution_id)
    assert status["status"] == "paused"
    assert status["awaiting_approval"]

    # Approve
    approval_service = ApprovalDBService()
    await approval_service.approve(execution_id, test_approver.id)

    # Verify continued
    status = await get_execution_status(execution_id)
    assert status["status"] == "completed"
    assert status["node_results"]["approval1"]["output"]["approved"] == True
```

#### Test: Approval Timeout
```python
@pytest.mark.integration
async def test_approval_timeout(test_db, test_user):
    """
    Verify approval times out and routes to rejected path.
    """
    workflow = create_approval_workflow(timeout_seconds=1)

    execution_id = await start_workflow_execution(workflow, test_user)

    # Wait for timeout
    await asyncio.sleep(2)

    status = await get_execution_status(execution_id)
    assert status["status"] == "completed"
    assert status["node_results"]["approval1"]["output"]["approved"] == False
    assert status["node_results"]["approval1"]["output"]["timeout"] == True
```

### 5. Template Lifecycle

**File:** `python-backend/tests/integration/test_template_lifecycle.py`

#### Test: Template Save → Load → Execute
```python
@pytest.mark.integration
async def test_template_full_lifecycle(test_db, test_user):
    """
    Verify template can be saved, loaded, and executed.
    """
    # Create workflow
    workflow = create_sample_workflow()

    # Save as template
    template_id = await save_workflow_template(
        workflow=workflow,
        name="RAG + LLM Template",
        tags=["rag", "llm"],
        user=test_user
    )

    # List templates
    templates = await list_workflow_templates(tags=["llm"])
    assert len(templates) > 0
    assert any(t["id"] == template_id for t in templates)

    # Load template
    loaded = await load_workflow_template(template_id)
    assert loaded["workflow_json"]["nodes"] == workflow["nodes"]

    # Execute loaded workflow
    result = await execute_workflow(loaded["workflow_json"], test_user)
    assert result["status"] == "completed"
```

#### Test: Template Tenant Isolation
```python
@pytest.mark.integration
async def test_template_tenant_isolation(test_db, user_tenant_a, user_tenant_b):
    """
    Verify templates respect tenant boundaries.
    """
    # User A creates private template
    template_id = await save_workflow_template(
        workflow=create_sample_workflow(),
        name="Private Template",
        status="draft",  # Not published
        user=user_tenant_a
    )

    # User B lists templates
    templates = await list_workflow_templates(user=user_tenant_b)

    # User B should not see User A's private template
    assert not any(t["id"] == template_id for t in templates)

    # Publish template
    await update_workflow_template(template_id, status="published")

    # Now User B can see it
    templates = await list_workflow_templates(user=user_tenant_b)
    assert any(t["id"] == template_id for t in templates)
```

### 6. Real-Time SSE Streaming

**File:** `python-backend/tests/integration/test_sse_streaming.py`

#### Test: SSE Event Delivery
```python
@pytest.mark.integration
async def test_sse_event_stream(test_db, test_user, async_client):
    """
    Verify SSE stream delivers execution events in real-time.
    """
    workflow = create_multi_node_workflow()
    execution_id = await start_workflow_execution(workflow, test_user)

    # Connect to SSE stream
    events = []
    async with async_client.stream(
        "GET",
        f"/api/v1/workflows/execute/{execution_id}/stream",
        headers={"Authorization": f"Bearer {test_user.token}"}
    ) as response:
        async for line in response.aiter_lines():
            if line.startswith("event:"):
                events.append(parse_sse_event(line))
            if "workflow_complete" in line:
                break

    # Verify event sequence
    assert events[0]["eventType"] == "node_start"
    assert events[-1]["eventType"] == "workflow_complete"

    # Verify all nodes reported
    node_ids = {e["nodeId"] for e in events if "nodeId" in e}
    assert len(node_ids) == len(workflow["nodes"])
```

#### Test: SSE Reconnection with Last-Event-ID
```python
@pytest.mark.integration
async def test_sse_reconnection(test_db, test_user, async_client):
    """
    Verify SSE supports reconnection with event replay.
    """
    execution_id = await start_long_running_workflow(test_user)

    # First connection - receive some events
    first_events = await receive_sse_events(execution_id, count=3)
    last_event_id = first_events[-1]["id"]

    # Disconnect and reconnect with Last-Event-ID
    reconnected_events = await receive_sse_events(
        execution_id,
        last_event_id=last_event_id
    )

    # Verify events after last_event_id are replayed
    assert reconnected_events[0]["id"] != last_event_id
    # Events should pick up where we left off
```

### 7. Credit Flow

**File:** `python-backend/tests/integration/test_credit_enforcement.py`

#### Test: Credit Deduction on Execution
```python
@pytest.mark.integration
async def test_credit_deduction_accuracy(test_db, test_user):
    """
    Verify credits are deducted accurately after execution.
    """
    initial_balance = test_user.credit_balance

    workflow = create_workflow_with_known_cost()  # ~10 credits

    result = await execute_workflow(workflow, test_user)

    # Refresh user
    test_user = await get_user(test_user.id)

    assert test_user.credit_balance < initial_balance
    assert abs((initial_balance - test_user.credit_balance) - 10.0) < 0.5  # Allow small variance
```

#### Test: Insufficient Credits Blocks Execution
```python
@pytest.mark.integration
async def test_insufficient_credits_blocks_execution(test_db, test_user_low_balance):
    """
    Verify execution fails with HTTP 402 when balance too low.
    """
    workflow = create_high_cost_workflow()  # Requires 100 credits

    with pytest.raises(HTTPException) as exc:
        await execute_workflow(workflow, test_user_low_balance)

    assert exc.value.status_code == 402
    assert "insufficient credits" in exc.value.detail.lower()
```

### 8. Multi-Tenant Isolation

**File:** `python-backend/tests/integration/test_tenant_isolation.py`

#### Test: Workflows Scoped to Tenant
```python
@pytest.mark.integration
async def test_workflow_tenant_isolation(test_db, user_tenant_a, user_tenant_b):
    """
    Verify users can only see workflows from their own tenant.
    """
    # User A saves workflow
    workflow_a = await save_workflow(
        workflow=create_sample_workflow(),
        name="Tenant A Workflow",
        user=user_tenant_a
    )

    # User B lists workflows
    workflows_b = await list_workflows(user=user_tenant_b)

    # User B should not see User A's workflow
    assert not any(w["id"] == workflow_a["id"] for w in workflows_b)
```

#### Test: Execution Reports Scoped to Tenant
```python
@pytest.mark.integration
async def test_execution_report_tenant_isolation(test_db, user_tenant_a, user_tenant_b):
    """
    Verify execution reports respect tenant boundaries.
    """
    # User A executes workflow
    execution_id = await execute_workflow(
        create_sample_workflow(),
        user_tenant_a
    )

    # User B tries to access execution report
    with pytest.raises(HTTPException) as exc:
        await get_execution_report(execution_id, user=user_tenant_b)

    assert exc.value.status_code == 404  # Not found (due to tenant filter)
```

## Test Fixtures

### Common Fixtures

```python
# python-backend/tests/conftest.py

@pytest.fixture
async def test_user(test_db):
    """User with standard credit balance."""
    user = User(
        email="test@example.com",
        credit_balance=100.0,
        current_tenant_id="tenant-test"
    )
    test_db.add(user)
    await test_db.commit()
    return user

@pytest.fixture
async def test_user_low_balance(test_db):
    """User with insufficient credits."""
    user = User(
        email="lowcredits@example.com",
        credit_balance=1.0,
        current_tenant_id="tenant-test"
    )
    test_db.add(user)
    await test_db.commit()
    return user

@pytest.fixture
async def mock_rag_collection(test_db):
    """RAG collection with sample documents."""
    collection = RAGCollection(
        name="test_collection",
        documents=[
            Document(content="RAG stands for Retrieval Augmented Generation"),
            Document(content="It combines retrieval with LLM generation"),
        ]
    )
    test_db.add(collection)
    await test_db.commit()
    return collection
```

## Running Tests

```bash
# Run all integration tests
cd python-backend
pytest tests/integration/ -v -m integration

# Run specific category
pytest tests/integration/test_workflow_e2e.py -v

# Run with coverage
pytest tests/integration/ --cov=app --cov-report=html

# Run in parallel
pytest tests/integration/ -n auto
```

## Success Criteria

- [ ] All E2E tests pass
- [ ] Template lifecycle tests pass
- [ ] SSE streaming tests pass
- [ ] Credit enforcement tests pass
- [ ] Tenant isolation tests pass
- [ ] Coverage > 80% for orchestrator module
- [ ] No flaky tests (all tests pass 3 consecutive runs)

## Notes

- Integration tests require database setup (use `test_db` fixture)
- Mock external services (LLM APIs, media generation) to avoid costs
- Use `@pytest.mark.integration` for all tests in this suite
- Tests should clean up after themselves (fixtures handle this)
- Execution time target: < 5 minutes for full suite
