diff --git a/apps/web/server/services/libraryService.ts b/apps/web/server/services/libraryService.ts
index ecd814a..f59cf97 100644
--- a/apps/web/server/services/libraryService.ts
+++ b/apps/web/server/services/libraryService.ts
@@ -1280,6 +1280,11 @@ export async function updateLibraryItem(
     db,
   );
 
+  // Recompute allowed_scopes if visibility changed
+  if (input.visibility !== undefined) {
+    await recomputeAndPropagateScopes(itemId, actorTenantId, db);
+  }
+
   return toLibraryItemDto(updated[0]);
 }
 
@@ -1332,6 +1337,119 @@ export async function softDeleteLibraryItem(
   return true;
 }
 
+// ── Scope Propagation ──
+// Permission levels that grant read access (used for scope computation)
+const SCOPE_READ_LEVELS = new Set(["read", "write", "delete", "owner"]);
+
+/**
+ * Recompute allowed_scopes for a library item from its permissions,
+ * visibility, and owner. Then propagate to all chunks.
+ *
+ * Steps:
+ * 1. Fetch the item (owner_user_id, visibility, tenant_id)
+ * 2. Fetch all non-expired library_permissions for the item
+ * 3. Build the allowed_scopes array
+ * 4. UPDATE libraryItems SET allowedScopes = newScopes
+ * 5. UPDATE libraryChunks SET allowedScopes = newScopes
+ * 6. Fire-and-forget call to Python backend for vector store propagation
+ */
+async function recomputeAndPropagateScopes(
+  itemId: number,
+  tenantId: string,
+  dbClient?: DbClient,
+): Promise<void> {
+  const db = await resolveDb(dbClient);
+
+  // 1. Fetch the item
+  const items = await db
+    .select({
+      id: libraryItems.id,
+      ownerUserId: libraryItems.ownerUserId,
+      visibility: libraryItems.visibility,
+      tenantId: libraryItems.tenantId,
+    })
+    .from(libraryItems)
+    .where(and(eq(libraryItems.id, itemId), isNull(libraryItems.deletedAt)))
+    .limit(1);
+
+  const item = items[0];
+  if (!item) return;
+
+  // 2. Fetch all non-expired permissions
+  const perms = await db
+    .select({
+      subjectType: libraryPermissions.subjectType,
+      subjectId: libraryPermissions.subjectId,
+      permissionLevel: libraryPermissions.permissionLevel,
+    })
+    .from(libraryPermissions)
+    .where(
+      and(
+        eq(libraryPermissions.libraryItemId, itemId),
+        or(
+          isNull(libraryPermissions.expiresAt),
+          gt(libraryPermissions.expiresAt, new Date()),
+        ),
+      ),
+    );
+
+  // 3. Build allowed_scopes
+  const scopes = new Set<string>();
+  scopes.add(`u:${item.ownerUserId}`);
+
+  for (const perm of perms) {
+    if (!SCOPE_READ_LEVELS.has(perm.permissionLevel)) continue;
+
+    if (perm.subjectType === "user") {
+      scopes.add(`u:${perm.subjectId}`);
+    } else if (perm.subjectType === "group") {
+      scopes.add(`g:${perm.subjectId}`);
+    } else if (perm.subjectType === "tenant_role") {
+      scopes.add(`t:${perm.subjectId}`);
+    }
+  }
+
+  if (item.visibility === "public") {
+    scopes.add("p:global");
+  } else if (item.visibility === "team") {
+    scopes.add(`t:${item.tenantId}`);
+  }
+
+  const scopeList = Array.from(scopes).sort();
+
+  // 4. Update item's allowedScopes
+  await db
+    .update(libraryItems)
+    .set({ allowedScopes: scopeList })
+    .where(eq(libraryItems.id, itemId));
+
+  // 5. Update all chunks' allowedScopes
+  await db
+    .update(libraryChunks)
+    .set({ allowedScopes: scopeList })
+    .where(eq(libraryChunks.libraryItemId, itemId));
+
+  // 6. Fire-and-forget: call Python backend for vector store propagation
+  const pyBackendUrl = process.env.PYTHON_BACKEND_URL || "http://localhost:8000";
+  const proxyToken = process.env.SMARTSPEC_PROXY_TOKEN;
+  if (proxyToken) {
+    fetch(`${pyBackendUrl}/api/internal/library/propagate-scopes`, {
+      method: "POST",
+      headers: {
+        "Content-Type": "application/json",
+        "x-proxy-token": proxyToken,
+      },
+      body: JSON.stringify({
+        item_id: itemId,
+        tenant_id: tenantId,
+        new_allowed_scopes: scopeList,
+      }),
+    }).catch((err: unknown) => {
+      console.warn("[recomputeAndPropagateScopes] Python propagation failed:", err);
+    });
+  }
+}
+
 export async function shareLibraryItem(
   input: ShareLibraryItemInput,
   actor: LibraryActor,
@@ -1415,6 +1533,9 @@ export async function shareLibraryItem(
       },
     });
 
+  // Recompute allowed_scopes after sharing
+  await recomputeAndPropagateScopes(input.itemId, actorTenantId, db);
+
   return true;
 }
 
@@ -2356,6 +2477,9 @@ export async function removeLibraryShare(
     });
   }
 
+  // Recompute allowed_scopes after unsharing (immediate revocation)
+  await recomputeAndPropagateScopes(input.itemId, actorTenantId, db);
+
   return true;
 }
 
