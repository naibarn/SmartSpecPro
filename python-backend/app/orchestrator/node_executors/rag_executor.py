"""RAG Query node executor.

Replaces the stub with a full implementation that wires together all RAG
components (sections 01-06) into the production execution path.
"""

from __future__ import annotations

from typing import Any

import structlog
from sqlalchemy import select

from app.core.database import get_db_context
from app.models.library import LibraryChunk, LibraryItem
from app.models.tenant import Tenant
from app.orchestrator.node_executors.base import ExecutionContext, NodeExecutionData
from app.orchestrator.rag.guardrails import (
    RetrievalGuardrails,
    RetrievalQuality,
)
from app.orchestrator.rag.hybrid_rag import (
    HybridRAGEngine,
    RAGConfig,
    RAGResult,
    SearchMode,
)

logger = structlog.get_logger()

# Hard ceiling on chunks loaded per request to prevent OOM
MAX_CHUNKS = 10_000

# Maximum query length in characters
MAX_QUERY_LENGTH = 10_000


def _failed_response(
    error: str = "",
    failure_mode: str = "permissive",
) -> dict[str, Any]:
    """Build a standardised error/empty response."""
    return {
        "documents": [],
        "context": "No relevant information was found to answer this query.",
        "quality": {
            "quality": "failed",
            "confidence_score": 0.0,
            "top_score": 0.0,
            "avg_score": 0.0,
            "doc_count": 0,
            "recommended_action": "refuse_answer",
            "explanation": "No documents passed the quality threshold.",
        },
        "metadata": {
            "total_results": 0,
            "search_mode": "hybrid",
            "failure_mode": failure_mode,
            **({"error": error} if error else {}),
        },
    }


