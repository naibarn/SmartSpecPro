"""
Scope computation engine for multi-tenant RAG access control.

Provides core functions:
- compute_effective_scopes: Determines what a user can access at query time
- recompute_allowed_scopes: Rebuilds the allowed_scopes cache on a library item
- propagate_scopes_to_vector_stores: Pushes scope changes to vector backends
- invalidate_rag_cache_for_item: Clears cached RAG results for a tenant
- handle_permission_change: Orchestrates recompute + propagate + invalidate

Scope format:
  u:<user_id>   - specific user
  g:<group_id>  - group (active members only)
  t:<tenant_id> - all users in a tenant
  p:global      - public (all authenticated users)
"""

from __future__ import annotations

from typing import TYPE_CHECKING, Any, Optional

import structlog
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

if TYPE_CHECKING:
    from app.orchestrator.rag.hybrid_rag import HybridRAGEngine

logger = structlog.get_logger()

# Permission levels ranked for comparison.
# Only levels at or above "read" grant a scope.
PERMISSION_LEVELS = {"none": 0, "read": 1, "comment": 2, "edit": 3, "admin": 4}
MIN_READ_LEVEL = PERMISSION_LEVELS["read"]

# Scope prefix constants
_USER = "u"
_GROUP = "g"
_TENANT = "t"
_PUBLIC = "p"


async def compute_effective_scopes(
    user_id: int,
    tenant_id: str,
    session: AsyncSession,
) -> set[str]:
    """
    Compute the full set of scopes a user can access at query time.

    Always includes:
      - "u:<user_id>" (the user's own private scope)
      - "p:global" (public documents)

    Conditionally includes:
      - "g:<group_id>" for each group where the user has status='active'
        AND the group belongs to the same tenant (defense-in-depth)
      - "t:<tenant_id>" for tenant-level shared documents

    Args:
        user_id: The querying user's ID.
        tenant_id: The tenant context for the query.
        session: An async SQLAlchemy session for database queries.

    Returns:
        A set of scope strings like {"u:42", "p:global", "g:10", "t:abc"}.
    """
    scopes: set[str] = {f"{_USER}:{user_id}", f"{_PUBLIC}:global"}

    # Add tenant scope — tenant members can always see tenant-level shared docs
    scopes.add(f"{_TENANT}:{tenant_id}")

    # Query active group memberships — filtered by tenant to prevent
    # cross-tenant group scope leakage (enterprise defense-in-depth)
    query = text(
        "SELECT gm.group_id FROM group_members gm "
        "JOIN user_groups ug ON ug.id = gm.group_id "
        "WHERE gm.user_id = :user_id AND gm.status = 'active' "
        "AND ug.tenant_id = :tenant_id AND ug.deleted_at IS NULL"
    )
    result = await session.execute(query, {"user_id": user_id, "tenant_id": tenant_id})
    rows = result.scalars().all()

    for group_id in rows:
        scopes.add(f"{_GROUP}:{group_id}")

    logger.debug(
        "computed_effective_scopes",
        user_id=user_id,
        tenant_id=tenant_id,
        scope_count=len(scopes),
    )

    return scopes