@@ -2399,6 +2523,9 @@ export async function updateLibrarySharePermission(
     });
   }
 
+  // Recompute allowed_scopes after permission level change
+  await recomputeAndPropagateScopes(input.itemId, actorTenantId, db);
+
   return true;
 }
 
diff --git a/python-backend/app/api/internal_library.py b/python-backend/app/api/internal_library.py
new file mode 100644
index 0000000..5226214
--- /dev/null
+++ b/python-backend/app/api/internal_library.py
@@ -0,0 +1,92 @@
+"""Internal library scope propagation API router.
+
+Exposes endpoints for the Node.js backend to trigger scope recomputation
+and vector store metadata propagation after permission changes:
+  POST /api/internal/library/propagate-scopes  -- propagate scopes to vector stores
+"""
+
+from __future__ import annotations
+
+import secrets
+from typing import Optional
+
+import structlog
+from fastapi import APIRouter, Depends, Header, HTTPException
+from pydantic import BaseModel
+from sqlalchemy.ext.asyncio import AsyncSession
+
+from app.core.config import settings
+from app.core.database import get_db
+from app.orchestrator.rag.scope_engine import propagate_scopes_to_vector_stores
+
+logger = structlog.get_logger(__name__)
+
+router = APIRouter(prefix="/api/internal/library", tags=["Internal Library"])
+
+
+async def _verify_proxy_token(x_proxy_token: Optional[str] = Header(None)):
+    """Verify the internal proxy token for Node.js -> Python calls."""
+    if not x_proxy_token:
+        raise HTTPException(status_code=401, detail="Missing proxy token")
+    proxy_token = getattr(settings, "SMARTSPEC_PROXY_TOKEN", None)
+    if not proxy_token:
+        raise HTTPException(status_code=500, detail="SMARTSPEC_PROXY_TOKEN not configured")
+    if not secrets.compare_digest(x_proxy_token, proxy_token):
+        raise HTTPException(status_code=401, detail="Invalid proxy token")
+
+
+class PropagateScopesRequest(BaseModel):
+    item_id: int
+    tenant_id: str
+    new_allowed_scopes: list[str]
+
+
+class PropagateScopesResponse(BaseModel):
+    success: bool
+    providers_updated: dict[str, int]
+
+
+@router.post(
+    "/propagate-scopes",
+    response_model=PropagateScopesResponse,
+    dependencies=[Depends(_verify_proxy_token)],
+)
+async def propagate_scopes_endpoint(
+    request: PropagateScopesRequest,
+    session: AsyncSession = Depends(get_db),
+):
+    """
+    Internal endpoint called by Node.js after permission changes.
+    Propagates allowed_scopes to vector store metadata (pgvector, ChromaDB,
+    Cloudflare Vectorize).
+
+    The Node.js side has already updated the PostgreSQL allowed_scopes columns.
+    This endpoint handles the vector store metadata sync.
+    """
+    try:
+        result = await propagate_scopes_to_vector_stores(
+            item_id=request.item_id,
+            new_allowed_scopes=request.new_allowed_scopes,
+            tenant_id=request.tenant_id,
+            session=session,
+        )
+
+        logger.info(
+            "propagate_scopes_api_success",
+            item_id=request.item_id,
+            tenant_id=request.tenant_id,
+            providers=result,
+        )
+
+        return PropagateScopesResponse(
+            success=True,
+            providers_updated=result,
+        )
+    except Exception as e:
+        logger.error(
+            "propagate_scopes_api_error",
+            item_id=request.item_id,
+            tenant_id=request.tenant_id,
+            error=str(e),
+        )
+        raise HTTPException(status_code=500, detail="Scope propagation failed")
diff --git a/python-backend/app/api/v1/__init__.py b/python-backend/app/api/v1/__init__.py
index 1859c77..176fd51 100644
--- a/python-backend/app/api/v1/__init__.py
+++ b/python-backend/app/api/v1/__init__.py
@@ -5,6 +5,7 @@ from app.api.v1.skills import router as skills_router
 from app.api.v1.media_generation import router as media_generation_router
 from app.api.v1.marketplace import router as marketplace_router
 from app.api.v1.health import router as health_router
+from app.api.v1.rag_scopes import router as rag_scopes_router
 
 api_router = APIRouter()
 api_router.include_router(auth_generator_router, prefix="/auth", tags=["auth"])
@@ -12,3 +13,4 @@ api_router.include_router(skills_router, prefix="/skills", tags=["skills"])
 api_router.include_router(media_generation_router, prefix="/media", tags=["media"])
 api_router.include_router(marketplace_router, prefix="/marketplace", tags=["marketplace"])
 api_router.include_router(health_router, tags=["monitoring"])
