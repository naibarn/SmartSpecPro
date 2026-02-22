"""
Scope computation engine for multi-tenant RAG access control.

Provides two core functions:
- compute_effective_scopes: Determines what a user can access at query time
- recompute_allowed_scopes: Rebuilds the allowed_scopes cache on a library item

Scope format:
  u:<user_id>   - specific user
  g:<group_id>  - group (active members only)
  t:<tenant_id> - all users in a tenant
  p:global      - public (all authenticated users)
"""

from __future__ import annotations

import structlog
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

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
            "tenant": _TENANT,
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
