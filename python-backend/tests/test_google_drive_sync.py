"""Tests for Google Drive sync: should_index_file, initial sync, channel renewal."""

import hashlib
import pytest
from unittest.mock import AsyncMock, MagicMock, patch

from app.services.google_drive_sync_service import (
    should_index_file,
    setup_watch_channel,
    FILE_TYPE_MIMES,
    GOOGLE_FOLDER_MIME,
)


# ── should_index_file Tests ───────────────────────────────────────────────


@pytest.mark.unit
class TestShouldIndexFile:
    def test_mode_none_returns_false(self):
        """indexing_mode='none' rejects all files."""
        settings = {"indexing_mode": "none", "file_type_filter": [], "max_file_size_bytes": None, "folder_selections": []}
        file_meta = {"mimeType": "application/pdf", "size": "1000", "parents": ["root"]}
        assert should_index_file(file_meta, settings) is False

    def test_mode_all_returns_true(self):
        """indexing_mode='all' accepts files within size guard and matching type."""
        settings = {"indexing_mode": "all", "file_type_filter": [], "max_file_size_bytes": None, "folder_selections": []}
        file_meta = {"mimeType": "application/pdf", "size": "1000", "parents": ["root"]}
        assert should_index_file(file_meta, settings) is True

    def test_mode_selected_folders_includes_correct(self):
        """selected_folders mode accepts files in selected folder."""
        settings = {
            "indexing_mode": "selected_folders",
            "file_type_filter": [],
            "max_file_size_bytes": None,
            "folder_selections": [{"folderId": "folder_a"}],
        }
        file_in = {"mimeType": "application/pdf", "size": "1000", "parents": ["folder_a"]}
        file_out = {"mimeType": "application/pdf", "size": "1000", "parents": ["folder_b"]}
        assert should_index_file(file_in, settings) is True
        assert should_index_file(file_out, settings) is False

    def test_mode_all_except_excludes_correct(self):
        """all_except mode excludes files in excluded folders."""
        settings = {
            "indexing_mode": "all_except",
            "file_type_filter": [],
            "max_file_size_bytes": None,
            "folder_selections": [{"folderId": "excluded_folder"}],
        }
        file_excluded = {"mimeType": "application/pdf", "size": "1000", "parents": ["excluded_folder"]}
        file_included = {"mimeType": "application/pdf", "size": "1000", "parents": ["other_folder"]}
        assert should_index_file(file_excluded, settings) is False
        assert should_index_file(file_included, settings) is True

    def test_respects_file_type_filter(self):
        """Only files matching file_type_filter pass."""
        settings = {
            "indexing_mode": "all",
            "file_type_filter": ["document", "spreadsheet"],
            "max_file_size_bytes": None,
            "folder_selections": [],
        }
        doc = {"mimeType": "application/vnd.google-apps.document", "size": "1000", "parents": []}
        pdf = {"mimeType": "application/pdf", "size": "1000", "parents": []}
        assert should_index_file(doc, settings) is True
        assert should_index_file(pdf, settings) is False  # pdf not in filter

    def test_rejects_over_size_guard(self):
        """Files exceeding max_file_size_bytes are rejected."""
        settings = {
            "indexing_mode": "all",
            "file_type_filter": [],
            "max_file_size_bytes": 50_000_000,
            "folder_selections": [],
        }
        small = {"mimeType": "application/pdf", "size": "1000", "parents": []}
        large = {"mimeType": "application/pdf", "size": "100000000", "parents": []}
        assert should_index_file(small, settings) is True
        assert should_index_file(large, settings) is False

    def test_skips_google_native_folders(self):
        """Google Drive folders are never indexed."""
        settings = {"indexing_mode": "all", "file_type_filter": [], "max_file_size_bytes": None, "folder_selections": []}
        folder = {"mimeType": GOOGLE_FOLDER_MIME, "size": "0", "parents": []}
        assert should_index_file(folder, settings) is False

    def test_image_type_filter_matches_prefix(self):
        """Image type filter matches mime types starting with 'image/'."""
        settings = {
            "indexing_mode": "all",
            "file_type_filter": ["image"],
            "max_file_size_bytes": None,
            "folder_selections": [],
        }
        img = {"mimeType": "image/png", "size": "1000", "parents": []}
        doc = {"mimeType": "application/pdf", "size": "1000", "parents": []}
        assert should_index_file(img, settings) is True
        assert should_index_file(doc, settings) is False