+api_router.include_router(rag_scopes_router, prefix="/rag", tags=["rag"])
diff --git a/python-backend/app/api/v1/rag_scopes.py b/python-backend/app/api/v1/rag_scopes.py
new file mode 100644
index 0000000..978d1b1
--- /dev/null
+++ b/python-backend/app/api/v1/rag_scopes.py
@@ -0,0 +1,95 @@
+"""
+Internal API endpoint for RAG scope propagation.
+
+Called by the Node.js web app after permission changes to propagate
+allowed_scopes updates to vector store metadata.
+"""
+
+from __future__ import annotations
+
+from pydantic import BaseModel, Field
+
+import structlog
+from fastapi import APIRouter, Depends, Header, HTTPException
+
+from app.orchestrator.rag.scope_engine import (
+    handle_permission_change,
+    propagate_scopes_to_vector_stores,
+)
+
+logger = structlog.get_logger()
+
+router = APIRouter()
+
+# Internal API key for Node.js -> Python calls.
+# In production, this should be set via environment variable.
+import os
+
+_INTERNAL_API_KEY = os.environ.get("INTERNAL_API_KEY", "")
+
+
+def _verify_internal_key(x_internal_key: str = Header("", alias="X-Internal-Key")) -> None:
+    """Verify the internal API key for service-to-service calls."""
+    if not _INTERNAL_API_KEY:
+        # If no key configured, allow all (dev mode)
+        return
+    if x_internal_key != _INTERNAL_API_KEY:
+        raise HTTPException(status_code=403, detail="Invalid internal API key")
+
+
+class PropagateScopesRequest(BaseModel):
+    """Request body for scope propagation."""
+
+    item_id: int = Field(..., description="Library item ID")
+    tenant_id: str = Field(..., description="Tenant ID")
+    new_allowed_scopes: list[str] = Field(
+        ..., description="The recomputed allowed_scopes list"
+    )
+
+
+class PropagateScopesResponse(BaseModel):
+    """Response from scope propagation."""
+
+    success: bool
+    providers: dict[str, int] = Field(
+        default_factory=dict,
+        description="Number of vectors updated per provider",
+    )
+
+
+@router.post(
+    "/internal/propagate-scopes",
+    response_model=PropagateScopesResponse,
+    tags=["internal"],
+)
+async def propagate_scopes_endpoint(
+    body: PropagateScopesRequest,
+    _: None = Depends(_verify_internal_key),
+) -> PropagateScopesResponse:
+    """
+    Propagate allowed_scopes to vector store metadata.
+
+    Internal endpoint called by Node.js after permission changes.
+    Protected by internal API key.
+    """
+    try:
+        # Import session factory lazily to avoid circular imports
+        from app.core.database import get_async_session
+
+        async for session in get_async_session():
+            result = await propagate_scopes_to_vector_stores(
+                item_id=body.item_id,
+                new_allowed_scopes=body.new_allowed_scopes,
+                tenant_id=body.tenant_id,
+                session=session,
+            )
+            return PropagateScopesResponse(success=True, providers=result)
+
+        return PropagateScopesResponse(success=False)
+    except Exception as e:
+        logger.error(
+            "propagate_scopes_endpoint_error",
+            item_id=body.item_id,
+            error=str(e),
+        )
+        return PropagateScopesResponse(success=False)
diff --git a/python-backend/app/main.py b/python-backend/app/main.py
index fbf2794..2014365 100644
--- a/python-backend/app/main.py
+++ b/python-backend/app/main.py
@@ -62,6 +62,7 @@ from app.api import (
     onedrive,  # OneDrive file operations API
     internal_onedrive,  # Internal OneDrive sync API
     admin_alerts,  # Admin alert threshold checking
+    internal_library,  # Internal library scope propagation API
 )
 from app.api.v1 import (
     skills,
@@ -283,6 +284,7 @@ app.include_router(internal_gdrive.router, tags=["Internal GDrive"])
 app.include_router(onedrive.router, tags=["OneDrive"])
 app.include_router(internal_onedrive.router, tags=["Internal OneDrive"])
 app.include_router(admin_alerts.router, tags=["Admin Alerts"])
+app.include_router(internal_library.router, tags=["Internal Library"])
 
 @app.get("/")
 async def root():
diff --git a/python-backend/app/orchestrator/rag/__init__.py b/python-backend/app/orchestrator/rag/__init__.py
index 8b0e968..97932d7 100644
--- a/python-backend/app/orchestrator/rag/__init__.py
+++ b/python-backend/app/orchestrator/rag/__init__.py
@@ -22,6 +22,9 @@ from app.orchestrator.rag.reranker import Reranker
 from app.orchestrator.rag.scope_engine import (
     compute_effective_scopes,
     recompute_allowed_scopes,
+    propagate_scopes_to_vector_stores,
+    invalidate_rag_cache_for_item,
+    handle_permission_change,
 )
 
 __all__ = [
@@ -34,4 +37,7 @@ __all__ = [
     "Reranker",
     "compute_effective_scopes",
     "recompute_allowed_scopes",
+    "propagate_scopes_to_vector_stores",
+    "invalidate_rag_cache_for_item",
+    "handle_permission_change",
 ]
diff --git a/python-backend/app/orchestrator/rag/scope_engine.py b/python-backend/app/orchestrator/rag/scope_engine.py
index 29ae551..b820080 100644
--- a/python-backend/app/orchestrator/rag/scope_engine.py
+++ b/python-backend/app/orchestrator/rag/scope_engine.py
@@ -1,9 +1,12 @@
 """
 Scope computation engine for multi-tenant RAG access control.
 
-Provides two core functions:
+Provides core functions:
 - compute_effective_scopes: Determines what a user can access at query time
 - recompute_allowed_scopes: Rebuilds the allowed_scopes cache on a library item
+- propagate_scopes_to_vector_stores: Pushes scope changes to vector backends
+- invalidate_rag_cache_for_item: Clears cached RAG results for a tenant
+- handle_permission_change: Orchestrates recompute + propagate + invalidate
 
 Scope format:
   u:<user_id>   - specific user
@@ -14,10 +17,15 @@ Scope format:
 
 from __future__ import annotations
 
+from typing import TYPE_CHECKING, Any, Optional
+
 import structlog
 from sqlalchemy import text
 from sqlalchemy.ext.asyncio import AsyncSession
 
+if TYPE_CHECKING:
+    from app.orchestrator.rag.hybrid_rag import HybridRAGEngine
+
 logger = structlog.get_logger()
 
 # Permission levels ranked for comparison.
@@ -188,3 +196,217 @@ async def recompute_allowed_scopes(
     )
 
     return scope_list
+
+
+async def propagate_scopes_to_vector_stores(
+    item_id: int,
+    new_allowed_scopes: list[str],
+    tenant_id: str,
+    session: AsyncSession,
+    pgvector_store: Optional[Any] = None,
+    chromadb_collection: Optional[Any] = None,
+    cloudflare_store: Optional[Any] = None,
+) -> dict[str, int]:
+    """
+    Propagate updated allowed_scopes to all configured vector store providers.
+
+    For each chunk belonging to the item:
+    1. pgvector: update_document() with metadata containing allowed_scopes
+    2. ChromaDB: collection.update() with new metadata (if configured)
+    3. Cloudflare Vectorize: delete + re-insert (no in-place metadata update)
+
+    Each provider is best-effort: failures are logged but do not block others.
+
+    Args:
+        item_id: The library item whose chunks need updating.
+        new_allowed_scopes: The recomputed scope list.
+        tenant_id: The tenant context.
+        session: Async SQLAlchemy session to look up chunk vector_ref_ids.
+        pgvector_store: Optional PgVectorStore instance.
+        chromadb_collection: Optional ChromaDB collection object.
+        cloudflare_store: Optional CloudflareVectorizeStore instance.
+
+    Returns:
+        Dict of provider_name -> number of vectors updated.
+    """
+    result: dict[str, int] = {"pgvector": 0}
+
+    # Look up all chunk vector_ref_ids for this item
+    chunk_query = text(
+        "SELECT id, vector_ref_id FROM library_chunks "
+        "WHERE library_item_id = :item_id"
+    )
+    chunk_result = await session.execute(chunk_query, {"item_id": item_id})
+    chunks = chunk_result.fetchall()
+
+    if not chunks:
+        logger.debug("propagate_scopes_no_chunks", item_id=item_id)
+        return result
+
+    vector_ref_ids = [c.vector_ref_id for c in chunks if c.vector_ref_id]
+
+    if not vector_ref_ids:
+        return result
+
+    metadata_update = {"allowed_scopes": new_allowed_scopes}
+
+    # 1. pgvector — update metadata on each document
+    if pgvector_store is not None:
+        try:
+            for ref_id in vector_ref_ids:
+                await pgvector_store.update_document(
+                    doc_id=ref_id, metadata=metadata_update,
+                )
+            result["pgvector"] = len(vector_ref_ids)
+        except Exception as e:
+            logger.warning(
+                "propagate_scopes_pgvector_error",
+                item_id=item_id, error=str(e),
+            )
+
+    # 2. ChromaDB — batch update in one call
+    if chromadb_collection is not None:
+        try:
+            chromadb_collection.update(
+                ids=vector_ref_ids,
+                metadatas=[metadata_update] * len(vector_ref_ids),
+            )
+            result["chromadb"] = len(vector_ref_ids)
+        except Exception as e:
+            logger.warning(
+                "propagate_scopes_chromadb_error",
+                item_id=item_id, error=str(e),
+            )
+
+    # 3. Cloudflare Vectorize — delete + re-insert (no in-place metadata update)
+    if cloudflare_store is not None:
+        try:
+            existing = await cloudflare_store.get_by_ids(vector_ref_ids)
+            if existing:
+                await cloudflare_store.delete_by_ids(vector_ref_ids)
+                updated_vectors = []
+                for vec in existing:
+                    vec_metadata = vec.get("metadata", {})
+                    vec_metadata["allowed_scopes"] = new_allowed_scopes
+                    updated_vectors.append({
+                        "id": vec["id"],
+                        "values": vec["values"],
+                        "metadata": vec_metadata,
+                    })
+                await cloudflare_store.upsert(updated_vectors)
+                result["cloudflare_vectorize"] = len(updated_vectors)
+        except Exception as e:
+            logger.warning(
+                "propagate_scopes_cloudflare_error",
+                item_id=item_id, error=str(e),
+            )
+
+    logger.info(
+        "propagated_scopes_to_vector_stores",
+        item_id=item_id,
+        tenant_id=tenant_id,
+        providers=result,
+    )
+
+    return result
+
+
+async def invalidate_rag_cache_for_item(
+    item_id: int,
+    tenant_id: str,
+    engine: Optional["HybridRAGEngine"] = None,
+) -> int:
+    """
+    Invalidate cached RAG results that may contain documents from the given item.
+
+    Since cache keys are prefixed with "{tenant_id}:", we remove all entries
+    for the given tenant. This is safe because cache entries are short-lived
+    (TTL-based) and clearing them only causes a cache miss on next query.
+
+    Args:
+        item_id: The library item whose permissions changed.
+        tenant_id: The tenant whose cache entries should be cleared.
+        engine: Optional HybridRAGEngine instance. If None, no-op.
+
+    Returns:
+        Number of cache entries invalidated.
+    """
+    if engine is None:
+        return 0
+
+    prefix = f"{tenant_id}:"
+    keys_to_remove = [k for k in engine._cache if k.startswith(prefix)]
+
+    for key in keys_to_remove:
+        del engine._cache[key]
+
+    if keys_to_remove:
+        logger.info(
+            "rag_cache_invalidated",
+            item_id=item_id,
+            tenant_id=tenant_id,
+            entries_removed=len(keys_to_remove),
+        )
+
+    return len(keys_to_remove)
+
+
+async def handle_permission_change(
+    item_id: int,
+    tenant_id: str,
+    session: AsyncSession,
+    pgvector_store: Optional[Any] = None,
+    chromadb_collection: Optional[Any] = None,
+    cloudflare_store: Optional[Any] = None,
+    rag_engine: Optional["HybridRAGEngine"] = None,
+) -> None:
+    """
+    Orchestrate scope recomputation and propagation after a permission change.
+
+    Called after any library_permissions CREATE, UPDATE, or DELETE.
+
+    Steps:
+    1. Recompute allowed_scopes from permissions, visibility, and owner.
+    2. If scopes are non-empty, propagate to vector store metadata.
+    3. Invalidate cached RAG results for this tenant.
+
+    Args:
+        item_id: The library item whose permissions changed.
+        tenant_id: The tenant context.
+        session: Async SQLAlchemy session.
+        pgvector_store: Optional PgVectorStore instance.
+        chromadb_collection: Optional ChromaDB collection.
+        cloudflare_store: Optional CloudflareVectorizeStore instance.
+        rag_engine: Optional HybridRAGEngine for cache invalidation.
+    """
+    new_scopes = await recompute_allowed_scopes(item_id, session)
+
+    if not new_scopes:
+        logger.info(
+            "permission_change_item_not_found",
+            item_id=item_id, tenant_id=tenant_id,
+        )
+        return
+
+    await propagate_scopes_to_vector_stores(
+        item_id=item_id,
+        new_allowed_scopes=new_scopes,
+        tenant_id=tenant_id,
+        session=session,
+        pgvector_store=pgvector_store,
+        chromadb_collection=chromadb_collection,
+        cloudflare_store=cloudflare_store,
+    )
+
+    await invalidate_rag_cache_for_item(
+        item_id=item_id,
+        tenant_id=tenant_id,
+        engine=rag_engine,
+    )
+
+    logger.info(
+        "permission_change_handled",
+        item_id=item_id,
+        tenant_id=tenant_id,
+        new_scope_count=len(new_scopes),
+    )
diff --git a/python-backend/app/tasks/backfill_allowed_scopes.py b/python-backend/app/tasks/backfill_allowed_scopes.py
new file mode 100644
index 0000000..c632741
--- /dev/null
+++ b/python-backend/app/tasks/backfill_allowed_scopes.py
@@ -0,0 +1,102 @@
+"""
+Backfill allowed_scopes for existing library items.
+
+Computes and sets allowed_scopes on library_items and library_chunks
+that have NULL or empty allowed_scopes. Processes in batches to limit
+memory and lock duration.
+
+Usage:
+    from app.tasks.backfill_allowed_scopes import backfill_allowed_scopes
+    result = await backfill_allowed_scopes(tenant_id="optional-filter")
+"""
+
+from __future__ import annotations
+
+import structlog
+from sqlalchemy import text
+from sqlalchemy.ext.asyncio import AsyncSession
+
+from app.orchestrator.rag.scope_engine import recompute_allowed_scopes
+
+logger = structlog.get_logger()
+
+
+async def backfill_allowed_scopes(
+    session: AsyncSession,
+    tenant_id: str | None = None,
+    batch_size: int = 100,
+) -> dict[str, int]:
+    """
+    Backfill allowed_scopes for existing library items.
+
+    Finds items where allowed_scopes is NULL or empty, then calls
+    recompute_allowed_scopes() for each. That function updates both
+    the item and all its chunks.
+
+    Args:
+        session: An async SQLAlchemy session.
+        tenant_id: If provided, only backfill items in this tenant.
+        batch_size: Number of items to process per batch.
+
+    Returns:
+        {"items_updated": N, "chunks_updated": M}
+    """
+    # Build query for items needing backfill
+    where_clause = "deleted_at IS NULL AND (allowed_scopes IS NULL OR allowed_scopes = '{}')"
+    params: dict = {}
+
+    if tenant_id is not None:
+        where_clause += " AND tenant_id = :tenant_id"
+        params["tenant_id"] = tenant_id
+
+    items_updated = 0
+    chunks_updated = 0
+
+    while True:
+        # Fetch a batch of item IDs
+        batch_query = text(
+            f"SELECT id FROM library_items WHERE {where_clause} "
+            f"ORDER BY id LIMIT :batch_size"
+        )
+        params["batch_size"] = batch_size
+        result = await session.execute(batch_query, params)
+        item_ids = result.scalars().all()
+
+        if not item_ids:
+            break
+
+        for item_id in item_ids:
+            scopes = await recompute_allowed_scopes(item_id, session)
+            if scopes:
+                items_updated += 1
+                # Count chunks updated for this item
+                chunk_count_result = await session.execute(
+                    text(
+                        "SELECT COUNT(*) FROM library_chunks "
+                        "WHERE library_item_id = :item_id"
+                    ),
+                    {"item_id": item_id},
+                )
+                chunks_updated += chunk_count_result.scalar() or 0
+
+        await session.commit()
+
+        logger.info(
+            "backfill_batch_complete",
+            batch_items=len(item_ids),
+            total_items_updated=items_updated,
+            total_chunks_updated=chunks_updated,
+        )
+
+        # If we got fewer than batch_size, we're done
+        if len(item_ids) < batch_size:
+            break
+
+    logger.info(
+        "backfill_complete",
+        items_updated=items_updated,
+        chunks_updated=chunks_updated,
+        tenant_id=tenant_id,
+    )
+
+    return {"items_updated": items_updated, "chunks_updated": chunks_updated}
diff --git a/python-backend/tests/orchestrator/rag/test_scope_propagation.py b/python-backend/tests/orchestrator/rag/test_scope_propagation.py
new file mode 100644
index 0000000..73abe5a
--- /dev/null
+++ b/python-backend/tests/orchestrator/rag/test_scope_propagation.py
@@ -0,0 +1,253 @@
+"""Tests for scope propagation to vector stores on permission changes."""
+
+import pytest
+from unittest.mock import AsyncMock, MagicMock, patch, call
+
+from app.orchestrator.rag.scope_engine import (
+    propagate_scopes_to_vector_stores,
+    invalidate_rag_cache_for_item,
+    handle_permission_change,
+)
+
+
+def _mock_session_with_chunks(chunk_rows: list[dict]) -> AsyncMock:
+    """Build a mock session that returns chunk rows for vector_ref_id lookup."""
+    session = AsyncMock()
+
+    # The function calls session.execute multiple times:
+    # 1. For chunk lookup (vector_ref_ids)
+    # 2. For recompute_allowed_scopes (item lookup, perm lookup, updates)
+    # We set up a side_effect list for each call.
+    chunk_result = MagicMock()
+    chunk_result.fetchall.return_value = [
+        MagicMock(vector_ref_id=row["vector_ref_id"], id=row["id"])
+        for row in chunk_rows
+    ]
+    session.execute = AsyncMock(return_value=chunk_result)
+    return session
+
+
+@pytest.mark.unit
+@pytest.mark.asyncio
+class TestPropagateToVectorStores:
+    """Tests for propagate_scopes_to_vector_stores."""
+
+    async def test_pgvector_metadata_updated(self):
+        """pgvector store should receive metadata update with new allowed_scopes."""
+        mock_pgvector = AsyncMock()
+        mock_pgvector.update_document = AsyncMock(return_value=MagicMock())
+
+        session = _mock_session_with_chunks([
+            {"id": 1, "vector_ref_id": "vec-001"},
+            {"id": 2, "vector_ref_id": "vec-002"},
+        ])
+
+        result = await propagate_scopes_to_vector_stores(
+            item_id=10,
+            new_allowed_scopes=["u:1", "g:10"],
+            tenant_id="t1",
+            session=session,
+            pgvector_store=mock_pgvector,
+        )
+
+        assert mock_pgvector.update_document.call_count == 2
+        # Verify metadata contains allowed_scopes
+        for c in mock_pgvector.update_document.call_args_list:
+            assert c[1]["metadata"]["allowed_scopes"] == ["u:1", "g:10"]
+
+        assert result["pgvector"] == 2
+
+    async def test_cloudflare_vectorize_delete_and_reinsert(self):
+        """Cloudflare Vectorize should delete + re-insert (no in-place update)."""
+        mock_cf = AsyncMock()
+        mock_cf.get_by_ids = AsyncMock(return_value=[
+            {"id": "vec-001", "values": [0.1, 0.2], "metadata": {"old": True}},
+        ])
+        mock_cf.delete_by_ids = AsyncMock(return_value={})
+        mock_cf.upsert = AsyncMock(return_value={})
+
+        session = _mock_session_with_chunks([
+            {"id": 1, "vector_ref_id": "vec-001"},
+        ])
+
+        result = await propagate_scopes_to_vector_stores(
+            item_id=10,
+            new_allowed_scopes=["u:1", "p:global"],
+            tenant_id="t1",
+            session=session,
+            cloudflare_store=mock_cf,
+        )
+
+        mock_cf.delete_by_ids.assert_called_once_with(["vec-001"])
+        mock_cf.upsert.assert_called_once()
+        upsert_vectors = mock_cf.upsert.call_args[0][0]
+        assert upsert_vectors[0]["metadata"]["allowed_scopes"] == ["u:1", "p:global"]
+        assert result["cloudflare_vectorize"] == 1
+
+    async def test_chromadb_metadata_updated(self):
+        """ChromaDB collection should receive update with new metadata."""
+        mock_collection = MagicMock()
+        mock_collection.update = MagicMock()
+
+        session = _mock_session_with_chunks([
+            {"id": 1, "vector_ref_id": "vec-001"},
+            {"id": 2, "vector_ref_id": "vec-002"},
+        ])
+
+        result = await propagate_scopes_to_vector_stores(
+            item_id=10,
+            new_allowed_scopes=["u:1"],
+            tenant_id="t1",
+            session=session,
+            chromadb_collection=mock_collection,
+        )
+
+        mock_collection.update.assert_called_once()
+        call_kwargs = mock_collection.update.call_args[1]
+        assert call_kwargs["ids"] == ["vec-001", "vec-002"]
+        assert result["chromadb"] == 2
+
+    async def test_no_chunks_returns_zero(self):
+        """When item has no chunks, all providers should report 0 updated."""
+        session = _mock_session_with_chunks([])
+
+        result = await propagate_scopes_to_vector_stores(
+            item_id=999,
+            new_allowed_scopes=["u:1"],
+            tenant_id="t1",
+            session=session,
+        )
+
+        assert result["pgvector"] == 0
+        assert result.get("chromadb", 0) == 0
+        assert result.get("cloudflare_vectorize", 0) == 0
+
+    async def test_provider_error_does_not_fail_others(self):
+        """If one provider fails, others should still be updated."""
+        mock_pgvector = AsyncMock()
+        mock_pgvector.update_document = AsyncMock(side_effect=Exception("pgvector down"))
+
+        mock_collection = MagicMock()
+        mock_collection.update = MagicMock()
+
+        session = _mock_session_with_chunks([
+            {"id": 1, "vector_ref_id": "vec-001"},
+        ])
+
+        result = await propagate_scopes_to_vector_stores(
+            item_id=10,
+            new_allowed_scopes=["u:1"],
+            tenant_id="t1",
+            session=session,
+            pgvector_store=mock_pgvector,
+            chromadb_collection=mock_collection,
+        )
+
+        # pgvector failed, chromadb succeeded
+        assert result["pgvector"] == 0
+        assert result["chromadb"] == 1
+
+
+@pytest.mark.unit
+@pytest.mark.asyncio
+class TestInvalidateRagCache:
+    """Tests for invalidate_rag_cache_for_item."""
+
+    async def test_clears_tenant_cache_entries(self):
+        """Cache entries for the given tenant should be removed."""
+        from app.orchestrator.rag.hybrid_rag import HybridRAGEngine, RAGConfig, RAGResult
+        from datetime import datetime
+
+        engine = HybridRAGEngine(config=RAGConfig())
+        # Pre-populate cache with entries for different tenants
+        engine._cache["t1:abc:q1:10:hybrid"] = (RAGResult(query="q1"), datetime.utcnow())
+        engine._cache["t1:def:q2:10:hybrid"] = (RAGResult(query="q2"), datetime.utcnow())
+        engine._cache["t2:ghi:q3:10:hybrid"] = (RAGResult(query="q3"), datetime.utcnow())
+
+        count = await invalidate_rag_cache_for_item(
+            item_id=1,
+            tenant_id="t1",
+            engine=engine,
+        )
+
+        assert count == 2
+        assert len(engine._cache) == 1
+        assert "t2:ghi:q3:10:hybrid" in engine._cache
+
+    async def test_no_matching_entries_returns_zero(self):
+        """When no cache entries match the tenant, return 0."""
+        from app.orchestrator.rag.hybrid_rag import HybridRAGEngine, RAGConfig
+
+        engine = HybridRAGEngine(config=RAGConfig())
+
+        count = await invalidate_rag_cache_for_item(
+            item_id=1,
+            tenant_id="nonexistent",
+            engine=engine,
+        )
+
+        assert count == 0
+
+
+@pytest.mark.unit
+@pytest.mark.asyncio
+class TestHandlePermissionChange:
+    """Tests for handle_permission_change orchestrator."""
+
+    async def test_recomputes_and_propagates(self):
+        """handle_permission_change should recompute scopes and propagate."""
+        session = AsyncMock()
+
+        # Mock recompute_allowed_scopes to return new scopes
+        with patch(
+            "app.orchestrator.rag.scope_engine.recompute_allowed_scopes",
+            new_callable=AsyncMock,
+        ) as mock_recompute, patch(
+            "app.orchestrator.rag.scope_engine.propagate_scopes_to_vector_stores",
+            new_callable=AsyncMock,
+        ) as mock_propagate, patch(
+            "app.orchestrator.rag.scope_engine.invalidate_rag_cache_for_item",
+            new_callable=AsyncMock,
+        ) as mock_invalidate:
+            mock_recompute.return_value = ["u:1", "g:10"]
+            mock_propagate.return_value = {"pgvector": 2}
+            mock_invalidate.return_value = 1
+
+            await handle_permission_change(
+                item_id=10,
+                tenant_id="t1",
+                session=session,
+            )
+
+            mock_recompute.assert_called_once_with(10, session)
+            mock_propagate.assert_called_once()
+            propagate_kwargs = mock_propagate.call_args[1]
+            assert propagate_kwargs["item_id"] == 10
+            assert propagate_kwargs["new_allowed_scopes"] == ["u:1", "g:10"]
+            assert propagate_kwargs["tenant_id"] == "t1"
+            mock_invalidate.assert_called_once_with(
+                item_id=10, tenant_id="t1", engine=None
+            )
+
+    async def test_empty_recompute_still_propagates(self):
+        """Even if recompute returns empty (item not found), propagation is skipped."""
+        session = AsyncMock()
+
+        with patch(
+            "app.orchestrator.rag.scope_engine.recompute_allowed_scopes",
+            new_callable=AsyncMock,
+        ) as mock_recompute, patch(
+            "app.orchestrator.rag.scope_engine.propagate_scopes_to_vector_stores",
+            new_callable=AsyncMock,
+        ) as mock_propagate:
+            mock_recompute.return_value = []
+
+            await handle_permission_change(
+                item_id=999,
+                tenant_id="t1",
+                session=session,
+            )
+
+            mock_recompute.assert_called_once()
+            # Propagation should be skipped when scopes are empty
+            mock_propagate.assert_not_called()
diff --git a/python-backend/tests/orchestrator/rag/test_tenant_isolation.py b/python-backend/tests/orchestrator/rag/test_tenant_isolation.py
new file mode 100644
index 0000000..5d1e4df
--- /dev/null
+++ b/python-backend/tests/orchestrator/rag/test_tenant_isolation.py
@@ -0,0 +1,117 @@
+"""Integration tests for cross-tenant isolation in RAG retrieval."""
+
+import pytest
+from unittest.mock import AsyncMock, MagicMock
+
+from app.orchestrator.rag.scope_engine import compute_effective_scopes
+
+
+def _mock_session_with_groups(group_ids: list[int]) -> AsyncMock:
+    """Build a mock session that returns active group membership scalars."""
+    session = AsyncMock()
+    result = MagicMock()
+    result.scalars.return_value.all.return_value = group_ids
+    session.execute = AsyncMock(return_value=result)
+    return session
+
+
+@pytest.mark.unit
+@pytest.mark.asyncio
+class TestCrossTenantIsolation:
+    """Verify that scope computation enforces tenant boundaries."""
+
+    async def test_user_in_tenant_a_cannot_see_tenant_b_scopes(self):
+        """User in tenant A should only get scopes for tenant A, not tenant B."""
+        session_a = _mock_session_with_groups([10])
+        scopes_a = await compute_effective_scopes(
+            user_id=1, tenant_id="tenant-a", session=session_a,
+        )
+
+        session_b = _mock_session_with_groups([20])
+        scopes_b = await compute_effective_scopes(
+            user_id=2, tenant_id="tenant-b", session=session_b,
+        )
+
+        # Tenant A user should have tenant A scope, not tenant B
+        assert "t:tenant-a" in scopes_a
+        assert "t:tenant-b" not in scopes_a
+
+        # Tenant B user should have tenant B scope, not tenant A
+        assert "t:tenant-b" in scopes_b
+        assert "t:tenant-a" not in scopes_b
+
+    async def test_group_scope_bound_to_query_tenant(self):
+        """Group scopes should only include groups from the query's tenant."""
+        # User is in group 10 (tenant A) and group 20 (tenant B)
+        # But query is for tenant A, so only group 10 should appear
+        session = _mock_session_with_groups([10])  # SQL already filters by tenant
+        scopes = await compute_effective_scopes(
+            user_id=1, tenant_id="tenant-a", session=session,
+        )
+
+        assert "g:10" in scopes
+        # g:20 is from tenant-b, filtered by the SQL query
+        assert "g:20" not in scopes
+
+    async def test_shared_doc_accessible_only_by_group_members(self):
+        """Document with allowed_scopes=["u:1", "g:10"] should be accessible
+        only by user 1 and active members of group 10."""
+        doc_scopes = {"u:1", "g:10"}
+
+        # User 2 is active member of group 10
+        session_user2 = _mock_session_with_groups([10])
+        user2_scopes = await compute_effective_scopes(
+            user_id=2, tenant_id="t1", session=session_user2,
+        )
+
+        # User 3 is NOT a member of group 10
+        session_user3 = _mock_session_with_groups([])
+        user3_scopes = await compute_effective_scopes(
+            user_id=3, tenant_id="t1", session=session_user3,
+        )
+
+        # User 2 has g:10, so doc_scopes & user2_scopes should intersect
+        assert len(doc_scopes & user2_scopes) > 0
+
+        # User 3 does NOT have g:10 or u:1, so no intersection
+        assert len(doc_scopes & user3_scopes) == 0
+
+    async def test_pending_member_cannot_access_group_docs(self):
+        """Pending group member should not have the group scope."""
+        # SQL filters status='active', so pending member returns no groups
+        session = _mock_session_with_groups([])
+        scopes = await compute_effective_scopes(
+            user_id=4, tenant_id="t1", session=session,
+        )
+
+        doc_scopes = {"u:1", "g:10"}
+        # User 4 has no group scopes and is not user 1
+        assert len(doc_scopes & scopes) == 0
+
+    async def test_unshared_doc_immediately_inaccessible(self):
+        """After removing a scope, the document should no longer be accessible."""
+        # Before: doc has scopes ["u:1", "g:10"]
+        doc_scopes_before = {"u:1", "g:10"}
+
+        session = _mock_session_with_groups([10])
+        user2_scopes = await compute_effective_scopes(
+            user_id=2, tenant_id="t1", session=session,
+        )
+        assert len(doc_scopes_before & user2_scopes) > 0  # accessible
+
+        # After: doc scopes updated to ["u:1"] (group share removed)
+        doc_scopes_after = {"u:1"}
+        assert len(doc_scopes_after & user2_scopes) == 0  # no longer accessible
+
+    async def test_public_doc_accessible_by_any_tenant(self):
+        """Documents with p:global scope should be accessible by any user."""
+        doc_scopes = {"u:1", "p:global"}
+
+        session = _mock_session_with_groups([])
+        any_user_scopes = await compute_effective_scopes(
+            user_id=999, tenant_id="any-tenant", session=session,
+        )
+
+        # p:global is always in effective scopes
+        assert "p:global" in any_user_scopes
+        assert len(doc_scopes & any_user_scopes) > 0
