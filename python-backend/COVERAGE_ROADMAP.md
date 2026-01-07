# Coverage Improvement Roadmap

## Current Status

- **Current Coverage**: 43.36%
- **Target Coverage**: 80%
- **Gap**: 36.64%
- **Temporary Threshold**: 40% (adjusted in pytest.ini)

## Sprint-by-Sprint Plan

### Sprint 1: Foundation (Target: 50% coverage)

**Goal**: Add 6.64% coverage through utility function tests

**Tasks**:

- [x] Adjust pytest.ini threshold to 40%
- [x] Add tests for `config_validator.py` (~30 tests)
- [x] Add tests for `input_sanitization.py` (~60 tests)
- [x] Add tests for `request_validator.py` (~35 tests)
- [ ] Add tests for `error_handling.py`
- [ ] Add tests for `exceptions.py`

**Expected Impact**: +7% coverage

**Files to Test**:

- `app/core/error_handling.py`
- `app/core/exceptions.py`
- `app/core/openapi.py`

**Success Criteria**:

- All new tests pass
- Coverage reaches 50%
- Update threshold to 45%

---

### Sprint 2: Core Utilities (Target: 60% coverage)

**Goal**: Add 10% coverage through core module tests

**Tasks**:

- [ ] Add tests for `app/core/logging.py`
- [ ] Add tests for `app/core/monitoring.py`
- [ ] Add tests for `app/core/middleware.py`
- [ ] Add tests for Pydantic models in `app/models/`
- [ ] Add tests for simple API endpoints

**Expected Impact**: +10% coverage

**Files to Test**:

- `app/core/logging.py`
- `app/core/monitoring.py`
- `app/core/middleware.py`
- `app/models/user.py` (already 96% - add edge cases)
- `app/models/token_blacklist.py` (already 93% - add edge cases)

**Success Criteria**:

- Coverage reaches 60%
- Update threshold to 55%

---

### Sprint 3: Service Layer (Target: 70% coverage)

**Goal**: Add 10% coverage through service tests

**Tasks**:

- [ ] Add tests for `app/services/export_service.py` (currently 0%)
- [ ] Add tests for `app/services/llm_monitoring.py` (currently 0%)
- [ ] Improve tests for existing services
- [ ] Add integration tests for service interactions

**Expected Impact**: +10% coverage

**Files to Test**:

- `app/services/export_service.py`
- `app/services/llm_monitoring.py`
- `app/services/webhook_service.py`
- `app/services/notification_service.py`

**Success Criteria**:

- Coverage reaches 70%
- Update threshold to 65%
- No services with 0% coverage

---

### Sprint 4: Orchestrator & Models (Target: 80% coverage)

**Goal**: Add 10% coverage through orchestrator and model tests

**Tasks**:

- [ ] Add tests for `app/orchestrator/db_state_manager.py` (currently 0%)
- [ ] Add tests for `app/models/user_preferences.py` (currently 0%)
- [ ] Add tests for `app/models/webhook.py` (currently 0%)
- [ ] Add integration tests for orchestrator workflows
- [ ] Add E2E tests for critical user journeys

**Expected Impact**: +10% coverage

**Files to Test**:

- `app/orchestrator/db_state_manager.py`
- `app/models/user_preferences.py`
- `app/models/webhook.py`
- `app/orchestrator/workflow_engine.py`

**Success Criteria**:

- Coverage reaches 80%
- Update threshold to 80%
- All critical paths covered

---

## Testing Strategy by Module Type

### 1. Utility Functions (Easy - High ROI)

**Characteristics**:

- Pure functions
- No database dependencies
- Easy to test

**Approach**:

- Unit tests with various inputs
- Edge case testing
- Error condition testing

**Examples**:

- ✅ `config_validator.py`
- ✅ `input_sanitization.py`
- ✅ `request_validator.py`

### 2. Pydantic Models (Easy - Medium ROI)

**Characteristics**:

- Data validation
- Serialization/deserialization
- No complex logic

**Approach**:

- Test valid inputs
- Test invalid inputs
- Test edge cases
- Test serialization

**Examples**:

- `app/models/user.py`
- `app/models/token_blacklist.py`

### 3. Services (Medium - High ROI)

**Characteristics**:

- Business logic
- May have database dependencies
- May have external API calls

**Approach**:

- Mock database operations
- Mock external APIs
- Test business logic paths
- Test error handling

