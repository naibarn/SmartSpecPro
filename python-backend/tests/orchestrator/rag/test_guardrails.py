"""Tests for RetrievalGuardrails — quality assessment and tenant failure modes."""

import pytest
from app.orchestrator.rag.guardrails import (
    RetrievalGuardrails,
    RetrievalQuality,
    QualityAssessment,
)
from app.orchestrator.rag.hybrid_rag import Document, RAGResult, SearchMode


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _make_docs(scores: list[float]) -> list[Document]:
    """Create Documents with the given final_score values."""
    return [
        Document(doc_id=f"doc-{i}", content=f"Content {i}", final_score=s)
        for i, s in enumerate(scores)
    ]


def _make_rag_result(scores: list[float]) -> RAGResult:
    """Create a RAGResult populated with documents of given final_scores."""
    return RAGResult(
        query="test query",
        documents=_make_docs(scores),
        final_count=len(scores),
    )


# ---------------------------------------------------------------------------
# RetrievalQuality enum
# ---------------------------------------------------------------------------

class TestRetrievalQuality:
    """Tests for the RetrievalQuality enum values."""

    def test_enum_has_all_members(self):
        """Enum should have HIGH, MEDIUM, LOW, FAILED members."""
        assert hasattr(RetrievalQuality, "HIGH")
        assert hasattr(RetrievalQuality, "MEDIUM")
        assert hasattr(RetrievalQuality, "LOW")
        assert hasattr(RetrievalQuality, "FAILED")

    def test_enum_string_values(self):
        """String values should match expected lowercase names."""
        assert RetrievalQuality.HIGH == "high"
        assert RetrievalQuality.MEDIUM == "medium"
        assert RetrievalQuality.LOW == "low"
        assert RetrievalQuality.FAILED == "failed"


# ---------------------------------------------------------------------------
# QualityAssessment dataclass
# ---------------------------------------------------------------------------

class TestQualityAssessment:
    """Tests for QualityAssessment dataclass."""

    def test_all_fields_present(self):
        """Dataclass should have all required fields."""
        qa = QualityAssessment(
            quality=RetrievalQuality.HIGH,
            confidence_score=0.85,
            top_score=0.9,
            avg_score=0.75,
            doc_count=5,
            recommended_action="proceed",
            explanation="Good quality results.",
        )
        assert qa.quality == RetrievalQuality.HIGH
        assert qa.confidence_score == 0.85
        assert qa.top_score == 0.9
        assert qa.avg_score == 0.75
        assert qa.doc_count == 5
        assert qa.recommended_action == "proceed"
        assert qa.explanation == "Good quality results."


# ---------------------------------------------------------------------------
# Guardrails.assess()
# ---------------------------------------------------------------------------

