## ข้อเสนอแนวทางการเพิ่ม Coverage สำหรับ 3 ไฟล์ที่มี Coverage ต่ำสุด

### 1. `app/orchestrator/state_manager.py` (11.71%)

**สาเหตุหลัก:**
- **No Unit Tests:** ไม่มีไฟล์ test สำหรับ `state_manager.py` โดยเฉพาะ
- **In-Memory State:** การทดสอบขึ้นอยู่กับ state ที่เก็บใน memory ทำให้ยากต่อการทดสอบแต่ละ function แยกกัน
- **Complex Logic:** `update_step_status` มี logic ที่ซับซ้อนและหลายเงื่อนไข

**แนวทางการเพิ่ม Coverage:**

1. **สร้าง `test_state_manager.py`:**
   - สร้างไฟล์ test ใหม่ใน `tests/unit/orchestrator/`
   - เขียน tests สำหรับแต่ละ public method

2. **ใช้ `pytest.fixture`:**
   - สร้าง fixture เพื่อ setup `StateManager` ที่สะอาดในแต่ละ test
   - ทำให้ test เป็นอิสระต่อกัน

3. **ทดสอบ `update_step_status` อย่างละเอียด:**
   - สร้าง test case สำหรับแต่ละ status (RUNNING, COMPLETED, FAILED)
   - ตรวจสอบว่า `total_duration_seconds`, `completed_steps`, `progress_percentage` ถูกคำนวณถูกต้อง
   - ตรวจสอบว่า `total_cost` และ `total_tokens_used` ถูกบวกค่าถูกต้อง

4. **ทดสอบ Edge Cases:**
   - ทดสอบกรณีที่ `execution_id` หรือ `step_id` ไม่ถูกต้อง
   - ทดสอบ `cleanup_old_executions` ว่าลบ state ที่เก่ากว่าวันที่กำหนดจริง

**ตัวอย่าง Test Case:**
```python
@pytest.fixture
def state_manager():
    return StateManager()

def test_create_execution(state_manager):
    state = state_manager.create_execution("wf-1", "prompt", "goal")
    assert state.workflow_id == "wf-1"
    assert state.status == ExecutionStatus.PENDING

def test_update_step_status_completed(state_manager):
    state = state_manager.create_execution("wf-1", "p", "g", total_steps=2)
    state_manager.add_step(state.execution_id, "step-1", "s1", "d1")
    state_manager.update_step_status(state.execution_id, "step-1", ExecutionStatus.COMPLETED)
    
    updated_state = state_manager.get_state(state.execution_id)
    assert updated_state.completed_steps == 1
    assert updated_state.progress_percentage == 50.0
```

### 2. `app/services/moderation_service.py` (20.55%)

**สาเหตุหลัก:**
- **External Dependencies:** ขึ้นอยู่กับ OpenAI API และ database (AsyncSession)
- **No Unit Tests:** ไม่มีไฟล์ test สำหรับ `moderation_service.py`
- **Complex Logic:** `moderate_request` มีหลายขั้นตอน (keyword, OpenAI, pattern) และหลายเงื่อนไข (strict_mode)

**แนวทางการเพิ่ม Coverage:**

1. **สร้าง `test_moderation_service.py`:**
   - สร้างไฟล์ test ใหม่ใน `tests/unit/services/`

2. **Mock Dependencies:**
   - ใช้ `unittest.mock.AsyncMock` เพื่อ mock `AsyncSession` และ `AsyncOpenAI`
   - ทำให้สามารถทดสอบ logic ของ service ได้โดยไม่ต้องเชื่อมต่อ external services จริง

3. **ทดสอบ `moderate_request` ทุก path:**
   - **Keyword blocked:** ทดสอบกรณีที่เจอ keyword ที่ถูก block
   - **OpenAI flagged (strict):** ทดสอบกรณีที่ OpenAI flag และ `strict_mode=True`
   - **OpenAI flagged (non-strict):** ทดสอบกรณีที่ OpenAI flag และ `strict_mode=False`
   - **OpenAI API error:** ทดสอบกรณีที่ OpenAI API fail และ fallback ไปใช้ pattern matching
   - **Pattern flagged:** ทดสอบกรณีที่เจอ sensitive pattern
   - **Allowed:** ทดสอบกรณีที่ไม่เจออะไรผิดปกติ

