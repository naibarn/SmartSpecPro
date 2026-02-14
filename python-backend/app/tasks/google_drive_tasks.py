"""
Celery tasks for Google Drive edit session management.

Handles auto-expire of stale edit sessions and pre-expiry notifications.
"""

import logging
from contextlib import contextmanager
from datetime import datetime, timezone, timedelta

from sqlalchemy import create_engine, text
from sqlalchemy.orm import sessionmaker

from app.core.celery_app import celery_app
from app.core.config import settings

logger = logging.getLogger(__name__)

# How long to extend a session when the Drive file was recently modified
EXTENSION_HOURS = 24
# How recently the file must have been modified to trigger an extension
RECENT_MODIFICATION_HOURS = 2
# How close to expiry triggers a notification
NOTIFICATION_WINDOW_HOURS = 2


def _get_sync_db_url() -> str:
    """Convert async DB URL to sync for Celery tasks."""
    url = settings.DATABASE_URL
    if "+asyncpg" in url:
        return url.replace("+asyncpg", "")
    if url.startswith("postgresql+asyncpg"):
        return url.replace("postgresql+asyncpg", "postgresql")
    return url


_sync_engine = None
_SyncSession = None


@contextmanager
def get_sync_session():
    """Get a sync database session for Celery tasks."""
    global _sync_engine, _SyncSession
    if _sync_engine is None:
        _sync_engine = create_engine(_get_sync_db_url(), pool_pre_ping=True, pool_size=3)
        _SyncSession = sessionmaker(bind=_sync_engine)
    session = _SyncSession()
    try:
        yield session
        session.commit()
    except Exception:
        session.rollback()
        raise
    finally:
        session.close()


@celery_app.task(name="cleanup_expired_edit_sessions", bind=True, max_retries=2)
def cleanup_expired_edit_sessions(self):
    """
    Periodic task to clean up expired Google Drive edit sessions.

    Runs every 30 minutes via Celery beat. For each expired session:
    - If the Drive file was recently modified, extend the session
    - Otherwise, delete the temp Drive file and mark the session as expired

    Also sends notifications for sessions expiring soon.
    """

    now = datetime.now(timezone.utc)

    try:
        with get_sync_session() as db:
            # 1. Find expired active sessions
            expired_rows = db.execute(
                text("""
                    SELECT id, user_id, drive_file_id, expires_at, tenant_id
                    FROM google_drive_edit_sessions
                    WHERE status = 'active' AND expires_at < :now
                """),
                {"now": now},
            ).fetchall()

            for row in expired_rows:
                session_id = row[0]
                user_id = row[1]
                drive_file_id = row[2]
                tenant_id = row[4]

                try:
                    _handle_expired_session(db, session_id, user_id, drive_file_id, now)
                except Exception as e:
                    logger.error("Failed to handle expired session %d: %s", session_id, e)

            # 2. Find sessions expiring soon (within NOTIFICATION_WINDOW_HOURS)
            soon_threshold = now + timedelta(hours=NOTIFICATION_WINDOW_HOURS)
            soon_rows = db.execute(
                text("""
                    SELECT id, user_id, expires_at, drive_file_id
                    FROM google_drive_edit_sessions
                    WHERE status = 'active'
                      AND expires_at > :now
                      AND expires_at < :soon
                """),
                {"now": now, "soon": soon_threshold},
            ).fetchall()

            for row in soon_rows:
                session_id = row[0]
                user_id = row[1]
                logger.info("Session %d expiring soon, user %d should be notified", session_id, user_id)

            db.commit()
            logger.info(
                "Edit session cleanup: %d expired, %d expiring soon",
                len(expired_rows),
                len(soon_rows),
            )

    except Exception as e:
        logger.error("cleanup_expired_edit_sessions failed: %s", e)
        raise self.retry(exc=e, countdown=60)


def _handle_expired_session(db, session_id: int, user_id: int, drive_file_id: str, now: datetime):
    """Handle a single expired edit session."""
    # Try to check if the Drive file was recently modified
    recently_modified = _check_recently_modified(user_id, drive_file_id)

    if recently_modified:
        # Extend the session
        new_expires = now + timedelta(hours=EXTENSION_HOURS)
        db.execute(
            text("""
                UPDATE google_drive_edit_sessions
                SET expires_at = :new_expires, updated_at = :now
                WHERE id = :id
            """),
            {"new_expires": new_expires, "now": now, "id": session_id},
        )
        logger.info("Extended session %d because Drive file was recently modified", session_id)
    else:
        # Delete temp Drive file and expire the session
        deleted = _delete_drive_file(user_id, drive_file_id)
        status_val = "expired"
        db.execute(
            text("""
                UPDATE google_drive_edit_sessions
                SET status = :status, updated_at = :now
                WHERE id = :id
            """),
            {"status": status_val, "now": now, "id": session_id},
        )
        if deleted:
            logger.info("Expired session %d and deleted Drive file %s", session_id, drive_file_id)
        else:
            logger.warning("Expired session %d but could not delete Drive file %s", session_id, drive_file_id)


def _check_recently_modified(user_id: int, drive_file_id: str) -> bool:
    """Check if a Drive file was modified within the last RECENT_MODIFICATION_HOURS."""
    try:
        from google.oauth2.credentials import Credentials
        from googleapiclient.discovery import build

        with get_sync_session() as db:
            # Get sync-compatible token (simplified -- in production use async)
            from sqlalchemy import text
            result = db.execute(
                text("SELECT access_token FROM oauth_connections WHERE user_id = :uid AND provider = 'google'"),
                {"uid": user_id},
            ).fetchone()
            if not result:
                return False
            access_token = result[0]

        creds = Credentials(token=access_token)
        drive_svc = build("drive", "v3", credentials=creds)
        file_meta = drive_svc.files().get(fileId=drive_file_id, fields="modifiedTime").execute()
        modified_time = datetime.fromisoformat(file_meta["modifiedTime"].replace("Z", "+00:00"))
        threshold = datetime.now(timezone.utc) - timedelta(hours=RECENT_MODIFICATION_HOURS)
        return modified_time > threshold

    except Exception as e:
        logger.warning("Could not check Drive file modification time: %s", e)
        return False


def _delete_drive_file(user_id: int, drive_file_id: str) -> bool:
    """Delete a temporary Drive file. Returns True if deleted or already gone."""
    try:
        from google.oauth2.credentials import Credentials
        from googleapiclient.discovery import build

        with get_sync_session() as db:
            from sqlalchemy import text
            result = db.execute(
                text("SELECT access_token FROM oauth_connections WHERE user_id = :uid AND provider = 'google'"),
                {"uid": user_id},
            ).fetchone()
            if not result:
                logger.warning("No Google token for user %d, cannot delete Drive file", user_id)
                return False
            access_token = result[0]

        creds = Credentials(token=access_token)
        drive_svc = build("drive", "v3", credentials=creds)
        drive_svc.files().delete(fileId=drive_file_id).execute()
        return True

    except Exception as e:
        # 404 means already deleted
        http_status = getattr(e, "status_code", None)
        if http_status is None and hasattr(e, "resp"):
            http_status = int(e.resp.get("status", 0))
        if http_status == 404:
            return True
        # 401 means token expired -- can't delete, but mark as expired
        if http_status == 401:
            logger.warning("Token expired for user %d, cannot delete Drive file %s", user_id, drive_file_id)
            return False
        logger.error("Failed to delete Drive file %s: %s", drive_file_id, e)
        return False