class TestGuardrailsAssess:
    """Tests for RetrievalGuardrails.assess() method."""

    @pytest.fixture
    def guardrails_strict(self):
        return RetrievalGuardrails(failure_mode="strict")

    @pytest.fixture
    def guardrails_permissive(self):
        return RetrievalGuardrails(failure_mode="permissive")

    def test_empty_result_is_failed(self, guardrails_strict):
        """Empty RAGResult (no documents) should produce FAILED quality."""
        result = _make_rag_result([])
        assessment = guardrails_strict.assess(result)
        assert assessment.quality == RetrievalQuality.FAILED
        assert assessment.confidence_score == 0.0
        assert assessment.recommended_action == "refuse_answer"

    def test_all_scores_below_low_threshold_is_failed(self, guardrails_strict):
        """All doc scores below 0.15 should produce FAILED quality."""
        result = _make_rag_result([0.1, 0.05, 0.12])
        assessment = guardrails_strict.assess(result)
        assert assessment.quality == RetrievalQuality.FAILED

    def test_scores_in_low_range(self, guardrails_strict):
        """Scores in range 0.15-0.4 should produce LOW quality."""
        result = _make_rag_result([0.3, 0.2, 0.15])
        assessment = guardrails_strict.assess(result)
        assert assessment.quality == RetrievalQuality.LOW

    def test_scores_in_medium_range(self, guardrails_strict):
        """Scores in range 0.4-0.7 should produce MEDIUM quality."""
        result = _make_rag_result([0.6, 0.5, 0.45])
        assessment = guardrails_strict.assess(result)
        assert assessment.quality == RetrievalQuality.MEDIUM

    def test_high_scores(self, guardrails_strict):
        """Scores >= 0.7 with multiple docs should produce HIGH quality."""
        result = _make_rag_result([0.9, 0.85, 0.75])
        assessment = guardrails_strict.assess(result)
        assert assessment.quality == RetrievalQuality.HIGH

    def test_strict_low_quality_refuses(self, guardrails_strict):
        """Strict mode + LOW quality -> refuse_answer."""
        result = _make_rag_result([0.3, 0.2])
        assessment = guardrails_strict.assess(result)
        assert assessment.recommended_action == "refuse_answer"

    def test_permissive_low_quality_warns(self, guardrails_permissive):
        """Permissive mode + LOW quality -> warn_user."""
        result = _make_rag_result([0.3, 0.2])
        assessment = guardrails_permissive.assess(result)
        assert assessment.recommended_action == "warn_user"

    def test_strict_failed_refuses(self, guardrails_strict):
        """Strict mode + FAILED -> refuse_answer."""
        result = _make_rag_result([0.05])
        assessment = guardrails_strict.assess(result)
        assert assessment.recommended_action == "refuse_answer"

    def test_permissive_failed_refuses(self, guardrails_permissive):
        """Permissive mode + FAILED -> refuse_answer (even permissive refuses on FAILED)."""
        result = _make_rag_result([0.05])
        assessment = guardrails_permissive.assess(result)
        assert assessment.recommended_action == "refuse_answer"

    def test_confidence_score_range(self, guardrails_strict):
        """Confidence score should be between 0.0 and 1.0."""
        result = _make_rag_result([0.5, 0.4])
        assessment = guardrails_strict.assess(result)
        assert 0.0 <= assessment.confidence_score <= 1.0

    def test_doc_count_reflects_documents(self, guardrails_strict):
        """doc_count should reflect the number of documents in the RAGResult."""
        result = _make_rag_result([0.8, 0.7, 0.6, 0.5])
        assessment = guardrails_strict.assess(result)
        assert assessment.doc_count == 4

    def test_explanation_is_nonempty(self, guardrails_strict):
        """Explanation should be a non-empty string."""
        result = _make_rag_result([0.8])
        assessment = guardrails_strict.assess(result)
        assert isinstance(assessment.explanation, str)
        assert len(assessment.explanation) > 0


# ---------------------------------------------------------------------------
# build_system_prompt_suffix()
# ---------------------------------------------------------------------------