4. **ทดสอบ `moderate_response`:**
   - ทดสอบกรณีที่ response ถูก filter และ allowed

**ตัวอย่าง Test Case:**
```python
@pytest.fixture
def mock_db():
    return AsyncMock(spec=AsyncSession)

@pytest.fixture
def mock_openai_client():
    return AsyncMock(spec=AsyncOpenAI)

@pytest.mark.asyncio
async def test_moderate_request_keyword_blocked(mock_db):
    service = ModerationService(mock_db)
    service.BLOCKED_KEYWORDS = ["forbidden"]
    result = await service.moderate_request("user-1", "this is a forbidden word")
    
    assert result["flagged"] is True
    assert result["action"] == "blocked"

@pytest.mark.asyncio
async def test_moderate_request_openai_api_error(mock_db, mock_openai_client):
    mock_openai_client.moderations.create.side_effect = Exception("API down")
    service = ModerationService(mock_db)
    service.openai_client = mock_openai_client
    
    # Should fallback to pattern matching and pass
    result = await service.moderate_request("user-1", "this is a normal sentence")
    
    assert result["flagged"] is False
    assert result["action"] == "allowed"
```

### 3. `app/llm_proxy/gateway_unified.py` (21.60%)

**สาเหตุหลัก:**
- **Complex Dependencies:** ขึ้นอยู่กับ `CreditService`, `LLMProxy`, `UnifiedLLMClient` และ database
- **No Unit Tests:** ไม่มีไฟล์ test สำหรับ `gateway_unified.py`
- **Error Handling:** `HTTPException` ทำให้การทดสอบ error path ทำได้ยาก

**แนวทางการเพิ่ม Coverage:**

1. **สร้าง `test_gateway_unified.py`:**
   - สร้างไฟล์ test ใหม่ใน `tests/unit/llm_proxy/`

2. **Mock Dependencies:**
   - Mock `CreditService`, `LLMProxy`, `UnifiedLLMClient` และ `User` object
   - ทำให้สามารถทดสอบ logic ของ gateway ได้อย่างสมบูรณ์

3. **ทดสอบ `invoke` ทุก path:**
   - **Insufficient credits:** ทดสอบว่า `HTTPException` (402) ถูก raise เมื่อ credit ไม่พอ
   - **OpenRouter success:** ทดสอบการเรียก `_invoke_via_openrouter`
   - **Direct success:** ทดสอบการเรียก `_invoke_via_direct`
   - **LLM error:** ทดสอบว่า `HTTPException` (500) ถูก raise เมื่อ LLM call fail
   - **Credit deduction:** ตรวจสอบว่า `_deduct_credits` ถูกเรียกและคำนวณ cost ถูกต้อง

4. **ทดสอบ Helper Methods:**
   - ทดสอบ `_estimate_cost` และ `_calculate_actual_cost` แยกต่างหาก

**ตัวอย่าง Test Case:**
```python
@pytest.fixture
def mock_credit_service():
    service = AsyncMock(spec=CreditService)
    service.check_sufficient_credits.return_value = True
    return service

@pytest.fixture
def mock_llm_proxy():
    return AsyncMock(spec=LLMProxy)

@pytest.mark.asyncio
async def test_invoke_insufficient_credits(mock_credit_service):
    mock_credit_service.check_sufficient_credits.return_value = False
    gateway = LLMGateway(AsyncMock())
    gateway.credit_service = mock_credit_service
    
    with pytest.raises(HTTPException) as exc_info:
        await gateway.invoke(LLMRequest(prompt="test"), User(id="user-1"))
    
    assert exc_info.value.status_code == 402

@pytest.mark.asyncio
async def test_invoke_direct_success(mock_credit_service, mock_llm_proxy):
    mock_llm_proxy.invoke.return_value = LLMResponse(content="Direct response", cost=0.01)
    gateway = LLMGateway(AsyncMock())
    gateway.credit_service = mock_credit_service
    gateway.llm_proxy = mock_llm_proxy
    
    response = await gateway.invoke(LLMRequest(prompt="test"), User(id="user-1"), use_openrouter=False)
    
    assert response.content == "Direct response"
    mock_credit_service.deduct_credits.assert_called_once()
```
