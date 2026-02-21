"""OneDrive Celery tasks for sync, cleanup, and content extraction.

Uses Microsoft Graph API delta queries for incremental sync.
"""

import base64
import logging
import math
from datetime import datetime, timedelta, timezone
from typing import Any, Optional

import httpx
from celery import shared_task

logger = logging.getLogger(__name__)

GRAPH_BASE = "https://graph.microsoft.com/v1.0"


def _get_sync_db():
    """Get a sync database session."""
    from app.core.database import SyncSessionLocal
    return SyncSessionLocal()


@shared_task(name="onedrive.initial_sync", bind=True, max_retries=3)
def initial_onedrive_sync(self, user_id: int, tenant_id: str = ""):
    """Full initial scan of OneDrive via delta query.

    Uses GET /me/drive/root/delta to enumerate all files,
    filters by indexing rules, and stores metadata + content.
    """
    import asyncio
    asyncio.get_event_loop().run_until_complete(
        _initial_sync_async(self, user_id, tenant_id)
    )


async def _initial_sync_async(task, user_id: int, tenant_id: str):
    from app.core.database import AsyncSessionLocal
    from app.services.microsoft_token_service import MicrosoftTokenService, InvalidGrantError
    from app.services.onedrive_sync_service import should_index_file
    from app.services.onedrive_content_extractor import OneDriveContentExtractor

    async with AsyncSessionLocal() as db:
        try:
            token_svc = MicrosoftTokenService(db)
            access_token = await token_svc.get_valid_access_token(user_id)
        except (ValueError, InvalidGrantError) as e:
            logger.error("OneDrive sync auth failed for user %d: %s", user_id, e)
            await _update_sync_state(db, user_id, last_error=str(e))
            return

        extractor = OneDriveContentExtractor()
        delta_url = f"{GRAPH_BASE}/me/drive/root/delta"
        params = {"$select": "id,name,file,folder,size,lastModifiedDateTime,webUrl,parentReference,deleted"}

        files_total = 0
        files_processed = 0
        delta_link = None

        try:
            async with httpx.AsyncClient() as client:
                while delta_url:
                    resp = await client.get(
                        delta_url,
                        params=params if "delta" not in delta_url or "token" not in delta_url else None,
                        headers={"Authorization": f"Bearer {access_token}"},
                        timeout=30.0,
                    )

                    if resp.status_code != 200:
                        logger.error("Delta query failed: %d %s", resp.status_code, resp.text[:300])
                        await _update_sync_state(db, user_id, last_error=f"Delta query failed: HTTP {resp.status_code}")
                        return

                    data = resp.json()
                    items = data.get("value", [])

                    for item in items:
                        if "deleted" in item:
                            continue
                        if "folder" in item:
                            continue

                        name = item.get("name", "")
                        mime_type = item.get("file", {}).get("mimeType", "")
                        size = item.get("size", 0)

                        if not should_index_file(name, mime_type, size):
                            continue

                        files_total += 1

                        try:
                            # Download file content
                            dl_url = f"{GRAPH_BASE}/me/drive/items/{item['id']}/content"
                            dl_resp = await client.get(
                                dl_url,
                                headers={"Authorization": f"Bearer {access_token}"},
                                follow_redirects=True,
                                timeout=30.0,
                            )

                            if dl_resp.status_code == 200:
                                extracted = extractor.extract(dl_resp.content, mime_type, name)
                                if extracted.get("text"):
                                    await _upsert_library_item(
                                        db,
                                        user_id=user_id,
                                        tenant_id=tenant_id,
                                        drive_item_id=item["id"],
                                        name=name,
                                        mime_type=mime_type,
                                        size=size,
                                        content=extracted["text"],
                                        web_url=item.get("webUrl", ""),
                                        last_modified=item.get("lastModifiedDateTime"),
                                    )
                                    files_processed += 1

                        except Exception as e:
                            logger.warning("Failed to process file %s: %s", name, e)

                    # Follow pagination or get delta link
                    delta_url = data.get("@odata.nextLink")
                    if not delta_url:
                        delta_link = data.get("@odata.deltaLink")

            await _update_sync_state(
                db, user_id,
                delta_link=delta_link,
                files_total=files_total,
                files_processed=files_processed,
                last_error=None,
            )
            logger.info("OneDrive initial sync complete for user %d: %d/%d files", user_id, files_processed, files_total)

        except Exception as e:
            logger.error("OneDrive initial sync failed for user %d: %s", user_id, e)
            await _update_sync_state(db, user_id, last_error=str(e))


@shared_task(name="onedrive.process_changes", bind=True, max_retries=3)
def process_onedrive_changes(self, user_id: int, tenant_id: str = ""):
    """Process incremental changes via delta token."""
    import asyncio
    asyncio.get_event_loop().run_until_complete(
        _process_changes_async(self, user_id, tenant_id)
    )


