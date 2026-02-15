"""Tests for Google Drive edit session cleanup tasks."""

import pytest
from datetime import datetime, timezone, timedelta
from unittest.mock import MagicMock, patch

from app.tasks.google_drive_tasks import (
    _handle_expired_session,
    _check_recently_modified,
    _delete_drive_file,
)


@pytest.mark.unit
class TestCleanupExpiredEditSessions:

    @patch("app.tasks.google_drive_tasks._delete_drive_file", return_value=True)
    @patch("app.tasks.google_drive_tasks._check_recently_modified", return_value=False)
    def test_expires_session_when_not_recently_modified(self, mock_check, mock_delete):
        """Cleanup expires sessions when the Drive file was NOT recently modified."""
        mock_db = MagicMock()
        now = datetime.now(timezone.utc)

        _handle_expired_session(mock_db, session_id=1, user_id=42, drive_file_id="abc123", now=now)

        mock_delete.assert_called_once_with(42, "abc123")
        mock_db.execute.assert_called_once()
        params = mock_db.execute.call_args[0][1]
        assert params["status"] == "expired"

    @patch("app.tasks.google_drive_tasks._delete_drive_file")
    @patch("app.tasks.google_drive_tasks._check_recently_modified", return_value=True)
    def test_extends_session_when_recently_modified(self, mock_check, mock_delete):
        """Cleanup extends the session if Drive file was modified within last 2 hours."""
        mock_db = MagicMock()
        now = datetime.now(timezone.utc)

        _handle_expired_session(mock_db, session_id=2, user_id=42, drive_file_id="abc123", now=now)

        mock_delete.assert_not_called()
        mock_db.execute.assert_called_once()
        params = mock_db.execute.call_args[0][1]
        assert params["new_expires"] > now

    def test_check_recently_modified_returns_true_for_recent_files(self):
        """Returns True when the Drive file was modified within the last 2 hours."""
        recent_time = (datetime.now(timezone.utc) - timedelta(minutes=30)).strftime("%Y-%m-%dT%H:%M:%S.%fZ")

        mock_session = MagicMock()
        mock_session.__enter__ = MagicMock(return_value=mock_session)
        mock_session.__exit__ = MagicMock(return_value=False)
        mock_session.execute.return_value.fetchone.return_value = ("fake-token",)

        mock_drive = MagicMock()
        mock_drive.files.return_value.get.return_value.execute.return_value = {"modifiedTime": recent_time}

        with patch("app.tasks.google_drive_tasks.get_sync_session", return_value=mock_session), \
             patch("googleapiclient.discovery.build", return_value=mock_drive):
            result = _check_recently_modified(user_id=1, drive_file_id="file1")
            assert result is True

    def test_check_recently_modified_returns_false_for_old_files(self):
        """Returns False when the Drive file was modified more than 2 hours ago."""
        old_time = (datetime.now(timezone.utc) - timedelta(hours=5)).strftime("%Y-%m-%dT%H:%M:%S.%fZ")

        mock_session = MagicMock()
        mock_session.__enter__ = MagicMock(return_value=mock_session)
        mock_session.__exit__ = MagicMock(return_value=False)
        mock_session.execute.return_value.fetchone.return_value = ("fake-token",)

        mock_drive = MagicMock()
        mock_drive.files.return_value.get.return_value.execute.return_value = {"modifiedTime": old_time}

        with patch("app.tasks.google_drive_tasks.get_sync_session", return_value=mock_session), \
             patch("googleapiclient.discovery.build", return_value=mock_drive):
            result = _check_recently_modified(user_id=1, drive_file_id="file1")
            assert result is False

    def test_check_recently_modified_handles_no_token(self):
        """Returns False when no Google token exists for the user."""
        mock_session = MagicMock()
        mock_session.__enter__ = MagicMock(return_value=mock_session)
        mock_session.__exit__ = MagicMock(return_value=False)
        mock_session.execute.return_value.fetchone.return_value = None

        with patch("app.tasks.google_drive_tasks.get_sync_session", return_value=mock_session):
            result = _check_recently_modified(user_id=999, drive_file_id="file1")
            assert result is False

    def test_delete_drive_file_handles_404_gracefully(self):
        """Returns True when Drive file is already deleted (404)."""
        mock_session = MagicMock()
        mock_session.__enter__ = MagicMock(return_value=mock_session)
        mock_session.__exit__ = MagicMock(return_value=False)
        mock_session.execute.return_value.fetchone.return_value = ("fake-token",)

        mock_drive = MagicMock()
        error = Exception("Not Found")
        error.resp = {"status": "404"}
        mock_drive.files.return_value.delete.return_value.execute.side_effect = error

        with patch("app.tasks.google_drive_tasks.get_sync_session", return_value=mock_session), \
             patch("googleapiclient.discovery.build", return_value=mock_drive):
            result = _delete_drive_file(user_id=1, drive_file_id="gone-file")
            assert result is True

    def test_delete_drive_file_handles_401_token_expired(self):
        """Returns False when token is expired (401)."""
        mock_session = MagicMock()
        mock_session.__enter__ = MagicMock(return_value=mock_session)
        mock_session.__exit__ = MagicMock(return_value=False)
        mock_session.execute.return_value.fetchone.return_value = ("fake-token",)

        mock_drive = MagicMock()
        error = Exception("Unauthorized")
        error.resp = {"status": "401"}
        mock_drive.files.return_value.delete.return_value.execute.side_effect = error

        with patch("app.tasks.google_drive_tasks.get_sync_session", return_value=mock_session), \
             patch("googleapiclient.discovery.build", return_value=mock_drive):
            result = _delete_drive_file(user_id=1, drive_file_id="file1")
            assert result is False
