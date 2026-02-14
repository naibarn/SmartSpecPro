"""Google Drive sync service -- file filtering and webhook channel management."""

import logging
import secrets
import uuid
from datetime import datetime, timedelta, timezone
from typing import Any, Optional

logger = logging.getLogger(__name__)

# MIME type mapping for file_type_filter
FILE_TYPE_MIMES: dict[str, list[str]] = {
    "document": [
        "application/vnd.google-apps.document",
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        "application/msword",
    ],
    "spreadsheet": [
        "application/vnd.google-apps.spreadsheet",
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "application/vnd.ms-excel",
    ],
    "presentation": [
        "application/vnd.google-apps.presentation",
        "application/vnd.openxmlformats-officedocument.presentationml.presentation",
    ],
    "pdf": ["application/pdf"],
    "text": ["text/plain", "text/csv", "text/markdown"],
}

GOOGLE_FOLDER_MIME = "application/vnd.google-apps.folder"


def should_index_file(
    file_metadata: dict[str, Any],
    sync_settings: Any,
    folder_hierarchy_cache: Optional[dict[str, list[str]]] = None,
) -> bool:
    """Determine whether a Drive file should be indexed based on sync settings.

    sync_settings must have: indexing_mode, file_type_filter, max_file_size_bytes,
    folder_selections.
    """
    mime_type = file_metadata.get("mimeType", "")

    # 1. Reject Google Drive folders
    if mime_type == GOOGLE_FOLDER_MIME:
        return False

    # 2. Check indexing mode
    indexing_mode = getattr(sync_settings, "indexing_mode", None)
    if isinstance(sync_settings, dict):
        indexing_mode = sync_settings.get("indexing_mode")

    if indexing_mode == "none":
        return False

    # 3. Check file type filter
    file_type_filter = getattr(sync_settings, "file_type_filter", None)
    if isinstance(sync_settings, dict):
        file_type_filter = sync_settings.get("file_type_filter")

    if file_type_filter:
        allowed_mimes: set[str] = set()
        for ft in file_type_filter:
            allowed_mimes.update(FILE_TYPE_MIMES.get(ft, []))
        if mime_type not in allowed_mimes:
            # Check prefix match for image types
            if "image" in file_type_filter and mime_type.startswith("image/"):
                pass
            else:
                return False

    # 4. Check size guard
    max_size = getattr(sync_settings, "max_file_size_bytes", None)
    if isinstance(sync_settings, dict):
        max_size = sync_settings.get("max_file_size_bytes")

    if max_size:
        file_size = int(file_metadata.get("size", 0) or 0)
        if file_size > max_size:
            return False

    # 5. Folder-based filtering
    if indexing_mode == "selected_folders":
        folder_selections = _get_folder_ids(sync_settings)
        if not folder_selections:
            return False
        parents = file_metadata.get("parents", [])
        if not _parent_in_selected(parents, folder_selections, folder_hierarchy_cache):
            return False

    elif indexing_mode == "all_except":
        folder_selections = _get_folder_ids(sync_settings)
        if folder_selections:
            parents = file_metadata.get("parents", [])
            if _parent_in_selected(parents, folder_selections, folder_hierarchy_cache):
                return False

    return True


def _get_folder_ids(sync_settings: Any) -> list[str]:
    """Extract folder IDs from sync settings."""
    selections = getattr(sync_settings, "folder_selections", None)
    if isinstance(sync_settings, dict):
        selections = sync_settings.get("folder_selections")
    if not selections:
        return []
    if isinstance(selections, list):
        return [
            s.get("folderId", s) if isinstance(s, dict) else str(s)
            for s in selections
        ]
    return []


def _parent_in_selected(
    parents: list[str],
    folder_ids: list[str],
    cache: Optional[dict[str, list[str]]] = None,
) -> bool:
    """Check if any parent is in the selected folder list."""
    folder_set = set(folder_ids)
    for parent in parents:
        if parent in folder_set:
            return True
        # Check cache for parent chain
        if cache and parent in cache:
            for ancestor in cache[parent]:
                if ancestor in folder_set:
                    return True
    return False


async def setup_watch_channel(
    user_id: int,
    tenant_id: str,
    access_token: str,
) -> dict[str, Any]:
    """Create a Google Drive Changes API watch channel."""
    from google.oauth2.credentials import Credentials
    from googleapiclient.discovery import build

    creds = Credentials(token=access_token)
    drive = build("drive", "v3", credentials=creds)

    # Get start page token
    token_response = drive.changes().getStartPageToken().execute()
    page_token = token_response.get("startPageToken")

    # Generate channel credentials
    channel_token = secrets.token_hex(32)
    channel_id = f"ssp-{tenant_id}-{user_id}-{uuid.uuid4().hex[:8]}"
    expiry_ms = int((datetime.now(timezone.utc) + timedelta(days=7)).timestamp() * 1000)

    # Create watch channel
    body = {
        "id": channel_id,
        "type": "web_hook",
        "address": "https://smartaihub.app/api/webhooks/gdrive",
        "token": channel_token,
        "expiration": str(expiry_ms),
    }
    watch_response = drive.changes().watch(pageToken=page_token, body=body).execute()

    return {
        "channel_id": channel_id,
        "resource_id": watch_response.get("resourceId", ""),
        "channel_token": channel_token,
        "channel_expiry": datetime.fromtimestamp(expiry_ms / 1000, tz=timezone.utc),
        "page_token": page_token,
    }