async def _process_changes_async(task, user_id: int, tenant_id: str):
    from app.core.database import AsyncSessionLocal
    from app.services.microsoft_token_service import MicrosoftTokenService, InvalidGrantError
    from app.services.onedrive_sync_service import should_index_file
    from app.services.onedrive_content_extractor import OneDriveContentExtractor

    async with AsyncSessionLocal() as db:
        # Get current delta link
        sync_state = await _get_sync_state(db, user_id)
        if not sync_state or not sync_state.get("delta_link"):
            logger.info("No delta link for user %d, running initial sync", user_id)
            initial_onedrive_sync.delay(user_id, tenant_id)
            return

        try:
            token_svc = MicrosoftTokenService(db)
            access_token = await token_svc.get_valid_access_token(user_id)
        except (ValueError, InvalidGrantError) as e:
            logger.error("OneDrive change processing auth failed for user %d: %s", user_id, e)
            return

        extractor = OneDriveContentExtractor()
        delta_url = sync_state["delta_link"]
        delta_link = None
        changes_processed = 0

        try:
            async with httpx.AsyncClient() as client:
                while delta_url:
                    resp = await client.get(
                        delta_url,
                        headers={"Authorization": f"Bearer {access_token}"},
                        timeout=30.0,
                    )

                    if resp.status_code == 410:
                        # Delta token expired, need full resync
                        logger.info("Delta token expired for user %d, triggering full resync", user_id)
                        await _update_sync_state(db, user_id, delta_link=None)
                        initial_onedrive_sync.delay(user_id, tenant_id)
                        return

                    if resp.status_code != 200:
                        logger.error("Delta change query failed: %d", resp.status_code)
                        return

                    data = resp.json()
                    items = data.get("value", [])

                    for item in items:
                        if "deleted" in item:
                            await _remove_library_item(db, user_id, item["id"])
                            changes_processed += 1
                            continue

                        if "folder" in item:
                            continue

                        name = item.get("name", "")
                        mime_type = item.get("file", {}).get("mimeType", "")
                        size = item.get("size", 0)

                        if not should_index_file(name, mime_type, size):
                            continue

                        try:
                            dl_url = f"{GRAPH_BASE}/me/drive/items/{item['id']}/content"
                            dl_resp = await client.get(
                                dl_url,
                                headers={"Authorization": f"Bearer {access_token}"},
                                follow_redirects=True,
                                timeout=30.0,
                            )

                            if dl_resp.status_code == 200:
                                extracted = extractor.extract(dl_resp.content, mime_type, name)
                                if extracted.get("text"):
                                    await _upsert_library_item(
                                        db,
                                        user_id=user_id,
                                        tenant_id=tenant_id,
                                        drive_item_id=item["id"],
                                        name=name,
                                        mime_type=mime_type,
                                        size=size,
                                        content=extracted["text"],
                                        web_url=item.get("webUrl", ""),
                                        last_modified=item.get("lastModifiedDateTime"),
                                    )
                                    changes_processed += 1

                        except Exception as e:
                            logger.warning("Failed to process changed file %s: %s", name, e)

                    delta_url = data.get("@odata.nextLink")
                    if not delta_url:
                        delta_link = data.get("@odata.deltaLink")

            if delta_link:
                await _update_sync_state(db, user_id, delta_link=delta_link)

            logger.info("OneDrive changes processed for user %d: %d changes", user_id, changes_processed)

        except Exception as e:
            logger.error("OneDrive change processing failed for user %d: %s", user_id, e)


@shared_task(name="onedrive.renew_subscriptions")
def renew_onedrive_subscriptions():
    """Renew expiring OneDrive webhook subscriptions."""
    import asyncio
    asyncio.get_event_loop().run_until_complete(_renew_subscriptions_async())


async def _renew_subscriptions_async():
    from app.core.database import AsyncSessionLocal
    from app.services.microsoft_token_service import MicrosoftTokenService
    from app.services.onedrive_sync_service import renew_subscription
    from sqlalchemy import select, text

    async with AsyncSessionLocal() as db:
        # Find subscriptions expiring within 12 hours
        result = await db.execute(
            text("""
                SELECT "userId", "subscriptionId", "subscriptionExpiry"
                FROM onedrive_sync_state
                WHERE "subscriptionId" IS NOT NULL
                AND "subscriptionExpiry" < NOW() + INTERVAL '12 hours'
                AND "autoSyncEnabled" = true
            """)
        )
        rows = result.fetchall()

        for row in rows:
            user_id, subscription_id, _ = row
            try:
                token_svc = MicrosoftTokenService(db)
                access_token = await token_svc.get_valid_access_token(user_id)
                new_expiry = await renew_subscription(access_token, subscription_id)
                if new_expiry:
                    await db.execute(
                        text("""
                            UPDATE onedrive_sync_state
                            SET "subscriptionExpiry" = :expiry
                            WHERE "userId" = :user_id
                        """),
                        {"expiry": new_expiry, "user_id": user_id},
                    )
                    await db.commit()
            except Exception as e:
                logger.error("Failed to renew subscription for user %d: %s", user_id, e)


