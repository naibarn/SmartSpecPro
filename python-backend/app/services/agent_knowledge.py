"""
Agent-level Knowledge Base retrieval.

Retrieves relevant chunks from library documents attached to an agent's
knowledgeBase config, and returns formatted context for injection into
the agent's system prompt.

Reuses the existing HybridRAGEngine, scope engine, and library models.
"""

from __future__ import annotations

from typing import Any

import structlog

logger = structlog.get_logger(__name__)


async def retrieve_agent_knowledge(
    node_config: dict[str, Any],
    query: str,
    tenant_id: str,
    user_id: int,
) -> str:
    """Retrieve KB context for an agent based on its knowledgeBase config.

    Args:
        node_config: The agent's nodeConfig dict (may contain knowledgeBase key).
        query: The user's input message to use as retrieval query.
        tenant_id: Tenant ID for scope isolation.
        user_id: User ID for scope computation.

    Returns:
        Formatted context string to append to instructions, or empty string.
    """
    kb_config = node_config.get("knowledgeBase")
    if not kb_config:
        return ""

    document_ids_raw = kb_config.get("documentIds") or []
    if not document_ids_raw:
        return ""

    # Coerce IDs to integers for DB query
    try:
        document_ids = [int(d) for d in document_ids_raw]
    except (ValueError, TypeError):
        logger.warning("agent_kb_invalid_document_ids", ids=document_ids_raw[:5])
        return ""

    search_mode_str: str = kb_config.get("searchMode", "hybrid")
    top_k: int = int(kb_config.get("topK", 5))
    score_threshold: float = float(kb_config.get("scoreThreshold", 0.7))
    max_context_tokens: int = int(kb_config.get("maxContextTokens", 4000))

    try:
        from sqlalchemy import select

        from app.core.database import get_db_context
        from app.models.library import LibraryChunk, LibraryItem
        from app.orchestrator.rag.hybrid_rag import (
            HybridRAGEngine,
            RAGConfig,
            SearchMode,
        )
        from app.orchestrator.rag.scope_engine import compute_effective_scopes

        try:
            mode = SearchMode(search_mode_str)
        except ValueError:
            mode = SearchMode.HYBRID

        MAX_CHUNKS = 5000

        async with get_db_context() as session:
            # Compute user's effective scopes for permission filtering
            effective_scopes: set[str] = set()
            if user_id:
                effective_scopes = await compute_effective_scopes(
                    user_id=user_id,
                    tenant_id=tenant_id,
                    session=session,
                )
            else:
                effective_scopes = {"p:global", f"t:{tenant_id}"}

            effective_scopes_list = list(effective_scopes)

            # Query chunks filtered by specific document IDs + tenant + permissions
            chunk_stmt = (
                select(LibraryChunk)
                .where(LibraryChunk.tenant_id == tenant_id)
                .where(LibraryChunk.is_parent.is_(False))
                .where(LibraryChunk.allowed_scopes.overlap(effective_scopes_list))
                .where(LibraryChunk.library_item_id.in_(document_ids))
                .limit(MAX_CHUNKS)
            )
            chunk_rows = (await session.execute(chunk_stmt)).scalars().all()

            if not chunk_rows:
                logger.info(
                    "agent_kb_no_chunks",
                    doc_ids=document_ids[:5],
                    tenant_id=tenant_id,
                )
                return ""

            # Build item map for document titles
            item_ids = list({c.library_item_id for c in chunk_rows})
            item_stmt = select(LibraryItem).where(LibraryItem.id.in_(item_ids))
            item_rows = (await session.execute(item_stmt)).scalars().all()
            item_map = {i.id: i for i in item_rows}

            # Instantiate RAG engine and load chunks
            config = RAGConfig(mode=mode, top_k=top_k)
            engine = HybridRAGEngine(config=config)

            for chunk in chunk_rows:
                parent_item = item_map.get(chunk.library_item_id)
                section_heading = ""
                if chunk.metadata_json:
                    section_heading = chunk.metadata_json.get(
                        "section_heading", ""
                    )

                await engine.add_document(
                    content=chunk.content,
                    metadata={
                        "chunk_id": str(chunk.id),
                        "parent_doc_id": str(chunk.library_item_id),
                        "parent_doc_title": (
                            parent_item.title if parent_item else ""
                        ),
                        "section_heading": section_heading,
                        "tenant_id": chunk.tenant_id,
                        "allowed_scopes": chunk.allowed_scopes or [],
                    },
                    source_type=(
                        parent_item.item_type if parent_item else "document"
                    ),
                    source_id=str(chunk.library_item_id),
                    doc_id=chunk.vector_ref_id or str(chunk.id),
                )

            # Retrieve relevant chunks
            rag_result = await engine.retrieve(
                query=query,
                top_k=top_k,
                mode=mode,
                tenant_id=tenant_id,
                user_id=user_id if user_id else None,
                effective_scopes=effective_scopes_list,
            )

            # Filter by score threshold
            relevant_docs = [
                d
                for d in rag_result.documents
                if d.final_score >= score_threshold
            ]

            if not relevant_docs:
                logger.info(
                    "agent_kb_no_relevant_docs",
                    doc_count=len(rag_result.documents),
                    threshold=score_threshold,
                )
                return ""

            # Generate bounded context with citations
            rag_result.documents = relevant_docs
            context_text, _citations = rag_result.get_context_with_citations(
                max_tokens=max_context_tokens,
            )

            if not context_text:
                return ""

            # Format as injection block for agent instructions
            formatted = (
                "\n\n---\n"
                "[Knowledge Base Context]\n"
                "The following information was retrieved from your "
                "knowledge base documents. "
                "Use it to inform your response when relevant.\n\n"
                f"{context_text}\n"
                "---"
            )

            logger.info(
                "agent_kb_retrieved",
                doc_ids=document_ids[:5],
                chunks_loaded=len(chunk_rows),
                relevant_count=len(relevant_docs),
                context_chars=len(formatted),
                tenant_id=tenant_id,
            )

            return formatted

    except Exception as exc:
        logger.warning("agent_kb_retrieval_failed", error=str(exc)[:200])
        return ""