async def recompute_allowed_scopes(
    library_item_id: int,
    session: AsyncSession,
) -> list[str]:
    """
    Recompute the allowed_scopes for a library item from its permissions.

    This is the single source of truth for building allowed_scopes.
    It reads from library_permissions, the item's visibility, and the owner.

    Computation logic:
      1. Start with ["u:<owner_user_id>"]
      2. For each non-expired library_permissions record with permission_level >= "read":
         - If subject_type == "user": add "u:<subject_id>"
         - If subject_type == "group": add "g:<subject_id>"
         - If subject_type == "tenant": add "t:<subject_id>"
      3. If item visibility == "public": add "p:global"
      4. If item visibility == "team": add "t:<tenant_id>"

    After computing, updates:
      - library_items.allowed_scopes for the item
      - library_chunks.allowed_scopes for ALL chunks belonging to the item

    Note: The caller is responsible for committing the session.

    Args:
        library_item_id: The ID of the library item to recompute.
        session: An async SQLAlchemy session.

    Returns:
        The computed list of scope strings.
    """
    # Fetch the library item (skip soft-deleted items)
    item_query = text(
        "SELECT id, owner_user_id, visibility, tenant_id "
        "FROM library_items WHERE id = :item_id AND deleted_at IS NULL"
    )
    item_result = await session.execute(item_query, {"item_id": library_item_id})
    item = item_result.one_or_none()

    if item is None:
        logger.warning("recompute_scopes_item_not_found", item_id=library_item_id)
        return []

    # 1. Start with owner scope
    scopes: set[str] = {f"{_USER}:{item.owner_user_id}"}

    # 2. Fetch non-expired permissions and add scopes for those at or above "read"
    perm_query = text(
        "SELECT subject_type, subject_id, permission_level "
        "FROM library_permissions WHERE library_item_id = :item_id "
        "AND (expires_at IS NULL OR expires_at > NOW())"
    )
    perm_result = await session.execute(perm_query, {"item_id": library_item_id})
    for perm in perm_result:
        level = PERMISSION_LEVELS.get(perm.permission_level, 0)
        if level < MIN_READ_LEVEL:
            continue

        prefix = {
            "user": _USER,
            "group": _GROUP,
            "tenant_role": _TENANT,
        }.get(perm.subject_type)

        if prefix:
            scopes.add(f"{prefix}:{perm.subject_id}")

    # 3. Visibility-based scopes
    if item.visibility == "public":
        scopes.add(f"{_PUBLIC}:global")
    elif item.visibility == "team":
        scopes.add(f"{_TENANT}:{item.tenant_id}")

    # Convert to sorted list for deterministic storage
    scope_list = sorted(scopes)

    # Update item's allowed_scopes
    await session.execute(
        text(
            "UPDATE library_items SET allowed_scopes = :scopes WHERE id = :item_id"
        ),
        {"scopes": scope_list, "item_id": library_item_id},
    )

    # Propagate to all chunks of this item
    await session.execute(
        text(
            "UPDATE library_chunks SET allowed_scopes = :scopes "
            "WHERE library_item_id = :item_id"
        ),
        {"scopes": scope_list, "item_id": library_item_id},
    )

    logger.info(
        "recomputed_allowed_scopes",
        item_id=library_item_id,
        scope_count=len(scope_list),
        scopes=scope_list,
    )

    return scope_list


async def propagate_scopes_to_vector_stores(
    item_id: int,
    new_allowed_scopes: list[str],
    tenant_id: str,
    session: AsyncSession,
    pgvector_store: Optional[Any] = None,
    chromadb_collection: Optional[Any] = None,
    cloudflare_store: Optional[Any] = None,
) -> dict[str, int]:
    """
    Propagate updated allowed_scopes to all configured vector store providers.

    For each chunk belonging to the item:
    1. pgvector: update_document() with metadata containing allowed_scopes
    2. ChromaDB: collection.update() with new metadata (if configured)
    3. Cloudflare Vectorize: delete + re-insert (no in-place metadata update)

    Each provider is best-effort: failures are logged but do not block others.

    Args:
        item_id: The library item whose chunks need updating.
        new_allowed_scopes: The recomputed scope list.
        tenant_id: The tenant context.
        session: Async SQLAlchemy session to look up chunk vector_ref_ids.
        pgvector_store: Optional PgVectorStore instance.
        chromadb_collection: Optional ChromaDB collection object.
        cloudflare_store: Optional CloudflareVectorizeStore instance.

    Returns:
        Dict of provider_name -> number of vectors updated.
    """
    result: dict[str, int] = {}

    # Look up all chunk vector_ref_ids for this item (tenant-filtered for defense-in-depth)
    chunk_query = text(
        "SELECT id, vector_ref_id FROM library_chunks "
        "WHERE library_item_id = :item_id AND tenant_id = :tenant_id"
    )
    chunk_result = await session.execute(chunk_query, {"item_id": item_id, "tenant_id": tenant_id})
    chunks = chunk_result.fetchall()

    if not chunks:
        logger.debug("propagate_scopes_no_chunks", item_id=item_id)
        return result

    vector_ref_ids = [c.vector_ref_id for c in chunks if c.vector_ref_id]

    if not vector_ref_ids:
        return result

    metadata_update = {"allowed_scopes": new_allowed_scopes}

    # 1. pgvector — update metadata on each document or canonical library table
    provider_name = "chroma"
    if pgvector_store is None:
        from app.services.library_indexing_service import resolve_library_vector_provider

        provider_name, _provider_config = resolve_library_vector_provider()
    if pgvector_store is not None:
        try:
            for ref_id in vector_ref_ids:
                await pgvector_store.update_document(
                    doc_id=ref_id, metadata=metadata_update,
                )
            result["pgvector"] = len(vector_ref_ids)
        except Exception as e:
            logger.warning(
                "propagate_scopes_pgvector_error",
                item_id=item_id, error=str(e),
            )
    elif provider_name == "pgvector":
        try:
            from app.services.library_pgvector_service import update_library_chunk_vector_metadata

            updated = await update_library_chunk_vector_metadata(
                session,
                tenant_id=tenant_id,
                item_id=item_id,
                metadata_patch=metadata_update,
            )
            result["pgvector"] = updated
        except Exception as e:
            logger.warning(
                "propagate_scopes_pgvector_error",
                item_id=item_id, error=str(e),
            )

    # 2. ChromaDB — batch update in one call
    if chromadb_collection is not None:
        try:
            chromadb_collection.update(
                ids=vector_ref_ids,
                metadatas=[metadata_update] * len(vector_ref_ids),
            )
            result["chromadb"] = len(vector_ref_ids)
        except Exception as e:
            logger.warning(
                "propagate_scopes_chromadb_error",
                item_id=item_id, error=str(e),
            )

    # 3. Cloudflare Vectorize — delete + re-insert (no in-place metadata update)
    if cloudflare_store is not None:
        try:
            existing = await cloudflare_store.get_by_ids(vector_ref_ids)
            if existing:
                await cloudflare_store.delete_by_ids(vector_ref_ids)
                updated_vectors = []
                for vec in existing:
                    vec_metadata = vec.get("metadata", {})
                    vec_metadata["allowed_scopes"] = new_allowed_scopes
                    updated_vectors.append({
                        "id": vec["id"],
                        "values": vec["values"],
                        "metadata": vec_metadata,
                    })
                await cloudflare_store.upsert(updated_vectors)
                result["cloudflare_vectorize"] = len(updated_vectors)
        except Exception as e:
            logger.warning(
                "propagate_scopes_cloudflare_error",
                item_id=item_id, error=str(e),
            )

    logger.info(
        "propagated_scopes_to_vector_stores",
        item_id=item_id,
        tenant_id=tenant_id,
        providers=result,
    )

    return result