@shared_task(name="onedrive.cleanup_edit_sessions")
def cleanup_expired_onedrive_edit_sessions():
    """Clean up expired OneDrive edit sessions."""
    import asyncio
    asyncio.get_event_loop().run_until_complete(_cleanup_sessions_async())


async def _cleanup_sessions_async():
    from app.core.database import AsyncSessionLocal
    from sqlalchemy import text

    async with AsyncSessionLocal() as db:
        result = await db.execute(
            text("""
                UPDATE onedrive_edit_sessions
                SET status = 'expired'
                WHERE status = 'active'
                AND "expiresAt" < NOW()
                RETURNING id, "driveItemId"
            """)
        )
        expired = result.fetchall()
        await db.commit()

        if expired:
            logger.info("Expired %d OneDrive edit sessions", len(expired))


@shared_task(name="onedrive.disconnect_cleanup")
def disconnect_onedrive_cleanup(user_id: int):
    """Clean up after OneDrive disconnect: cancel subscription, delete temp files, cleanup DB."""
    import asyncio
    asyncio.get_event_loop().run_until_complete(_disconnect_cleanup_async(user_id))


async def _disconnect_cleanup_async(user_id: int):
    from app.core.database import AsyncSessionLocal
    from app.services.microsoft_token_service import MicrosoftTokenService
    from sqlalchemy import text

    async with AsyncSessionLocal() as db:
        # Get sync state for subscription cancellation
        sync_state = await _get_sync_state(db, user_id)

        if sync_state and sync_state.get("subscription_id"):
            try:
                token_svc = MicrosoftTokenService(db)
                access_token = await token_svc.get_valid_access_token(user_id)

                async with httpx.AsyncClient() as client:
                    await client.delete(
                        f"{GRAPH_BASE}/subscriptions/{sync_state['subscription_id']}",
                        headers={"Authorization": f"Bearer {access_token}"},
                        timeout=10.0,
                    )
            except Exception as e:
                logger.warning("Failed to cancel subscription for user %d: %s", user_id, e)

        # Clean up DB records
        await db.execute(
            text('DELETE FROM onedrive_sync_state WHERE "userId" = :user_id'),
            {"user_id": user_id},
        )
        await db.execute(
            text('DELETE FROM onedrive_edit_sessions WHERE "userId" = :user_id'),
            {"user_id": user_id},
        )
        # Remove OneDrive-sourced library items
        await db.execute(
            text("""DELETE FROM library_items WHERE "userId" = :user_id AND source = 'onedrive'"""),
            {"user_id": user_id},
        )
        await db.commit()
        logger.info("OneDrive disconnect cleanup complete for user %d", user_id)


# -- DB Helpers --------------------------------------------------------------


async def _get_sync_state(db, user_id: int) -> Optional[dict]:
    from sqlalchemy import text
    result = await db.execute(
        text('SELECT "deltaLink", "subscriptionId", "subscriptionExpiry", "autoSyncEnabled" FROM onedrive_sync_state WHERE "userId" = :user_id'),
        {"user_id": user_id},
    )
    row = result.fetchone()
    if not row:
        return None
    return {
        "delta_link": row[0],
        "subscription_id": row[1],
        "subscription_expiry": row[2],
        "auto_sync_enabled": row[3],
    }


async def _update_sync_state(db, user_id: int, **kwargs):
    from sqlalchemy import text

    set_parts = ['"lastSyncAt" = NOW()']
    params = {"user_id": user_id}

    if "delta_link" in kwargs:
        set_parts.append('"deltaLink" = :delta_link')
        params["delta_link"] = kwargs["delta_link"]
    if "files_total" in kwargs:
        set_parts.append('"filesTotal" = :files_total')
        params["files_total"] = kwargs["files_total"]
    if "files_processed" in kwargs:
        set_parts.append('"filesProcessed" = :files_processed')
        params["files_processed"] = kwargs["files_processed"]
    if "last_error" in kwargs:
        set_parts.append('"lastError" = :last_error')
        params["last_error"] = kwargs["last_error"]

    set_clause = ", ".join(set_parts)
    await db.execute(
        text(f'UPDATE onedrive_sync_state SET {set_clause} WHERE "userId" = :user_id'),
        params,
    )
    await db.commit()


