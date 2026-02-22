"""
Retrieval quality guardrails for multi-tenant RAG.

Assesses retrieval quality and determines the appropriate response strategy
based on document scores and tenant-configurable failure modes.

Quality levels:
  HIGH    - top_score >= 0.7, confident answer
  MEDIUM  - top_score 0.4-0.7, partial confidence
  LOW     - top_score 0.15-0.4, very limited info
  FAILED  - no docs or all below 0.15

Failure modes:
  strict     - refuse answer on LOW/FAILED (enterprise default)
  permissive - warn user on LOW, refuse only on FAILED (general default)
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
    """Quality level of retrieved documents."""
    HIGH = "high"
    MEDIUM = "medium"
    LOW = "low"
    FAILED = "failed"


@dataclass
class QualityAssessment:
    """Result of quality assessment on a RAGResult."""
    quality: RetrievalQuality
    confidence_score: float
    top_score: float
    avg_score: float
    doc_count: int
    recommended_action: str  # "proceed", "warn_user", "refuse_answer"
    explanation: str


class RetrievalGuardrails:
    """Assess retrieval quality and determine response strategy.

    Args:
        failure_mode: "strict" (enterprise) or "permissive" (general).
        high_threshold: Minimum score for HIGH quality.
        medium_threshold: Minimum score for MEDIUM quality.
        low_threshold: Minimum score for LOW quality (below is FAILED).
    """

    def __init__(
        self,
        failure_mode: str = "strict",
        high_threshold: float = 0.7,
        medium_threshold: float = 0.4,
        low_threshold: float = 0.15,
    ) -> None:
        if failure_mode not in ("strict", "permissive"):
            raise ValueError(
                f"failure_mode must be 'strict' or 'permissive', got '{failure_mode}'"
            )
        self.failure_mode = failure_mode
        self.high_threshold = high_threshold
        self.medium_threshold = medium_threshold
        self.low_threshold = low_threshold

    def assess(self, rag_result: "RAGResult") -> QualityAssessment:
        """Assess retrieval quality from a RAGResult.

        Returns a QualityAssessment with quality level, confidence, and
        recommended action based on the configured failure mode.
        """
        docs = rag_result.documents

        if not docs:
            return QualityAssessment(
                quality=RetrievalQuality.FAILED,
                confidence_score=0.0,
                top_score=0.0,
                avg_score=0.0,
                doc_count=0,
                recommended_action="refuse_answer",
                explanation="No relevant information was found in the knowledge base.",
            )

        scores = [d.final_score for d in docs]
        top_score = max(scores)
        avg_score = sum(scores) / len(scores)

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
        action = self._determine_action(quality)

        # Build explanation — prevent metadata leakage for FAILED / strict LOW
        explanation = self._build_explanation(quality, len(docs), top_score)

        confidence = min(top_score, 1.0)

        logger.debug(
            "guardrails_assessed",
            quality=quality.value,
            top_score=top_score,
            avg_score=avg_score,
            doc_count=len(docs),
            action=action,
        )

        return QualityAssessment(
            quality=quality,
            confidence_score=confidence,
            top_score=top_score,
            avg_score=avg_score,
            doc_count=len(docs),
            recommended_action=action,
            explanation=explanation,
        )

    def _determine_action(self, quality: RetrievalQuality) -> str:
        if quality == RetrievalQuality.HIGH:
            return "proceed"
        if quality == RetrievalQuality.MEDIUM:
            return "proceed"
        if quality == RetrievalQuality.LOW:
            if self.failure_mode == "permissive":
                return "warn_user"
            return "refuse_answer"
        # FAILED
        return "refuse_answer"

    def _build_explanation(
        self, quality: RetrievalQuality, doc_count: int, top_score: float,
    ) -> str:
        """Build a human-readable explanation without leaking metadata."""
        if quality == RetrievalQuality.FAILED:
            return "No relevant information was found in the knowledge base."

        if quality == RetrievalQuality.LOW and self.failure_mode == "strict":
            return "Very limited relevant information was found."

        if quality == RetrievalQuality.LOW:
            return f"Found {doc_count} result(s) with low relevance."

        if quality == RetrievalQuality.MEDIUM:
            return f"Found {doc_count} result(s) with moderate relevance."

        return f"Found {doc_count} highly relevant result(s)."

    def build_system_prompt_suffix(self, assessment: QualityAssessment) -> str:
        """Return a system prompt suffix to guide LLM behavior based on quality."""
        q = assessment.quality

        if q == RetrievalQuality.HIGH:
            return (
                "Answer based ONLY on the provided context. "
                "Cite sources using the [Source N] markers."
            )

        if q == RetrievalQuality.MEDIUM:
            return (
                "Context may be incomplete. Clearly state uncertainty "
                "where information is missing or unclear."
            )

        if q == RetrievalQuality.LOW:
            if self.failure_mode == "permissive":
                return (
                    "Very limited information found. Prefix uncertain parts "
                    "with 'Based on limited information:' and clearly indicate "
                    "what is not covered."
                )
            # strict + LOW -> refuse
            return (
                "No relevant information was found in the knowledge base. "
                "Do NOT answer from training data. Inform the user that "
                "the requested information is not available."
            )

        # FAILED (both modes)
        return (
            "No relevant information was found in the knowledge base. "
            "Do NOT answer from training data. Inform the user that "
            "the requested information is not available."
        )
