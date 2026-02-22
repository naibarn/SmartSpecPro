"""
SmartSpec Pro - Retrieval Guardrails
Phase 2: Quality & Intelligence

Quality assessment for RAG retrieval results with tenant-configurable
failure modes and metadata leakage prevention.
"""

from __future__ import annotations

from dataclasses import dataclass
from enum import Enum
from typing import TYPE_CHECKING

import structlog

if TYPE_CHECKING:
    from app.orchestrator.rag.hybrid_rag import RAGResult

logger = structlog.get_logger()


class RetrievalQuality(str, Enum):
    """Quality level of retrieval results."""
    HIGH = "high"
    MEDIUM = "medium"
    LOW = "low"
    FAILED = "failed"


@dataclass
class QualityAssessment:
    """Result of a retrieval quality assessment."""
    quality: RetrievalQuality
    confidence_score: float
    top_score: float
    avg_score: float
    doc_count: int
    recommended_action: str  # "proceed", "warn_user", "refuse_answer"
    explanation: str


class RetrievalGuardrails:
    """
    Retrieval quality assessment with tenant-configurable failure modes.

    Failure modes:
    - "strict": refuse answer on LOW quality (enterprise default)
    - "permissive": warn user on LOW quality (general default)

    Both modes refuse on FAILED quality.
    """

    def __init__(
        self,
        failure_mode: str = "strict",
        high_threshold: float = 0.7,
        medium_threshold: float = 0.4,
        low_threshold: float = 0.15,
    ):
        if failure_mode not in ("strict", "permissive"):
            raise ValueError(
                f"failure_mode must be 'strict' or 'permissive', got '{failure_mode}'"
            )
        self.failure_mode = failure_mode
        self.high_threshold = high_threshold
        self.medium_threshold = medium_threshold
        self.low_threshold = low_threshold

    def assess(self, rag_result: RAGResult) -> QualityAssessment:
        """
        Assess the quality of a RAG retrieval result.

        Args:
            rag_result: RAGResult with documents to assess.

        Returns:
            QualityAssessment with quality level and recommended action.
        """
        documents = rag_result.documents

        if not documents:
            return QualityAssessment(
                quality=RetrievalQuality.FAILED,
                confidence_score=0.0,
                top_score=0.0,
                avg_score=0.0,
                doc_count=0,
                recommended_action="refuse_answer",
                explanation="No relevant information was found in the knowledge base.",
            )

        scores = [doc.final_score for doc in documents]
        top_score = max(scores)
        avg_score = sum(scores) / len(scores)
        doc_count = len(documents)

        # Determine quality level
        if top_score >= self.high_threshold:
            quality = RetrievalQuality.HIGH
        elif top_score >= self.medium_threshold:
            quality = RetrievalQuality.MEDIUM
        elif top_score >= self.low_threshold:
            quality = RetrievalQuality.LOW
        else:
            quality = RetrievalQuality.FAILED

        # Determine recommended action
        if quality == RetrievalQuality.HIGH:
            action = "proceed"
        elif quality == RetrievalQuality.MEDIUM:
            action = "proceed"
        elif quality == RetrievalQuality.LOW:
            if self.failure_mode == "strict":
                action = "refuse_answer"
            else:
                action = "warn_user"
        else:  # FAILED
            action = "refuse_answer"

        # Confidence score
        confidence_score = min(top_score, 1.0)

        # Generate explanation — prevent metadata leakage for FAILED/LOW strict
        explanation = self._build_explanation(quality, doc_count, top_score)

        logger.debug(
            "guardrails_assessment",
            quality=quality.value,
            top_score=top_score,
            avg_score=avg_score,
            doc_count=doc_count,
            action=action,
        )

        return QualityAssessment(
            quality=quality,
            confidence_score=confidence_score,
            top_score=top_score,
            avg_score=avg_score,
            doc_count=doc_count,
            recommended_action=action,
            explanation=explanation,
        )

    def _build_explanation(
        self,
        quality: RetrievalQuality,
        doc_count: int,
        top_score: float,
    ) -> str:
        """Build a human-readable explanation without leaking metadata."""
        if quality == RetrievalQuality.FAILED:
            return "No relevant information was found in the knowledge base."

        if quality == RetrievalQuality.LOW and self.failure_mode == "strict":
            return "Very limited relevant information was found."

        if quality == RetrievalQuality.LOW:
            return (
                f"Limited relevant information found ({doc_count} results "
                f"with low confidence)."
            )

        if quality == RetrievalQuality.MEDIUM:
            return (
                f"Partial match found ({doc_count} results with moderate confidence)."
            )

        # HIGH
        return (
            f"Strong match found ({doc_count} results with high confidence)."
        )

    def build_system_prompt_suffix(self, assessment: QualityAssessment) -> str:
        """
        Build a system prompt suffix to guide LLM behavior based on quality.

        Returns:
            String to append to the system prompt.
        """
        quality = assessment.quality

        if quality == RetrievalQuality.HIGH:
            return (
                "Answer based ONLY on the provided context. "
                "Cite sources using [Source N] markers where applicable."
            )

        if quality == RetrievalQuality.MEDIUM:
            if self.failure_mode == "permissive":
                return (
                    "The retrieved context may be incomplete. "
                    "Answer based on the provided context but clearly state "
                    "any uncertainty. Do not fabricate information."
                )
            return (
                "The retrieved context may be incomplete. "
                "Answer based on the provided context and clearly indicate "
                "uncertain or inferred information."
            )

        if quality == RetrievalQuality.LOW:
            if self.failure_mode == "permissive":
                return (
                    "Very limited information was found. "
                    "Prefix uncertain parts with 'Based on limited information:'. "
                    "Do not present uncertain information as fact."
                )
            # strict LOW — same as FAILED
            return (
                "No relevant information was found in the knowledge base. "
                "Do NOT answer from training data. Inform the user that "
                "no relevant information is available."
            )

        # FAILED (both modes)
        return (
            "No relevant information was found in the knowledge base. "
            "Do NOT answer from training data. Inform the user that "
            "no relevant information is available."
        )