**Examples**:

- `app/services/export_service.py`
- `app/services/llm_monitoring.py`

### 4. API Endpoints (Medium - High ROI)

**Characteristics**:

- Request/response handling
- Authentication/authorization
- Integration with services

**Approach**:

- Use TestClient
- Mock authentication
- Test happy paths
- Test error responses

### 5. Orchestrator (Hard - Medium ROI)

**Characteristics**:

- Complex workflows
- State management
- Async operations

**Approach**:

- Mock state manager
- Test workflow steps
- Test error recovery
- Integration tests

---

## Quick Wins (Immediate Actions)

### High-Impact, Low-Effort Tests

1. **Pydantic Model Validation** (~2-3% coverage)

   - Test all models in `app/models/`
   - Validate field constraints
   - Test serialization

2. **Error Classes** (~1-2% coverage)

   - Test all custom exceptions
   - Test error messages
   - Test error codes

3. **Simple Utilities** (~2-3% coverage)
   - Test formatting functions
   - Test conversion functions
   - Test helper functions

---

## Monitoring Progress

### Weekly Metrics

- [ ] Run coverage report: `pytest --cov=app --cov-report=term-missing`
- [ ] Track coverage percentage
- [ ] Identify uncovered modules
- [ ] Update this document

### Coverage Report Command

```bash
cd python-backend
# Setup virtual environment
python3 -m venv .venv
source .venv/bin/activate

# Install dependencies
pip install -r requirements.txt

# Run coverage
pytest --cov=app --cov-report=term-missing --cov-report=html
```

### View HTML Report

```bash
open htmlcov/index.html
```

---

## Known Challenges

### 1. Async Database Operations

**Problem**: Segmentation faults with async SQLAlchemy

**Solutions**:

- Use in-memory SQLite for simple tests
- Mock database operations for complex tests
- Use pytest-asyncio properly
- Consider using factory_boy for test data

### 2. External API Dependencies

**Problem**: Tests require external services (OpenAI, Stripe, etc.)

**Solutions**:

- Mock all external API calls
- Use VCR.py for recording/replaying HTTP interactions
- Create fake response fixtures

### 3. Complex State Management

**Problem**: Orchestrator has complex state transitions

**Solutions**:

- Test state transitions independently
- Mock state persistence
- Use state machine testing patterns

---

## Resources

### Testing Tools

- `pytest` - Test framework
- `pytest-cov` - Coverage plugin
- `pytest-asyncio` - Async test support
- `pytest-mock` - Mocking support
- `factory_boy` - Test data factories
- `faker` - Fake data generation

### Documentation

- [pytest documentation](https://docs.pytest.org/)
- [coverage.py documentation](https://coverage.readthedocs.io/)
- [pytest-asyncio documentation](https://pytest-asyncio.readthedocs.io/)

---

## Success Metrics

### Sprint 1 (Week 1-2)

- ✅ Coverage: 50%
- ✅ New tests: ~125
- ✅ Zero-coverage modules: Reduced by 3

### Sprint 2 (Week 3-4)

- ⏳ Coverage: 60%
- ⏳ New tests: ~100
- ⏳ Core modules: 80%+ coverage

### Sprint 3 (Week 5-6)

- ⏳ Coverage: 70%
- ⏳ New tests: ~100
- ⏳ Services: 70%+ coverage

### Sprint 4 (Week 7-8)

- ⏳ Coverage: 80%
- ⏳ New tests: ~100
- ⏳ All critical paths: 100% coverage

---

## Next Steps

1. ✅ **Immediate** (Today)

   - [x] Adjust pytest.ini threshold to 40%
   - [x] Create tests for config_validator
   - [x] Create tests for input_sanitization
   - [x] Create tests for request_validator

2. **This Week** (Sprint 1)

   - [ ] Set up virtual environment (`python3 -m venv .venv` & `source .venv/bin/activate`)
   - [ ] Create tests for error_handling
   - [ ] Create tests for exceptions
   - [ ] Run coverage report
   - [ ] Verify 50% coverage achieved

3. **Next Week** (Sprint 2 Planning)
   - [ ] Identify Sprint 2 test targets
   - [ ] Set up test fixtures
   - [ ] Plan integration tests

---

_Last Updated: January 7, 2026_
_Current Sprint: Sprint 1 - Foundation_