async def invalidate_rag_cache_for_item(
    item_id: int,
    tenant_id: str,
    engine: Optional["HybridRAGEngine"] = None,
) -> int:
    """
    Invalidate cached RAG results that may contain documents from the given item.

    Since cache keys are prefixed with "{tenant_id}:", we remove all entries
    for the given tenant. This is safe because cache entries are short-lived
    (TTL-based) and clearing them only causes a cache miss on next query.

    Args:
        item_id: The library item whose permissions changed.
        tenant_id: The tenant whose cache entries should be cleared.
        engine: Optional HybridRAGEngine instance. If None, no-op.

    Returns:
        Number of cache entries invalidated.
    """
    if engine is None:
        return 0

    prefix = f"{tenant_id}:"
    keys_to_remove = [k for k in engine._cache if k.startswith(prefix)]

    for key in keys_to_remove:
        del engine._cache[key]

    if keys_to_remove:
        logger.info(
            "rag_cache_invalidated",
            item_id=item_id,
            tenant_id=tenant_id,
            entries_removed=len(keys_to_remove),
        )

    return len(keys_to_remove)


async def handle_permission_change(
    item_id: int,
    tenant_id: str,
    session: AsyncSession,
    pgvector_store: Optional[Any] = None,
    chromadb_collection: Optional[Any] = None,
    cloudflare_store: Optional[Any] = None,
    rag_engine: Optional["HybridRAGEngine"] = None,
) -> None:
    """
    Orchestrate scope recomputation and propagation after a permission change.

    Called after any library_permissions CREATE, UPDATE, or DELETE.

    Steps:
    1. Recompute allowed_scopes from permissions, visibility, and owner.
    2. If scopes are non-empty, propagate to vector store metadata.
    3. Invalidate cached RAG results for this tenant.

    Args:
        item_id: The library item whose permissions changed.
        tenant_id: The tenant context.
        session: Async SQLAlchemy session.
        pgvector_store: Optional PgVectorStore instance.
        chromadb_collection: Optional ChromaDB collection.
        cloudflare_store: Optional CloudflareVectorizeStore instance.
        rag_engine: Optional HybridRAGEngine for cache invalidation.
    """
    new_scopes = await recompute_allowed_scopes(item_id, session)

    if not new_scopes:
        logger.info(
            "permission_change_item_not_found",
            item_id=item_id, tenant_id=tenant_id,
        )
        return

    await propagate_scopes_to_vector_stores(
        item_id=item_id,
        new_allowed_scopes=new_scopes,
        tenant_id=tenant_id,
        session=session,
        pgvector_store=pgvector_store,
        chromadb_collection=chromadb_collection,
        cloudflare_store=cloudflare_store,
    )

    await invalidate_rag_cache_for_item(
        item_id=item_id,
        tenant_id=tenant_id,
        engine=rag_engine,
    )

    logger.info(
        "permission_change_handled",
        item_id=item_id,
        tenant_id=tenant_id,
        new_scope_count=len(new_scopes),
    )