class RAGExecutor:
    """Executor for RAG Query nodes.

    Implements the 9-step execution flow:
    1. Extract inputs and config
    2. Open AsyncSession and query chunks from PostgreSQL
    3. Query tenant settings for rag_failure_mode
    4. Instantiate HybridRAGEngine
    5. Load chunks into the engine
    6. Retrieve with scope filters
    7. Apply guardrails and quality assessment
    8. Build response
    9. Clean up
    """

    async def execute(
        self,
        data: NodeExecutionData,
        context: ExecutionContext,
    ) -> dict[str, Any]:
        """Execute RAG query against the full pipeline."""

        # --- Step 1: Extract inputs and config ---
        query = data.inputs.get("query", "")
        if not query or len(query) > MAX_QUERY_LENGTH:
            logger.warning(
                "rag_executor_invalid_query",
                query_len=len(query),
            )
            return _failed_response(error="invalid query length")

        top_k = data.config.get("top_k", 5)
        mode_str = data.config.get("mode", "hybrid")
        try:
            mode = SearchMode(mode_str)
        except ValueError:
            mode = SearchMode.HYBRID

        effective_scopes: list[str] = context.extra_data.get(
            "effective_scopes",
            [f"u:{context.user_id}", "p:global"],
        )

        # Validate tenant_id
        if context.tenant_id is None:
            logger.warning("rag_executor_no_tenant_id", user_id=context.user_id)
            return _failed_response(error="tenant_id is required")

        tenant_id = context.tenant_id
        engine: HybridRAGEngine | None = None

        try:
            async with get_db_context() as session:
                # --- Step 2: Query chunks from PostgreSQL ---
                chunk_stmt = (
                    select(LibraryChunk)
                    .where(LibraryChunk.tenant_id == tenant_id)
                    .where(LibraryChunk.is_parent.is_(False))
                )
                # Optionally filter by library_item_id
                library_item_id = data.config.get("library_item_id")
                if library_item_id is not None:
                    chunk_stmt = chunk_stmt.where(
                        LibraryChunk.library_item_id == library_item_id,
                    )

                chunk_stmt = chunk_stmt.limit(MAX_CHUNKS)
                chunk_rows = (await session.execute(chunk_stmt)).scalars().all()

                if len(chunk_rows) >= MAX_CHUNKS:
                    logger.warning(
                        "rag_executor_chunk_limit_hit",
                        tenant_id=tenant_id,
                        max_chunks=MAX_CHUNKS,
                    )

                if not chunk_rows:
                    logger.info(
                        "rag_executor_no_chunks",
                        tenant_id=tenant_id,
                    )
                    return _failed_response(failure_mode="permissive")

                # Build item_id → LibraryItem map for titles
                item_ids = list({c.library_item_id for c in chunk_rows})
                item_stmt = select(LibraryItem).where(LibraryItem.id.in_(item_ids))
                item_rows = (await session.execute(item_stmt)).scalars().all()
                item_map: dict[int, LibraryItem] = {i.id: i for i in item_rows}

                # --- Step 3: Query tenant settings ---
                tenant_stmt = select(Tenant).where(Tenant.id == tenant_id)
                tenant_row = (await session.execute(tenant_stmt)).scalar_one_or_none()

                # Enterprise tenants default to strict; others to permissive
                plan_default = "permissive"
                if tenant_row and hasattr(tenant_row.plan, "value"):
                    if tenant_row.plan.value == "enterprise":
                        plan_default = "strict"

                if tenant_row and tenant_row.settings:
                    failure_mode = tenant_row.settings.get(
                        "rag_failure_mode", plan_default,
                    )
                else:
                    failure_mode = plan_default

                # --- Step 4: Instantiate engine (request-scoped) ---
                config = RAGConfig(mode=mode, top_k=top_k)
                engine = HybridRAGEngine(config=config)

                # --- Step 5: Load chunks into engine ---
                for chunk in chunk_rows:
                    parent_item = item_map.get(chunk.library_item_id)
                    section_heading = ""
                    if chunk.metadata_json:
                        section_heading = chunk.metadata_json.get(
                            "section_heading", "",
                        )

                    await engine.add_document(
                        content=chunk.content,
                        metadata={
                            "chunk_id": str(chunk.id),
                            "parent_doc_id": str(chunk.library_item_id),
                            "parent_doc_title": parent_item.title if parent_item else "",
                            "section_heading": section_heading,
                            "allowed_scopes": chunk.allowed_scopes or [],
                            "tenant_id": chunk.tenant_id,
                        },
                        source_type=parent_item.item_type if parent_item else "document",
                        source_id=str(chunk.library_item_id),
                        doc_id=chunk.vector_ref_id or str(chunk.id),
                    )

                # --- Step 6: Retrieve with scope filters ---
                rag_result: RAGResult = await engine.retrieve(
                    query=query,
                    top_k=top_k,
                    mode=mode,
                    filters={
                        "tenant_id": tenant_id,
                        "allowed_scopes": effective_scopes,
                    },
                    user_id=context.user_id,
                    tenant_id=tenant_id,
                    effective_scopes=effective_scopes,
                )

            # --- Step 7: Apply guardrails ---
            guardrails = RetrievalGuardrails(failure_mode=failure_mode)
            assessment = guardrails.assess(rag_result)

            # --- Step 8: Build response ---
            # Check failure-mode gating
            if assessment.recommended_action == "refuse_answer":
                return {
                    "documents": [],
                    "context": "No relevant information was found to answer this query.",
                    "quality": {
                        "quality": assessment.quality.value,
                        "confidence_score": assessment.confidence_score,
                        "top_score": assessment.top_score,
                        "avg_score": assessment.avg_score,
                        "doc_count": assessment.doc_count,
                        "recommended_action": assessment.recommended_action,
                        "explanation": assessment.explanation,
                    },
                    "metadata": {
                        "total_results": 0,
                        "search_mode": mode.value,
                        "failure_mode": failure_mode,
                        "retrieval_time_ms": rag_result.retrieval_time_ms,
                        "total_time_ms": rag_result.total_time_ms,
                    },
                }

            # Build document list with citations
            context_str, citations = rag_result.get_context_with_citations()

            doc_list = []
            for doc in rag_result.documents:
                doc_list.append({
                    "text": doc.content,
                    "score": doc.final_score,
                    "chunk_id": doc.chunk_id or doc.metadata.get("chunk_id"),
                    "parent_doc_title": (
                        doc.parent_doc_title
                        or doc.metadata.get("parent_doc_title", "")
                    ),
                    "section_heading": (
                        doc.section_heading
                        or doc.metadata.get("section_heading", "")
                    ),
                    "citation_ref": doc.citation_ref(),
                })

            return {
                "documents": doc_list,
                "context": context_str,
                "citations": citations,
                "quality": {
                    "quality": assessment.quality.value,
                    "confidence_score": assessment.confidence_score,
                    "top_score": assessment.top_score,
                    "avg_score": assessment.avg_score,
                    "doc_count": assessment.doc_count,
                    "recommended_action": assessment.recommended_action,
                    "explanation": assessment.explanation,
                },
                "metadata": {
                    "total_results": rag_result.final_count,
                    "search_mode": mode.value,
                    "retrieval_time_ms": rag_result.retrieval_time_ms,
                    "rerank_time_ms": rag_result.rerank_time_ms,
                    "total_time_ms": rag_result.total_time_ms,
                    "bm25_candidates": rag_result.bm25_candidates,
                    "vector_candidates": rag_result.vector_candidates,
                },
            }

        except Exception as exc:
            logger.error(
                "rag_executor_error",
                tenant_id=tenant_id,
                error=str(exc),
            )
            return _failed_response(
                error="internal retrieval error",
                failure_mode="permissive",
            )

        finally:
            if engine is not None:
                await engine.cleanup()