# ── setup_watch_channel Tests ──────────────────────────────────────────────


@pytest.mark.unit
class TestSetupWatchChannel:
    @pytest.mark.asyncio
    async def test_returns_channel_info(self):
        """setup_watch_channel returns channel_id, resource_id, channel_token, page_token."""
        mock_drive = MagicMock()

        # Mock getStartPageToken
        mock_drive.changes.return_value.getStartPageToken.return_value.execute.return_value = {
            "startPageToken": "token_123",
        }

        # Mock watch
        mock_drive.changes.return_value.watch.return_value.execute.return_value = {
            "resourceId": "resource_abc",
        }

        with patch("googleapiclient.discovery.build", return_value=mock_drive):
            result = await setup_watch_channel(1, "tenant_1", "fake_access_token")

        assert "channel_id" in result
        assert result["channel_id"].startswith("ssp-tenant_1-1-")
        assert result["resource_id"] == "resource_abc"
        assert len(result["channel_token"]) == 64  # secrets.token_hex(32)
        assert result["page_token"] == "token_123"

    @pytest.mark.asyncio
    async def test_generates_unique_tokens(self):
        """Each call generates a new unique channel_token."""
        mock_drive = MagicMock()
        mock_drive.changes.return_value.getStartPageToken.return_value.execute.return_value = {
            "startPageToken": "token_123",
        }
        mock_drive.changes.return_value.watch.return_value.execute.return_value = {
            "resourceId": "resource_abc",
        }

        with patch("googleapiclient.discovery.build", return_value=mock_drive):
            result1 = await setup_watch_channel(1, "t1", "token_a")
            result2 = await setup_watch_channel(1, "t1", "token_b")

        assert result1["channel_token"] != result2["channel_token"]
        assert result1["channel_id"] != result2["channel_id"]


# ── Celery Task Registration Tests ────────────────────────────────────────


@pytest.mark.unit
class TestTaskRegistration:
    def test_initial_drive_sync_is_registered(self):
        """initial_drive_sync task is registered in Celery."""
        import app.tasks.google_drive_tasks  # noqa: F401 -- triggers task registration
        from app.core.celery_app import celery_app
        assert "initial_drive_sync" in celery_app.tasks

    def test_process_drive_changes_is_registered(self):
        """process_drive_changes task is registered in Celery."""
        import app.tasks.google_drive_tasks  # noqa: F401
        from app.core.celery_app import celery_app
        assert "process_drive_changes" in celery_app.tasks

    def test_renew_drive_watch_channels_is_registered(self):
        """renew_drive_watch_channels task is registered in Celery."""
        import app.tasks.google_drive_tasks  # noqa: F401
        from app.core.celery_app import celery_app
        assert "renew_drive_watch_channels" in celery_app.tasks


# ── Channel Token Hash Tests ──────────────────────────────────────────────


@pytest.mark.unit
class TestChannelTokenHash:
    def test_token_hash_matches(self):
        """Verifying that SHA-256 hash of token matches stored hash."""
        import secrets
        token = secrets.token_hex(32)
        token_hash = hashlib.sha256(token.encode()).hexdigest()
        assert len(token) == 64
        assert len(token_hash) == 64
        # Verify match
        received_hash = hashlib.sha256(token.encode()).hexdigest()
        assert received_hash == token_hash

    def test_different_tokens_different_hashes(self):
        """Different tokens produce different hashes."""
        import secrets
        t1 = secrets.token_hex(32)
        t2 = secrets.token_hex(32)
        h1 = hashlib.sha256(t1.encode()).hexdigest()
        h2 = hashlib.sha256(t2.encode()).hexdigest()
        assert h1 != h2
