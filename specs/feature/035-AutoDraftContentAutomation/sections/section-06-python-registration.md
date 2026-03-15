# Section 06: Python Agent Registration and Tool Bridge

## Overview

This section registers the 4 new content automation builtin tools in the Python agency system so that agents (including the Auto Draft Agent from section 07) can discover and invoke them. It also creates Pydantic request/response models that Python callers use to construct typed payloads for these tools.

**Runtime:** Python (pytest)

## Dependencies

- **Section 02** (builtin-auto-draft): Defines the Node.js endpoint at `/api/internal/tools/auto-draft`
- **Section 03** (builtin-model-suggest): Defines the Node.js endpoint at `/api/internal/tools/model-suggest`
- **Section 04** (builtin-file-parse): Defines the Node.js endpoint at `/api/internal/tools/file-parse`
- **Section 05** (builtin-schedule-draft): Defines the Node.js endpoint at `/api/internal/tools/schedule-draft`

The Node.js endpoints do not need to be running for the Python registration to work -- the registration simply maps tool IDs to URL paths. The actual HTTP calls happen at runtime via `_execute_http()` in `agency_tools.py`.

## Background

The Python agency system uses two dictionaries in `python-backend/app/services/agency_tools.py` to manage builtin tools:

- `_BUILTIN_ENDPOINTS` -- maps tool ID strings (e.g., `"builtin-rag-knowledge"`) to internal URL path suffixes (e.g., `"/api/internal/tools/rag-knowledge"`). At resolution time, these are prefixed with `_INTERNAL_SERVICE_URL` (defaults to `http://127.0.0.1:3000`).
- `_BUILTIN_RISK_LEVELS` -- maps tool ID strings to risk level strings (`"low"`, `"medium"`, `"high"`). Risk level determines execution routing: low tools call directly, medium tools require whitelist, high tools go through sandbox.

## Files to Modify

- `/home/dev/projects/SmartSpecPro/python-backend/app/services/agency_tools.py` -- Add entries to `_BUILTIN_ENDPOINTS` and `_BUILTIN_RISK_LEVELS`

## Files to Create

- `/home/dev/projects/SmartSpecPro/python-backend/app/schemas/content_automation.py` -- Pydantic v2 request/response models
- `/home/dev/projects/SmartSpecPro/python-backend/tests/unit/test_agency_tools_registration.py` -- Registration tests
- `/home/dev/projects/SmartSpecPro/python-backend/tests/unit/test_content_automation_schemas.py` -- Schema validation tests

## Tests (Write First)

### Test File: `python-backend/tests/unit/test_agency_tools_registration.py`

```python
"""Tests for content automation tool registration in agency_tools."""
import pytest

pytestmark = [pytest.mark.unit, pytest.mark.agency]


class TestContentAutomationToolRegistration:

    def test_builtin_auto_draft_registered_in_endpoints(self):
        from app.services.agency_tools import _BUILTIN_ENDPOINTS
        assert _BUILTIN_ENDPOINTS["builtin-auto-draft"] == "/api/internal/tools/auto-draft"

    def test_builtin_model_suggest_registered_in_endpoints(self):
        from app.services.agency_tools import _BUILTIN_ENDPOINTS
        assert _BUILTIN_ENDPOINTS["builtin-model-suggest"] == "/api/internal/tools/model-suggest"

    def test_builtin_file_parse_registered_in_endpoints(self):
        from app.services.agency_tools import _BUILTIN_ENDPOINTS
        assert _BUILTIN_ENDPOINTS["builtin-file-parse"] == "/api/internal/tools/file-parse"

    def test_builtin_schedule_draft_registered_in_endpoints(self):
        from app.services.agency_tools import _BUILTIN_ENDPOINTS
        assert _BUILTIN_ENDPOINTS["builtin-schedule-draft"] == "/api/internal/tools/schedule-draft"

    def test_builtin_auto_draft_risk_level_is_medium(self):
        from app.services.agency_tools import _BUILTIN_RISK_LEVELS
        assert _BUILTIN_RISK_LEVELS["builtin-auto-draft"] == "medium"

    def test_builtin_model_suggest_risk_level_is_low(self):
        from app.services.agency_tools import _BUILTIN_RISK_LEVELS
        assert _BUILTIN_RISK_LEVELS["builtin-model-suggest"] == "low"

    def test_builtin_file_parse_risk_level_is_medium(self):
        from app.services.agency_tools import _BUILTIN_RISK_LEVELS
        assert _BUILTIN_RISK_LEVELS["builtin-file-parse"] == "medium"

    def test_builtin_schedule_draft_risk_level_is_high(self):
        from app.services.agency_tools import _BUILTIN_RISK_LEVELS
        assert _BUILTIN_RISK_LEVELS["builtin-schedule-draft"] == "high"
```

### Test File: `python-backend/tests/unit/test_content_automation_schemas.py`