class TestGuardrailsSystemPrompt:
    """Tests for build_system_prompt_suffix()."""

    def test_high_quality_suffix(self):
        """HIGH quality should instruct LLM to answer from context and cite."""
        g = RetrievalGuardrails(failure_mode="strict")
        qa = QualityAssessment(
            quality=RetrievalQuality.HIGH,
            confidence_score=0.9,
            top_score=0.9,
            avg_score=0.8,
            doc_count=3,
            recommended_action="proceed",
            explanation="High quality.",
        )
        suffix = g.build_system_prompt_suffix(qa)
        assert "context" in suffix.lower() or "cite" in suffix.lower()

    def test_medium_permissive_suffix(self):
        """MEDIUM quality (permissive) should warn about incompleteness."""
        g = RetrievalGuardrails(failure_mode="permissive")
        qa = QualityAssessment(
            quality=RetrievalQuality.MEDIUM,
            confidence_score=0.5,
            top_score=0.5,
            avg_score=0.45,
            doc_count=2,
            recommended_action="proceed",
            explanation="Medium quality.",
        )
        suffix = g.build_system_prompt_suffix(qa)
        assert "incomplete" in suffix.lower() or "uncertain" in suffix.lower()

    def test_low_permissive_suffix(self):
        """LOW quality (permissive) should instruct prefixing uncertain parts."""
        g = RetrievalGuardrails(failure_mode="permissive")
        qa = QualityAssessment(
            quality=RetrievalQuality.LOW,
            confidence_score=0.2,
            top_score=0.25,
            avg_score=0.2,
            doc_count=2,
            recommended_action="warn_user",
            explanation="Low quality.",
        )
        suffix = g.build_system_prompt_suffix(qa)
        assert "limited" in suffix.lower()

    def test_failed_strict_suffix(self):
        """FAILED or LOW (strict) should say no relevant info, do NOT use training data."""
        g = RetrievalGuardrails(failure_mode="strict")
        qa = QualityAssessment(
            quality=RetrievalQuality.FAILED,
            confidence_score=0.0,
            top_score=0.0,
            avg_score=0.0,
            doc_count=0,
            recommended_action="refuse_answer",
            explanation="Failed.",
        )
        suffix = g.build_system_prompt_suffix(qa)
        assert "no relevant" in suffix.lower() or "do not" in suffix.lower()

    def test_suffix_always_nonempty(self):
        """Suffix should be a non-empty string for every quality level."""
        g = RetrievalGuardrails(failure_mode="permissive")
        for quality in RetrievalQuality:
            qa = QualityAssessment(
                quality=quality,
                confidence_score=0.5,
                top_score=0.5,
                avg_score=0.5,
                doc_count=1,
                recommended_action="proceed",
                explanation="Test.",
            )
            suffix = g.build_system_prompt_suffix(qa)
            assert isinstance(suffix, str)
            assert len(suffix) > 0


# ---------------------------------------------------------------------------
# Custom thresholds
# ---------------------------------------------------------------------------

class TestGuardrailsCustomThresholds:
    """Tests for tenant-configurable score thresholds."""

    def test_custom_high_threshold(self):
        """Custom high_threshold=0.8 should require higher scores for HIGH."""
        g = RetrievalGuardrails(failure_mode="strict", high_threshold=0.8)
        # 0.75 is below custom threshold, should be MEDIUM
        result = _make_rag_result([0.75])
        assessment = g.assess(result)
        assert assessment.quality == RetrievalQuality.MEDIUM

    def test_custom_thresholds_via_constructor(self):
        """All custom thresholds should be configurable via constructor."""
        g = RetrievalGuardrails(
            failure_mode="permissive",
            high_threshold=0.9,
            medium_threshold=0.5,
            low_threshold=0.2,
        )
        # Score 0.6 is above custom medium (0.5) but below high (0.9)
        result = _make_rag_result([0.6])
        assessment = g.assess(result)
        assert assessment.quality == RetrievalQuality.MEDIUM


# ---------------------------------------------------------------------------
# Metadata leakage prevention
# ---------------------------------------------------------------------------

class TestMetadataLeakagePrevention:
    """Tests for metadata leakage prevention on FAILED/LOW quality responses."""

    def test_failed_explanation_no_doc_titles(self):
        """FAILED quality explanation should not include document titles."""
        g = RetrievalGuardrails(failure_mode="strict")
        docs = [
            Document(
                doc_id="doc-1",
                content="Secret content",
                final_score=0.05,
                metadata={"title": "Confidential Report"},
            ),
        ]
        result = RAGResult(query="test", documents=docs, final_count=1)
        assessment = g.assess(result)
        assert "Confidential" not in assessment.explanation
        assert "Secret" not in assessment.explanation

    def test_low_strict_explanation_no_hints(self):
        """LOW quality in strict mode should not hint at document existence."""
        g = RetrievalGuardrails(failure_mode="strict")
        result = _make_rag_result([0.25, 0.2])
        assessment = g.assess(result)
        # Should not mention specific doc details
        assert "doc-" not in assessment.explanation
