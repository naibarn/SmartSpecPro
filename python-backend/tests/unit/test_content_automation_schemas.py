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
                topic="valid topic",
                user_id=1,
                tenant_id="t1",
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
                user_id=1,
                tenant_id="t1",
            )

    def test_validates_topic_template_placeholders(self):
        from app.schemas.content_automation import ScheduleDraftRequest

        req = ScheduleDraftRequest(
            topic_template="Weekly {{day_of_week}} report for {{date}}",
            schedule_type="recurring",
            cron_expression="0 9 * * 1",
            user_id=1,
            tenant_id="t1",
        )
        assert "{{date}}" in req.topic_template

    def test_rejects_unsupported_placeholders(self):
        from app.schemas.content_automation import ScheduleDraftRequest

        with pytest.raises(ValidationError):
            ScheduleDraftRequest(
                topic_template="Report for {{username}}",
                schedule_type="recurring",
                cron_expression="0 9 * * 1",
                user_id=1,
                tenant_id="t1",
            )