```python
"""Tests for content automation Pydantic schemas."""
import pytest
from pydantic import ValidationError

pytestmark = [pytest.mark.unit]


class TestAutoDraftRequestSchema:

    def test_validates_topic_min_length(self):
        from app.schemas.content_automation import AutoDraftRequest
        with pytest.raises(ValidationError):
            AutoDraftRequest(topic="ab", user_id=1, tenant_id="t1")

    def test_validates_topic_max_length(self):
        from app.schemas.content_automation import AutoDraftRequest
        with pytest.raises(ValidationError):
            AutoDraftRequest(topic="x" * 1001, user_id=1, tenant_id="t1")

    def test_validates_num_slides_range(self):
        from app.schemas.content_automation import AutoDraftRequest
        with pytest.raises(ValidationError):
            AutoDraftRequest(topic="valid topic", user_id=1, tenant_id="t1", num_slides=0)
        with pytest.raises(ValidationError):
            AutoDraftRequest(topic="valid topic", user_id=1, tenant_id="t1", num_slides=31)

    def test_validates_reference_image_urls_max_length(self):
        from app.schemas.content_automation import AutoDraftRequest
        with pytest.raises(ValidationError):
            AutoDraftRequest(
                topic="valid topic", user_id=1, tenant_id="t1",
                reference_image_urls=["url"] * 6,
            )

    def test_valid_request_accepted(self):
        from app.schemas.content_automation import AutoDraftRequest
        req = AutoDraftRequest(topic="My presentation topic", user_id=1, tenant_id="t1")
        assert req.topic == "My presentation topic"


class TestModelSuggestRequestSchema:

    def test_validates_purpose_enum(self):
        from app.schemas.content_automation import ModelSuggestRequest
        with pytest.raises(ValidationError):
            ModelSuggestRequest(purpose="invalid_purpose")

    def test_accepts_valid_purpose(self):
        from app.schemas.content_automation import ModelSuggestRequest
        for purpose in ("image", "video", "audio", "text"):
            req = ModelSuggestRequest(purpose=purpose)
            assert req.purpose == purpose


class TestFileParseRequestSchema:

    def test_validates_file_type_enum(self):
        from app.schemas.content_automation import FileParseRequest
        with pytest.raises(ValidationError):
            FileParseRequest(file_url="https://example.com/f.csv", file_type="pdf")

    def test_validates_max_rows_default_and_range(self):
        from app.schemas.content_automation import FileParseRequest
        req = FileParseRequest(file_url="https://example.com/f.csv", file_type="csv")
        assert req.max_rows == 100
        with pytest.raises(ValidationError):
            FileParseRequest(file_url="https://example.com/f.csv", file_type="csv", max_rows=101)


class TestScheduleDraftRequestSchema:

    def test_validates_cron_minimum_interval(self):
        from app.schemas.content_automation import ScheduleDraftRequest
        with pytest.raises(ValidationError):
            ScheduleDraftRequest(
                topic_template="Daily {{date}} report",
                schedule_type="recurring",
                cron_expression="* * * * *",
                user_id=1, tenant_id="t1",
            )

    def test_validates_topic_template_placeholders(self):
        from app.schemas.content_automation import ScheduleDraftRequest
        req = ScheduleDraftRequest(
            topic_template="Weekly {{day_of_week}} report for {{date}}",
            schedule_type="recurring",
            cron_expression="0 9 * * 1",
            user_id=1, tenant_id="t1",
        )
        assert "{{date}}" in req.topic_template

    def test_rejects_unsupported_placeholders(self):
        from app.schemas.content_automation import ScheduleDraftRequest
        with pytest.raises(ValidationError):
            ScheduleDraftRequest(
                topic_template="Report for {{username}}",
                schedule_type="recurring",
                cron_expression="0 9 * * 1",
                user_id=1, tenant_id="t1",
            )
```

## Implementation Details

### 1. Add tool entries to `_BUILTIN_ENDPOINTS`

Add 4 entries (plus `builtin-skill-discovery` if not present):

```python
"builtin-auto-draft": "/api/internal/tools/auto-draft",
"builtin-model-suggest": "/api/internal/tools/model-suggest",
"builtin-file-parse": "/api/internal/tools/file-parse",
"builtin-schedule-draft": "/api/internal/tools/schedule-draft",
```

### 2. Add tool entries to `_BUILTIN_RISK_LEVELS`

```python
"builtin-auto-draft": "medium",
"builtin-model-suggest": "low",
"builtin-file-parse": "medium",
"builtin-schedule-draft": "high",
```

**Risk level rationale:**
- `builtin-auto-draft` is **medium** because it triggers credit-consuming generation
- `builtin-model-suggest` is **low** because it is read-only
- `builtin-file-parse` is **medium** because it fetches external URLs (SSRF surface)
- `builtin-schedule-draft` is **high** because it creates persistent scheduled jobs

### 3. Create Pydantic models

Create `/home/dev/projects/SmartSpecPro/python-backend/app/schemas/content_automation.py` with Pydantic v2 models mirroring the Zod schemas from Section 01:

- **AutoDraftRequest** -- topic (min 3, max 1000), user_id, tenant_id, canvas_preset (Literal), num_slides (1-30), reference_image_urls (max 5)
- **AutoDraftResponse** -- success, deck_id, slide_count, credits_used, warnings
- **ModelSuggestRequest** -- purpose (Literal: image/video/audio/text)
- **FileParseRequest** -- file_url, file_type (Literal: csv/xlsx/txt), max_rows (1-100, default 100)
- **ScheduleDraftRequest** -- topic_template (with placeholder validator), schedule_type, cron_expression (with interval validator), user_id, tenant_id

For `ScheduleDraftRequest.cron_expression`, use a `field_validator` to reject sub-hourly intervals.
For `ScheduleDraftRequest.topic_template`, use a `field_validator` to check only `{{date}}` and `{{day_of_week}}` placeholders.

## Running Tests

```bash
cd /home/dev/projects/SmartSpecPro/python-backend
pytest tests/unit/test_agency_tools_registration.py tests/unit/test_content_automation_schemas.py -v
```

## Verification Checklist

1. All 8 registration tests pass
2. All 10 schema validation tests pass
3. Existing tests in `test_agency_tools.py` still pass (no regressions)
4. Pydantic models use v2 syntax (`field_validator` from `pydantic`, not v1 `validator`)
5. All constraints match the Zod schemas from Section 01