async def _upsert_library_item(db, *, user_id, tenant_id, drive_item_id, name, mime_type, size, content, web_url, last_modified):
    """Upsert a library item from OneDrive."""
    from sqlalchemy import text

    await db.execute(
        text("""
            INSERT INTO library_items ("userId", "tenantId", title, source, "sourceUrl", "mimeType", "fileSize", content, "externalId", "lastExternalModified", "createdAt", "updatedAt")
            VALUES (:user_id, :tenant_id, :title, 'onedrive', :web_url, :mime_type, :file_size, :content, :external_id, :last_modified, NOW(), NOW())
            ON CONFLICT ("userId", "externalId") WHERE source = 'onedrive'
            DO UPDATE SET
                title = EXCLUDED.title,
                "sourceUrl" = EXCLUDED."sourceUrl",
                "mimeType" = EXCLUDED."mimeType",
                "fileSize" = EXCLUDED."fileSize",
                content = EXCLUDED.content,
                "lastExternalModified" = EXCLUDED."lastExternalModified",
                "updatedAt" = NOW()
        """),
        {
            "user_id": user_id,
            "tenant_id": tenant_id or None,
            "title": name,
            "web_url": web_url,
            "mime_type": mime_type,
            "file_size": size,
            "content": content[:100000],  # Limit content size
            "external_id": drive_item_id,
            "last_modified": last_modified,
        },
    )
    await db.commit()


async def _remove_library_item(db, user_id: int, drive_item_id: str):
    """Remove a library item sourced from OneDrive."""
    from sqlalchemy import text
    await db.execute(
        text("""DELETE FROM library_items WHERE "userId" = :user_id AND "externalId" = :external_id AND source = 'onedrive'"""),
        {"user_id": user_id, "external_id": drive_item_id},
    )
    await db.commit()


async def _estimate_sync_cost_impl(user_id: int, tenant_id: str) -> dict:
    """Count matching OneDrive files and return estimated credit cost."""
    from sqlalchemy import text
    from app.core.database import AsyncSessionLocal
    from app.services.microsoft_token_service import MicrosoftTokenService, InvalidGrantError
    from app.services.onedrive_sync_service import should_index_file

    async with AsyncSessionLocal() as db:
        sync_state = await db.execute(
            text("""
                SELECT "indexingMode", "folderSelections", "fileTypeFilter", "maxFileSizeBytes"
                FROM onedrive_sync_state
                WHERE "userId" = :user_id
            """),
            {"user_id": user_id},
        )
        row = sync_state.fetchone()
        if not row:
            return {"file_count": 0, "estimated_credits": 0, "estimated_size_mb": 0}

        indexing_mode = row[0]
        max_file_size = row[3] or 52428800

        if indexing_mode == "none":
            return {"file_count": 0, "estimated_credits": 0, "estimated_size_mb": 0}

        try:
            token_svc = MicrosoftTokenService(db)
            access_token = await token_svc.get_valid_access_token(user_id)
        except (ValueError, InvalidGrantError) as e:
            return {"file_count": 0, "estimated_credits": 0, "estimated_size_mb": 0, "error": str(e)}

        # Use delta query to enumerate all files
        delta_url = f"{GRAPH_BASE}/me/drive/root/delta"
        params = {"$select": "id,name,file,folder,size,lastModifiedDateTime"}
        file_count = 0
        total_size = 0

        async with httpx.AsyncClient() as client:
            while delta_url:
                resp = await client.get(
                    delta_url,
                    params=params if "token" not in delta_url else None,
                    headers={"Authorization": f"Bearer {access_token}"},
                    timeout=30.0,
                )

                if resp.status_code != 200:
                    break

                data = resp.json()
                items = data.get("value", [])

                for item in items:
                    if "deleted" in item or "folder" in item:
                        continue
                    name = item.get("name", "")
                    mime_type = item.get("file", {}).get("mimeType", "")
                    size = item.get("size", 0)

                    if should_index_file(name, mime_type, size, max_file_size=max_file_size):
                        file_count += 1
                        total_size += size

                delta_url = data.get("@odata.nextLink")
                if not delta_url and "@odata.deltaLink" in data:
                    break

        # Estimate: ~2 credits per chunk, ~1 chunk per 1000 chars, ~5 chars/byte
        estimated_chars = total_size * 5
        estimated_chunks = max(1, estimated_chars // 1000) if file_count else 0
        estimated_credits = estimated_chunks * 2

        return {
            "file_count": file_count,
            "estimated_credits": estimated_credits,
            "estimated_size_mb": round(total_size / (1024 * 1024), 1),
        }
