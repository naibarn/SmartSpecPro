"""
Unit Tests for ModerationService

This module tests the content moderation service which handles:
- Keyword-based filtering
- OpenAI Moderation API integration
- Pattern matching for sensitive topics
- Logging moderation actions to database

Test Paths:
- Path 1: Keyword Block - Content blocked by keyword filter
- Path 2: OpenAI Flag (Strict) - Content flagged by OpenAI, strict mode
- Path 3: OpenAI Flag (Non-Strict) - Content flagged by OpenAI, non-strict mode
- Path 4: OpenAI API Failure - Fallback to pattern matching
- Path 5: Pattern Flag - Content flagged by pattern matching
- Path 6: Allowed - Content passes all checks
"""

import pytest
import sys
from unittest.mock import AsyncMock, MagicMock, patch
from datetime import datetime

from app.services.moderation_service import ModerationService, ModerationLog


# =============================================================================
# Fixtures
# =============================================================================

@pytest.fixture
def mock_db_session():
    """Create a mock AsyncSession for database operations."""
    session = AsyncMock()
    session.add = MagicMock()
    session.commit = AsyncMock()
    session.execute = AsyncMock()
    return session


@pytest.fixture
def mock_openai_client():
    """Create a mock AsyncOpenAI client."""
    client = AsyncMock()
    return client


@pytest.fixture
def moderation_service_no_openai(mock_db_session):
    """
    Create ModerationService without OpenAI client.
    This simulates when OPENAI_API_KEY is not set.
    """
    with patch('app.services.moderation_service.settings') as mock_settings:
        mock_settings.OPENAI_API_KEY = None
        service = ModerationService(mock_db_session)
        return service


@pytest.fixture
def moderation_service_with_openai(mock_db_session, mock_openai_client):
    """
    Create ModerationService with mocked OpenAI client.
    """
    with patch('app.services.moderation_service.settings') as mock_settings:
        mock_settings.OPENAI_API_KEY = "test-api-key"
        with patch('app.services.moderation_service.AsyncOpenAI') as mock_openai_class:
            mock_openai_class.return_value = mock_openai_client
            service = ModerationService(mock_db_session)
            service.openai_client = mock_openai_client
            return service


@pytest.fixture
def service_with_blocked_keywords(mock_db_session):
    """
    Create ModerationService with custom blocked keywords for testing.
    """
    with patch('app.services.moderation_service.settings') as mock_settings:
        mock_settings.OPENAI_API_KEY = None
        service = ModerationService(mock_db_session)
        # Add test blocked keywords
        service.BLOCKED_KEYWORDS = ["forbidden", "banned", "prohibited"]
        return service


# =============================================================================
# Test: Path 1 - Keyword Block
# =============================================================================

class TestPath1KeywordBlock:
    """
    Test Path 1: Content blocked by keyword filter.
    
    When content contains blocked keywords, it should be immediately blocked
    without calling OpenAI API or pattern matching.
    """
    
    @pytest.mark.asyncio
    async def test_keyword_block_single_keyword(self, service_with_blocked_keywords, mock_db_session):
        """Test blocking content with a single blocked keyword."""
        result = await service_with_blocked_keywords.moderate_request(
            user_id="user-123",
            content="This content contains forbidden word",
            strict_mode=False
        )
        
        assert result["flagged"] is True
        assert result["action"] == "blocked"
        assert result["reason"] == "Content contains blocked keywords"
        assert "blocked_keywords" in result["categories"]
        assert "forbidden" in result["categories"]["blocked_keywords"]
    
    @pytest.mark.asyncio
    async def test_keyword_block_multiple_keywords(self, service_with_blocked_keywords, mock_db_session):
        """Test blocking content with multiple blocked keywords."""
        result = await service_with_blocked_keywords.moderate_request(
            user_id="user-123",
            content="This has forbidden and banned words",
            strict_mode=False
        )
        
        assert result["flagged"] is True
        assert result["action"] == "blocked"
        assert "forbidden" in result["categories"]["blocked_keywords"]
        assert "banned" in result["categories"]["blocked_keywords"]
    
    @pytest.mark.asyncio
    async def test_keyword_block_case_insensitive(self, service_with_blocked_keywords, mock_db_session):
        """Test that keyword blocking is case-insensitive."""
        result = await service_with_blocked_keywords.moderate_request(
            user_id="user-123",
            content="This has FORBIDDEN and BaNnEd words",
            strict_mode=False
        )
        
        assert result["flagged"] is True
        assert result["action"] == "blocked"
    
    @pytest.mark.asyncio
    async def test_keyword_block_logs_to_database(self, service_with_blocked_keywords, mock_db_session):
        """Test that blocked content is logged to database."""
        await service_with_blocked_keywords.moderate_request(
            user_id="user-123",
            content="This contains forbidden content",
            strict_mode=False
        )
        
        # Verify db.add was called
        mock_db_session.add.assert_called_once()
        
        # Verify the log entry
        log_entry = mock_db_session.add.call_args[0][0]
        assert isinstance(log_entry, ModerationLog)
        assert log_entry.user_id == "user-123"
        assert log_entry.content_type == "request"
        assert log_entry.flagged is True
        assert log_entry.action_taken == "blocked"
        
        # Verify commit was called
        mock_db_session.commit.assert_called_once()
    
    @pytest.mark.asyncio
    async def test_keyword_block_strict_mode_no_difference(self, service_with_blocked_keywords, mock_db_session):
        """Test that strict_mode doesn't affect keyword blocking (always blocked)."""
        result_strict = await service_with_blocked_keywords.moderate_request(
            user_id="user-123",
            content="This contains forbidden content",
            strict_mode=True
        )
        
        # Reset mock for second call
        mock_db_session.reset_mock()
        
        result_non_strict = await service_with_blocked_keywords.moderate_request(
            user_id="user-456",
            content="This contains forbidden content",
            strict_mode=False
        )
        
        # Both should be blocked regardless of strict_mode
        assert result_strict["action"] == "blocked"
        assert result_non_strict["action"] == "blocked"
    
    @pytest.mark.asyncio
    async def test_keyword_block_partial_match(self, service_with_blocked_keywords, mock_db_session):
        """Test that partial matches within words are detected."""
        # "forbidden" should match in "unforbidden" due to substring matching
        result = await service_with_blocked_keywords.moderate_request(
            user_id="user-123",
            content="This is unforbidden territory",
            strict_mode=False
        )
        
        assert result["flagged"] is True
        assert result["action"] == "blocked"


# =============================================================================
# Test: Path 2 - OpenAI Flag (Strict Mode)
# =============================================================================

class TestPath2OpenAIFlagStrict:
    """
    Test Path 2: Content flagged by OpenAI Moderation API in strict mode.
    
    When OpenAI flags content and strict_mode=True, the content should be blocked.
    """
    
    @pytest.fixture
    def service_with_flagging_openai(self, mock_db_session):
        """
        Create ModerationService with OpenAI client that flags content.
        """
        with patch('app.services.moderation_service.settings') as mock_settings:
            mock_settings.OPENAI_API_KEY = "test-api-key"
            with patch('app.services.moderation_service.AsyncOpenAI') as mock_openai_class:
                mock_client = AsyncMock()
                
                # Setup mock response that flags content
                mock_result = MagicMock()
                mock_result.flagged = True
                mock_result.categories = MagicMock()
                mock_result.categories.model_dump.return_value = {
                    "hate": True,
                    "harassment": False,
                    "self-harm": False,
                    "sexual": False,
                    "violence": False
                }
                
                mock_response = MagicMock()
                mock_response.results = [mock_result]
                mock_client.moderations.create = AsyncMock(return_value=mock_response)
                
                mock_openai_class.return_value = mock_client
                service = ModerationService(mock_db_session)
                service.openai_client = mock_client
                return service
    
    @pytest.mark.asyncio
    async def test_openai_flag_strict_mode_blocks(self, service_with_flagging_openai, mock_db_session):
        """Test that OpenAI flagged content is blocked in strict mode."""
        result = await service_with_flagging_openai.moderate_request(
            user_id="user-123",
            content="Some content that OpenAI will flag",
            strict_mode=True
        )
        
        assert result["flagged"] is True
        assert result["action"] == "blocked"
        assert result["reason"] == "Content flagged by moderation system"
        assert "hate" in result["categories"]
    
    @pytest.mark.asyncio
    async def test_openai_flag_strict_mode_logs_correctly(self, service_with_flagging_openai, mock_db_session):
        """Test that blocked content is logged with correct action."""
        await service_with_flagging_openai.moderate_request(
            user_id="user-123",
            content="Some content that OpenAI will flag",
            strict_mode=True
        )
        
        # Verify db.add was called
        mock_db_session.add.assert_called_once()
        
        # Verify the log entry
        log_entry = mock_db_session.add.call_args[0][0]
        assert isinstance(log_entry, ModerationLog)
        assert log_entry.user_id == "user-123"
        assert log_entry.flagged is True
        assert log_entry.action_taken == "blocked"
    
    @pytest.mark.asyncio
    async def test_openai_flag_multiple_categories(self, mock_db_session):
        """Test that multiple flagged categories are captured."""
        with patch('app.services.moderation_service.settings') as mock_settings:
            mock_settings.OPENAI_API_KEY = "test-api-key"
            with patch('app.services.moderation_service.AsyncOpenAI') as mock_openai_class:
                mock_client = AsyncMock()
                
                # Setup mock response with multiple flagged categories
                mock_result = MagicMock()
                mock_result.flagged = True
                mock_result.categories = MagicMock()
                mock_result.categories.model_dump.return_value = {
                    "hate": True,
                    "harassment": True,
                    "self-harm": False,
                    "sexual": False,
                    "violence": True
                }
                
                mock_response = MagicMock()
                mock_response.results = [mock_result]
                mock_client.moderations.create = AsyncMock(return_value=mock_response)
                
                mock_openai_class.return_value = mock_client
                service = ModerationService(mock_db_session)
                service.openai_client = mock_client
                
                result = await service.moderate_request(
                    user_id="user-123",
                    content="Content with multiple violations",
                    strict_mode=True
                )
                
                assert result["flagged"] is True
                assert "hate" in result["categories"]
                assert "harassment" in result["categories"]
                assert "violence" in result["categories"]


# =============================================================================
# Test: Path 3 - OpenAI Flag (Non-Strict Mode)
# =============================================================================

class TestPath3OpenAIFlagNonStrict:
    """
    Test Path 3: Content flagged by OpenAI Moderation API in non-strict mode.
    
    When OpenAI flags content and strict_mode=False, the content should be warned
    but not blocked.
    """
    
    @pytest.fixture
    def service_with_flagging_openai(self, mock_db_session):
        """
        Create ModerationService with OpenAI client that flags content.
        """
        with patch('app.services.moderation_service.settings') as mock_settings:
            mock_settings.OPENAI_API_KEY = "test-api-key"
            with patch('app.services.moderation_service.AsyncOpenAI') as mock_openai_class:
                mock_client = AsyncMock()
                
                # Setup mock response that flags content
                mock_result = MagicMock()
                mock_result.flagged = True
                mock_result.categories = MagicMock()
                mock_result.categories.model_dump.return_value = {
                    "hate": False,
                    "harassment": True,
                    "self-harm": False,
                    "sexual": False,
                    "violence": False
                }
                
                mock_response = MagicMock()
                mock_response.results = [mock_result]
                mock_client.moderations.create = AsyncMock(return_value=mock_response)
                
                mock_openai_class.return_value = mock_client
                service = ModerationService(mock_db_session)
                service.openai_client = mock_client
                return service
    
    @pytest.mark.asyncio
    async def test_openai_flag_non_strict_mode_warns(self, service_with_flagging_openai, mock_db_session):
        """Test that OpenAI flagged content is warned (not blocked) in non-strict mode."""
        result = await service_with_flagging_openai.moderate_request(
            user_id="user-123",
            content="Some content that OpenAI will flag",
            strict_mode=False
        )
        
        assert result["flagged"] is True
        assert result["action"] == "warned"
        assert result["reason"] == "Content may be sensitive"
        assert "harassment" in result["categories"]
    
    @pytest.mark.asyncio
    async def test_openai_flag_non_strict_mode_logs_correctly(self, service_with_flagging_openai, mock_db_session):
        """Test that warned content is logged with correct action."""
        await service_with_flagging_openai.moderate_request(
            user_id="user-123",
            content="Some content that OpenAI will flag",
            strict_mode=False
        )
        
        # Verify db.add was called
        mock_db_session.add.assert_called_once()
        
        # Verify the log entry
        log_entry = mock_db_session.add.call_args[0][0]
        assert isinstance(log_entry, ModerationLog)
        assert log_entry.user_id == "user-123"
        assert log_entry.flagged is True
        assert log_entry.action_taken == "warned"
    
    @pytest.mark.asyncio
    async def test_openai_flag_non_strict_returns_categories(self, service_with_flagging_openai, mock_db_session):
        """Test that flagged categories are returned in the result."""
        result = await service_with_flagging_openai.moderate_request(
            user_id="user-123",
            content="Some content that OpenAI will flag",
            strict_mode=False
        )
        
        assert "categories" in result
        assert isinstance(result["categories"], dict)
        assert "harassment" in result["categories"]
    
    @pytest.mark.asyncio
    async def test_strict_vs_non_strict_comparison(self, mock_db_session):
        """Test the difference between strict and non-strict modes."""
        with patch('app.services.moderation_service.settings') as mock_settings:
            mock_settings.OPENAI_API_KEY = "test-api-key"
            with patch('app.services.moderation_service.AsyncOpenAI') as mock_openai_class:
                mock_client = AsyncMock()
                
                # Setup mock response that flags content
                mock_result = MagicMock()
                mock_result.flagged = True
                mock_result.categories = MagicMock()
                mock_result.categories.model_dump.return_value = {
                    "hate": False,
                    "harassment": True,
                    "self-harm": False,
                    "sexual": False,
                    "violence": False
                }
                
                mock_response = MagicMock()
                mock_response.results = [mock_result]
                mock_client.moderations.create = AsyncMock(return_value=mock_response)
                
                mock_openai_class.return_value = mock_client
                service = ModerationService(mock_db_session)
                service.openai_client = mock_client
                
                # Test strict mode
                result_strict = await service.moderate_request(
                    user_id="user-123",
                    content="Flagged content",
                    strict_mode=True
                )
                
                mock_db_session.reset_mock()
                
                # Test non-strict mode
                result_non_strict = await service.moderate_request(
                    user_id="user-456",
                    content="Flagged content",
                    strict_mode=False
                )
                
                # Both should be flagged
                assert result_strict["flagged"] is True
                assert result_non_strict["flagged"] is True
                
                # But actions should differ
                assert result_strict["action"] == "blocked"
                assert result_non_strict["action"] == "warned"


# =============================================================================
# Test: Path 4 - OpenAI API Failure (Fallback to Pattern Matching)
# =============================================================================

class TestPath4OpenAIAPIFailure:
    """
    Test Path 4: OpenAI API failure with fallback to pattern matching.
    
    When OpenAI Moderation API fails, the service should:
    1. Log the error
    2. Fall back to pattern matching
    3. Continue processing without blocking
    """
    
    @pytest.fixture
    def service_with_failing_openai(self, mock_db_session):
        """
        Create ModerationService with OpenAI client that raises an exception.
        """
        with patch('app.services.moderation_service.settings') as mock_settings:
            mock_settings.OPENAI_API_KEY = "test-api-key"
            with patch('app.services.moderation_service.AsyncOpenAI') as mock_openai_class:
                mock_client = AsyncMock()
                
                # Setup mock to raise an exception
                mock_client.moderations.create = AsyncMock(
                    side_effect=Exception("OpenAI API connection failed")
                )
                
                mock_openai_class.return_value = mock_client
                service = ModerationService(mock_db_session)
                service.openai_client = mock_client
                return service
    
    @pytest.mark.asyncio
    async def test_openai_failure_fallback_to_pattern_matching(self, service_with_failing_openai, mock_db_session):
        """
        Test that when OpenAI API fails, the service falls back to pattern matching.
        Content without sensitive patterns should be allowed.
        """
        result = await service_with_failing_openai.moderate_request(
            user_id="user-123",
            content="This is a normal message about programming.",
            strict_mode=False
        )
        
        # Should be allowed because pattern matching doesn't flag it
        assert result["flagged"] is False
        assert result["action"] == "allowed"
        assert result["reason"] == "Content passed moderation"
    
    @pytest.mark.asyncio
    async def test_openai_failure_pattern_matching_catches_sensitive_content(self, service_with_failing_openai, mock_db_session):
        """
        Test that when OpenAI API fails, pattern matching still catches sensitive content.
        """
        result = await service_with_failing_openai.moderate_request(
            user_id="user-123",
            content="This message discusses violence in detail.",
            strict_mode=False
        )
        
        # Should be warned because pattern matching catches "violence"
        assert result["flagged"] is True
        assert result["action"] == "warned"
        assert result["reason"] == "Content contains sensitive topics"
        assert "sensitive_topics" in result["categories"]
        assert "violence" in result["categories"]["sensitive_topics"]
    
    @pytest.mark.asyncio
    async def test_openai_failure_continues_processing(self, service_with_failing_openai, mock_db_session):
        """
        Test that OpenAI API failure doesn't crash the service.
        The error is logged internally (via structlog) and processing continues.
        """
        # This test verifies that the exception is caught and handled gracefully
        # The service should continue to pattern matching without raising
        result = await service_with_failing_openai.moderate_request(
            user_id="user-123",
            content="Normal content without sensitive topics",
            strict_mode=False
        )
        
        # Should complete successfully despite OpenAI failure
        assert result is not None
        assert result["action"] in ["allowed", "warned"]
    
    @pytest.mark.asyncio
    async def test_openai_failure_strict_mode_still_uses_pattern_matching(self, service_with_failing_openai, mock_db_session):
        """
        Test that strict mode still works with pattern matching when OpenAI fails.
        Note: Pattern matching always returns 'warned', not 'blocked'.
        """
        result = await service_with_failing_openai.moderate_request(
            user_id="user-123",
            content="This discusses hate speech and violence.",
            strict_mode=True
        )
        
        # Pattern matching flags it, but action is 'warned' (not 'blocked')
        # because pattern matching doesn't support strict mode
        assert result["flagged"] is True
        assert result["action"] == "warned"
    
    @pytest.mark.asyncio
    async def test_openai_failure_different_exception_types(self, mock_db_session):
        """
        Test that different exception types are handled gracefully.
        """
        exception_types = [
            Exception("Generic error"),
            ConnectionError("Network unreachable"),
            TimeoutError("Request timed out"),
            ValueError("Invalid response"),
        ]
        
        for exc in exception_types:
            with patch('app.services.moderation_service.settings') as mock_settings:
                mock_settings.OPENAI_API_KEY = "test-api-key"
                with patch('app.services.moderation_service.AsyncOpenAI') as mock_openai_class:
                    mock_client = AsyncMock()
                    mock_client.moderations.create = AsyncMock(side_effect=exc)
                    
                    mock_openai_class.return_value = mock_client
                    service = ModerationService(mock_db_session)
                    service.openai_client = mock_client
                    
                    # Should not raise, should fall back gracefully
                    result = await service.moderate_request(
                        user_id="user-123",
                        content="Normal content",
                        strict_mode=False
                    )
                    
                    assert result["action"] in ["allowed", "warned"]
                    mock_db_session.reset_mock()
    
    @pytest.mark.asyncio
    async def test_openai_failure_logs_to_database_correctly(self, service_with_failing_openai, mock_db_session):
        """
        Test that moderation result is still logged to database after OpenAI failure.
        """
        await service_with_failing_openai.moderate_request(
            user_id="user-123",
            content="Normal content without sensitive topics",
            strict_mode=False
        )
        
        # Verify db.add was called (for the final allowed result)
        mock_db_session.add.assert_called_once()
        
        log_entry = mock_db_session.add.call_args[0][0]
        assert isinstance(log_entry, ModerationLog)
        assert log_entry.action_taken == "allowed"
    
    @pytest.mark.asyncio
    async def test_openai_failure_structlog_logging_with_sys_modules_patch(self, mock_db_session):
        """
        Test that the local import of structlog inside the except block is executed.
        
        Since structlog is already imported by other modules in the app, we need to
        patch the actual structlog module's get_logger function instead of replacing
        the entire module in sys.modules.
        
        This test specifically covers Lines 103-114 in moderation_service.py:
        - Line 103: except Exception as e:
        - Line 105: import structlog
        - Line 106: logger = structlog.get_logger()
        - Line 107-112: logger.warning(...)
        - Line 114: openai_result = {"flagged": False}
        """
        import structlog
        
        # 1. Create a mock logger
        mock_logger = MagicMock()
        
        # 2. Create a service that will fail OpenAI checks
        with patch('app.services.moderation_service.settings') as mock_settings:
            mock_settings.OPENAI_API_KEY = "test-api-key"
            with patch('app.services.moderation_service.AsyncOpenAI') as mock_openai_class:
                mock_client = AsyncMock()
                mock_client.moderations.create = AsyncMock(
                    side_effect=Exception("API is down")
                )
                mock_openai_class.return_value = mock_client
                service = ModerationService(mock_db_session)
                service.openai_client = mock_client
                
                # 3. Patch structlog.get_logger to return our mock logger
                with patch.object(structlog, 'get_logger', return_value=mock_logger):
                    # 4. Trigger the method that will raise the exception
                    await service.moderate_request(
                        user_id="user-sys-patch",
                        content="some content"
                    )
                    
                    # 5. Assert that the mock logger.warning was called with correct args
                    mock_logger.warning.assert_called_once()
                    call_args, call_kwargs = mock_logger.warning.call_args
                    
                    assert call_args[0] == "openai_moderation_failed"
                    assert call_kwargs["error"] == "API is down"
                    assert call_kwargs["user_id"] == "user-sys-patch"
                    assert call_kwargs["fallback"] == "pattern_matching"
    
    @pytest.mark.asyncio
    async def test_openai_failure_structlog_with_different_errors(self, mock_db_session):
        """
        Test that different exception types are logged correctly via structlog.
        """
        import structlog
        
        mock_logger = MagicMock()
        
        error_types = [
            ConnectionError("Network unreachable"),
            TimeoutError("Request timed out"),
            ValueError("Invalid response format"),
        ]
        
        for error in error_types:
            mock_logger.reset_mock()
            
            with patch('app.services.moderation_service.settings') as mock_settings:
                mock_settings.OPENAI_API_KEY = "test-api-key"
                with patch('app.services.moderation_service.AsyncOpenAI') as mock_openai_class:
                    mock_client = AsyncMock()
                    mock_client.moderations.create = AsyncMock(side_effect=error)
                    mock_openai_class.return_value = mock_client
                    service = ModerationService(mock_db_session)
                    service.openai_client = mock_client
                    
                    with patch.object(structlog, 'get_logger', return_value=mock_logger):
                        await service.moderate_request(
                            user_id="user-error-test",
                            content="test content"
                        )
                        
                        # Verify logger.warning was called with the correct error message
                        mock_logger.warning.assert_called_once()
                        _, call_kwargs = mock_logger.warning.call_args
                        assert call_kwargs["error"] == str(error)
            
            mock_db_session.reset_mock()


# =============================================================================
# Test: Path 5 - Pattern Flag
# =============================================================================

class TestPath5PatternFlag:
    """
    Test Path 5: Content flagged by pattern matching.
    
    When content matches sensitive patterns (without OpenAI client),
    it should be warned.
    """
    
    @pytest.mark.asyncio
    async def test_pattern_flag_single_topic(self, moderation_service_no_openai, mock_db_session):
        """Test that content with single sensitive topic is warned."""
        result = await moderation_service_no_openai.moderate_request(
            user_id="user-123",
            content="This message discusses violence in movies.",
            strict_mode=False
        )
        
        assert result["flagged"] is True
        assert result["action"] == "warned"
        assert result["reason"] == "Content contains sensitive topics"
        assert "sensitive_topics" in result["categories"]
        assert "violence" in result["categories"]["sensitive_topics"]
    
    @pytest.mark.asyncio
    async def test_pattern_flag_multiple_topics(self, moderation_service_no_openai, mock_db_session):
        """Test that content with multiple sensitive topics is warned."""
        result = await moderation_service_no_openai.moderate_request(
            user_id="user-123",
            content="This discusses hate speech and self-harm prevention.",
            strict_mode=False
        )
        
        assert result["flagged"] is True
        assert result["action"] == "warned"
        assert "hate" in result["categories"]["sensitive_topics"]
        assert "self-harm" in result["categories"]["sensitive_topics"]
    
    @pytest.mark.asyncio
    async def test_pattern_flag_logs_correctly(self, moderation_service_no_openai, mock_db_session):
        """Test that pattern-flagged content is logged correctly."""
        await moderation_service_no_openai.moderate_request(
            user_id="user-123",
            content="Content about harassment policies.",
            strict_mode=False
        )
        
        mock_db_session.add.assert_called_once()
        log_entry = mock_db_session.add.call_args[0][0]
        assert log_entry.flagged is True
        assert log_entry.action_taken == "warned"
    
    @pytest.mark.asyncio
    async def test_pattern_flag_strict_mode_still_warns(self, moderation_service_no_openai, mock_db_session):
        """
        Test that pattern matching always warns, even in strict mode.
        (Pattern matching doesn't support blocking, only warning)
        """
        result = await moderation_service_no_openai.moderate_request(
            user_id="user-123",
            content="This discusses violence.",
            strict_mode=True
        )
        
        # Pattern matching always warns, never blocks
        assert result["flagged"] is True
        assert result["action"] == "warned"


# =============================================================================
# Test: Path 6 - Allowed
# =============================================================================

class TestPath6Allowed:
    """
    Test Path 6: Content passes all moderation checks.
    
    When content doesn't contain blocked keywords, isn't flagged by OpenAI,
    and doesn't match sensitive patterns, it should be allowed.
    """
    
    @pytest.mark.asyncio
    async def test_allowed_clean_content_no_openai(self, moderation_service_no_openai, mock_db_session):
        """Test that clean content is allowed when OpenAI is not available."""
        result = await moderation_service_no_openai.moderate_request(
            user_id="user-123",
            content="This is a completely normal and safe message about programming.",
            strict_mode=False
        )
        
        assert result["flagged"] is False
        assert result["action"] == "allowed"
        assert result["reason"] == "Content passed moderation"
        assert result["categories"] == {}
    
    @pytest.mark.asyncio
    async def test_allowed_logs_to_database(self, moderation_service_no_openai, mock_db_session):
        """Test that allowed content is logged to database."""
        await moderation_service_no_openai.moderate_request(
            user_id="user-123",
            content="This is safe content.",
            strict_mode=False
        )
        
        # Verify db.add was called
        mock_db_session.add.assert_called_once()
        
        # Verify the log entry
        log_entry = mock_db_session.add.call_args[0][0]
        assert isinstance(log_entry, ModerationLog)
        assert log_entry.user_id == "user-123"
        assert log_entry.content_type == "request"
        assert log_entry.flagged is False
        assert log_entry.action_taken == "allowed"
        
        # Verify commit was called
        mock_db_session.commit.assert_called_once()
    
    @pytest.mark.asyncio
    async def test_allowed_with_openai_not_flagged(self, moderation_service_with_openai, mock_db_session, mock_openai_client):
        """Test that content is allowed when OpenAI doesn't flag it."""
        # Mock OpenAI response - not flagged
        mock_result = MagicMock()
        mock_result.flagged = False
        mock_result.categories = MagicMock()
        mock_result.categories.model_dump.return_value = {
            "hate": False,
            "harassment": False,
            "self-harm": False,
            "sexual": False,
            "violence": False
        }
        
        mock_response = MagicMock()
        mock_response.results = [mock_result]
        mock_openai_client.moderations.create = AsyncMock(return_value=mock_response)
        
        result = await moderation_service_with_openai.moderate_request(
            user_id="user-123",
            content="This is a completely normal message.",
            strict_mode=False
        )
        
        assert result["flagged"] is False
        assert result["action"] == "allowed"
    
    @pytest.mark.asyncio
    async def test_allowed_empty_content(self, moderation_service_no_openai, mock_db_session):
        """Test that empty content is allowed."""
        result = await moderation_service_no_openai.moderate_request(
            user_id="user-123",
            content="",
            strict_mode=False
        )
        
        assert result["flagged"] is False
        assert result["action"] == "allowed"
    
    @pytest.mark.asyncio
    async def test_allowed_whitespace_only(self, moderation_service_no_openai, mock_db_session):
        """Test that whitespace-only content is allowed."""
        result = await moderation_service_no_openai.moderate_request(
            user_id="user-123",
            content="   \n\t   ",
            strict_mode=False
        )
        
        assert result["flagged"] is False
        assert result["action"] == "allowed"
    
    @pytest.mark.asyncio
    async def test_allowed_technical_content(self, moderation_service_no_openai, mock_db_session):
        """Test that technical/code content is allowed."""
        code_content = """
        def calculate_sum(a, b):
            return a + b
        
        # This function adds two numbers
        result = calculate_sum(5, 10)
        print(f"The sum is: {result}")
        """
        
        result = await moderation_service_no_openai.moderate_request(
            user_id="user-123",
            content=code_content,
            strict_mode=False
        )
        
        assert result["flagged"] is False
        assert result["action"] == "allowed"
    
    @pytest.mark.asyncio
    async def test_allowed_unicode_content(self, moderation_service_no_openai, mock_db_session):
        """Test that unicode/international content is allowed."""
        unicode_content = "สวัสดีครับ こんにちは 你好 مرحبا"
        
        result = await moderation_service_no_openai.moderate_request(
            user_id="user-123",
            content=unicode_content,
            strict_mode=False
        )
        
        assert result["flagged"] is False
        assert result["action"] == "allowed"
    
    @pytest.mark.asyncio
    async def test_allowed_long_content(self, moderation_service_no_openai, mock_db_session):
        """Test that long content is allowed and truncated for logging."""
        long_content = "This is a test. " * 100  # ~1600 characters
        
        result = await moderation_service_no_openai.moderate_request(
            user_id="user-123",
            content=long_content,
            strict_mode=False
        )
        
        assert result["flagged"] is False
        assert result["action"] == "allowed"
        
        # Verify content is truncated in log
        log_entry = mock_db_session.add.call_args[0][0]
        assert len(log_entry.content) <= 1000


# =============================================================================
# Test: _check_keywords helper method
# =============================================================================

class TestCheckKeywords:
    """Test the _check_keywords helper method."""
    
    def test_check_keywords_no_blocked_keywords(self, moderation_service_no_openai):
        """Test with empty blocked keywords list."""
        result = moderation_service_no_openai._check_keywords("any content here")
        
        assert result["flagged"] is False
        assert result["categories"] == {}
    
    def test_check_keywords_with_match(self, service_with_blocked_keywords):
        """Test with matching blocked keyword."""
        result = service_with_blocked_keywords._check_keywords("this is forbidden")
        
        assert result["flagged"] is True
        assert "blocked_keywords" in result["categories"]
        assert "forbidden" in result["categories"]["blocked_keywords"]
    
    def test_check_keywords_no_match(self, service_with_blocked_keywords):
        """Test with no matching blocked keyword."""
        result = service_with_blocked_keywords._check_keywords("this is safe content")
        
        assert result["flagged"] is False
        assert result["categories"] == {}


# =============================================================================
# Test: _check_patterns helper method
# =============================================================================

class TestCheckPatterns:
    """Test the _check_patterns helper method."""
    
    def test_check_patterns_no_sensitive_topics(self, moderation_service_no_openai):
        """Test with content that has no sensitive topics."""
        result = moderation_service_no_openai._check_patterns("This is a normal message about coding.")
        
        assert result["flagged"] is False
        assert result["categories"] == {}
    
    def test_check_patterns_with_sensitive_topic(self, moderation_service_no_openai):
        """Test with content containing sensitive topic."""
        result = moderation_service_no_openai._check_patterns("This discusses violence in video games.")
        
        assert result["flagged"] is True
        assert "sensitive_topics" in result["categories"]
        assert "violence" in result["categories"]["sensitive_topics"]
    
    def test_check_patterns_multiple_sensitive_topics(self, moderation_service_no_openai):
        """Test with content containing multiple sensitive topics."""
        result = moderation_service_no_openai._check_patterns(
            "This discusses violence and hate speech."
        )
        
        assert result["flagged"] is True
        assert "violence" in result["categories"]["sensitive_topics"]
        assert "hate" in result["categories"]["sensitive_topics"]
    
    def test_check_patterns_word_boundary(self, moderation_service_no_openai):
        """Test that pattern matching respects word boundaries."""
        # "violent" should not match "violence" pattern due to word boundary
        result = moderation_service_no_openai._check_patterns("This is not violent behavior.")
        
        # "violent" != "violence", so should not be flagged
        # Note: This depends on the exact implementation of pattern matching
        # The current implementation uses word boundary matching
        assert result["flagged"] is False or "violence" not in result.get("categories", {}).get("sensitive_topics", [])


# =============================================================================
# Test: moderate_response method
# =============================================================================

class TestModerateResponse:
    """Test the moderate_response method for LLM response moderation."""
    
    @pytest.mark.asyncio
    async def test_moderate_response_allowed(self, moderation_service_no_openai, mock_db_session):
        """Test that clean response is allowed."""
        result = await moderation_service_no_openai.moderate_response(
            user_id="user-123",
            content="Here is the answer to your question about Python programming."
        )
        
        assert result["flagged"] is False
        assert result["action"] == "allowed"
        assert result["reason"] == "Response passed moderation"
    
    @pytest.mark.asyncio
    async def test_moderate_response_filtered(self, service_with_blocked_keywords, mock_db_session):
        """Test that response with blocked keywords is filtered."""
        result = await service_with_blocked_keywords.moderate_response(
            user_id="user-123",
            content="This response contains forbidden content."
        )
        
        assert result["flagged"] is True
        assert result["action"] == "filtered"
        assert result["reason"] == "Response contains inappropriate content"
    
    @pytest.mark.asyncio
    async def test_moderate_response_logs_correctly(self, moderation_service_no_openai, mock_db_session):
        """Test that response moderation logs with correct content_type."""
        await moderation_service_no_openai.moderate_response(
            user_id="user-123",
            content="Safe response content."
        )
        
        log_entry = mock_db_session.add.call_args[0][0]
        assert log_entry.content_type == "response"
        assert log_entry.action_taken == "allowed"


# =============================================================================
# Test: get_user_moderation_history method
# =============================================================================

class TestGetUserModerationHistory:
    """Test the get_user_moderation_history method."""
    
    @pytest.fixture
    def mock_moderation_logs(self):
        """Create mock ModerationLog objects."""
        from datetime import datetime
        import json
        
        logs = []
        for i in range(3):
            log = MagicMock()
            log.id = f"log-{i}"
            log.content_type = "request" if i % 2 == 0 else "response"
            log.flagged = i == 0  # First one is flagged
            log.categories = json.dumps({"hate": True}) if i == 0 else None
            log.action_taken = "blocked" if i == 0 else "allowed"
            log.created_at = datetime(2024, 1, 1, 12, 0, i)
            logs.append(log)
        
        return logs
    
    @pytest.mark.asyncio
    async def test_get_user_moderation_history_returns_logs(self, mock_db_session, mock_moderation_logs):
        """Test that get_user_moderation_history returns formatted logs."""
        # Setup mock execute result
        mock_result = MagicMock()
        mock_scalars = MagicMock()
        mock_scalars.all.return_value = mock_moderation_logs
        mock_result.scalars.return_value = mock_scalars
        mock_db_session.execute = AsyncMock(return_value=mock_result)
        
        with patch('app.services.moderation_service.settings') as mock_settings:
            mock_settings.OPENAI_API_KEY = None
            service = ModerationService(mock_db_session)
            
            result = await service.get_user_moderation_history(
                user_id="user-123",
                limit=10
            )
        
        assert len(result) == 3
        assert result[0]["id"] == "log-0"
        assert result[0]["flagged"] is True
        assert result[0]["categories"] == {"hate": True}
        assert result[0]["action_taken"] == "blocked"
        assert result[1]["flagged"] is False
        assert result[1]["categories"] == {}
    
    @pytest.mark.asyncio
    async def test_get_user_moderation_history_empty_result(self, mock_db_session):
        """Test that get_user_moderation_history handles empty results."""
        # Setup mock execute result with empty list
        mock_result = MagicMock()
        mock_scalars = MagicMock()
        mock_scalars.all.return_value = []
        mock_result.scalars.return_value = mock_scalars
        mock_db_session.execute = AsyncMock(return_value=mock_result)
        
        with patch('app.services.moderation_service.settings') as mock_settings:
            mock_settings.OPENAI_API_KEY = None
            service = ModerationService(mock_db_session)
            
            result = await service.get_user_moderation_history(
                user_id="user-123",
                limit=10
            )
        
        assert result == []
    
    @pytest.mark.asyncio
    async def test_get_user_moderation_history_respects_limit(self, mock_db_session):
        """Test that get_user_moderation_history respects the limit parameter."""
        mock_result = MagicMock()
        mock_scalars = MagicMock()
        mock_scalars.all.return_value = []
        mock_result.scalars.return_value = mock_scalars
        mock_db_session.execute = AsyncMock(return_value=mock_result)
        
        with patch('app.services.moderation_service.settings') as mock_settings:
            mock_settings.OPENAI_API_KEY = None
            service = ModerationService(mock_db_session)
            
            await service.get_user_moderation_history(
                user_id="user-123",
                limit=5
            )
        
        # Verify execute was called (query was built correctly)
        mock_db_session.execute.assert_called_once()
    
    @pytest.mark.asyncio
    async def test_get_user_moderation_history_formats_datetime(self, mock_db_session):
        """Test that datetime is formatted as ISO string."""
        from datetime import datetime
        
        mock_log = MagicMock()
        mock_log.id = "log-1"
        mock_log.content_type = "request"
        mock_log.flagged = False
        mock_log.categories = None
        mock_log.action_taken = "allowed"
        mock_log.created_at = datetime(2024, 6, 15, 10, 30, 45)
        
        mock_result = MagicMock()
        mock_scalars = MagicMock()
        mock_scalars.all.return_value = [mock_log]
        mock_result.scalars.return_value = mock_scalars
        mock_db_session.execute = AsyncMock(return_value=mock_result)
        
        with patch('app.services.moderation_service.settings') as mock_settings:
            mock_settings.OPENAI_API_KEY = None
            service = ModerationService(mock_db_session)
            
            result = await service.get_user_moderation_history(
                user_id="user-123",
                limit=10
            )
        
        assert result[0]["created_at"] == "2024-06-15T10:30:45"


# =============================================================================
# Test: get_flagged_content method
# =============================================================================

class TestGetFlaggedContent:
    """Test the get_flagged_content method for admin review."""
    
    @pytest.fixture
    def mock_flagged_logs(self):
        """Create mock flagged ModerationLog objects."""
        from datetime import datetime
        import json
        
        logs = []
        for i in range(2):
            log = MagicMock()
            log.id = f"flagged-{i}"
            log.user_id = f"user-{i}"
            log.content_type = "request"
            log.content = f"Flagged content {i}"
            log.flagged = True
            log.categories = json.dumps({"hate": True, "violence": i == 1})
            log.action_taken = "blocked"
            log.created_at = datetime(2024, 1, 1, 12, 0, i)
            logs.append(log)
        
        return logs
    
    @pytest.mark.asyncio
    async def test_get_flagged_content_returns_flagged_logs(self, mock_db_session, mock_flagged_logs):
        """Test that get_flagged_content returns only flagged content."""
        mock_result = MagicMock()
        mock_scalars = MagicMock()
        mock_scalars.all.return_value = mock_flagged_logs
        mock_result.scalars.return_value = mock_scalars
        mock_db_session.execute = AsyncMock(return_value=mock_result)
        
        with patch('app.services.moderation_service.settings') as mock_settings:
            mock_settings.OPENAI_API_KEY = None
            service = ModerationService(mock_db_session)
            
            result = await service.get_flagged_content(limit=100)
        
        assert len(result) == 2
        assert result[0]["id"] == "flagged-0"
        assert result[0]["user_id"] == "user-0"
        assert result[0]["content"] == "Flagged content 0"
        assert result[0]["flagged"] is True
        assert result[0]["categories"] == {"hate": True, "violence": False}
    
    @pytest.mark.asyncio
    async def test_get_flagged_content_with_content_type_filter(self, mock_db_session, mock_flagged_logs):
        """Test that get_flagged_content filters by content_type."""
        mock_result = MagicMock()
        mock_scalars = MagicMock()
        mock_scalars.all.return_value = mock_flagged_logs
        mock_result.scalars.return_value = mock_scalars
        mock_db_session.execute = AsyncMock(return_value=mock_result)
        
        with patch('app.services.moderation_service.settings') as mock_settings:
            mock_settings.OPENAI_API_KEY = None
            service = ModerationService(mock_db_session)
            
            result = await service.get_flagged_content(
                limit=100,
                content_type="request"
            )
        
        # Verify execute was called with content_type filter
        mock_db_session.execute.assert_called_once()
        assert len(result) == 2
    
    @pytest.mark.asyncio
    async def test_get_flagged_content_empty_result(self, mock_db_session):
        """Test that get_flagged_content handles empty results."""
        mock_result = MagicMock()
        mock_scalars = MagicMock()
        mock_scalars.all.return_value = []
        mock_result.scalars.return_value = mock_scalars
        mock_db_session.execute = AsyncMock(return_value=mock_result)
        
        with patch('app.services.moderation_service.settings') as mock_settings:
            mock_settings.OPENAI_API_KEY = None
            service = ModerationService(mock_db_session)
            
            result = await service.get_flagged_content(limit=100)
        
        assert result == []
    
    @pytest.mark.asyncio
    async def test_get_flagged_content_includes_user_id(self, mock_db_session, mock_flagged_logs):
        """Test that get_flagged_content includes user_id in results."""
        mock_result = MagicMock()
        mock_scalars = MagicMock()
        mock_scalars.all.return_value = mock_flagged_logs
        mock_result.scalars.return_value = mock_scalars
        mock_db_session.execute = AsyncMock(return_value=mock_result)
        
        with patch('app.services.moderation_service.settings') as mock_settings:
            mock_settings.OPENAI_API_KEY = None
            service = ModerationService(mock_db_session)
            
            result = await service.get_flagged_content(limit=100)
        
        # Verify user_id is included (unlike get_user_moderation_history)
        assert "user_id" in result[0]
        assert result[0]["user_id"] == "user-0"
        assert result[1]["user_id"] == "user-1"
    
    @pytest.mark.asyncio
    async def test_get_flagged_content_includes_full_content(self, mock_db_session, mock_flagged_logs):
        """Test that get_flagged_content includes full content for admin review."""
        mock_result = MagicMock()
        mock_scalars = MagicMock()
        mock_scalars.all.return_value = mock_flagged_logs
        mock_result.scalars.return_value = mock_scalars
        mock_db_session.execute = AsyncMock(return_value=mock_result)
        
        with patch('app.services.moderation_service.settings') as mock_settings:
            mock_settings.OPENAI_API_KEY = None
            service = ModerationService(mock_db_session)
            
            result = await service.get_flagged_content(limit=100)
        
        # Verify full content is included for admin review
        assert "content" in result[0]
        assert result[0]["content"] == "Flagged content 0"


# =============================================================================
# Test: _check_openai_moderation helper method
# =============================================================================

class TestCheckOpenAIModeration:
    """Test the _check_openai_moderation helper method directly."""
    
    @pytest.mark.asyncio
    async def test_check_openai_moderation_no_client_returns_not_flagged(self, mock_db_session):
        """
        Test that _check_openai_moderation returns not flagged when openai_client is None.
        This covers Line 272 in moderation_service.py.
        """
        with patch('app.services.moderation_service.settings') as mock_settings:
            mock_settings.OPENAI_API_KEY = None
            service = ModerationService(mock_db_session)
            
            # Ensure openai_client is None
            assert service.openai_client is None
            
            # Call _check_openai_moderation directly
            result = await service._check_openai_moderation("any content")
            
            # Should return not flagged
            assert result["flagged"] is False
            assert result["categories"] == {}
    
    @pytest.mark.asyncio
    async def test_check_openai_moderation_with_client_success(self, mock_db_session):
        """Test that _check_openai_moderation works correctly with a client."""
        with patch('app.services.moderation_service.settings') as mock_settings:
            mock_settings.OPENAI_API_KEY = "test-api-key"
            with patch('app.services.moderation_service.AsyncOpenAI') as mock_openai_class:
                mock_client = AsyncMock()
                
                # Setup mock response
                mock_result = MagicMock()
                mock_result.flagged = False
                mock_result.categories.model_dump.return_value = {
                    "hate": False,
                    "violence": False
                }
                mock_response = MagicMock()
                mock_response.results = [mock_result]
                mock_client.moderations.create = AsyncMock(return_value=mock_response)
                mock_openai_class.return_value = mock_client
                
                service = ModerationService(mock_db_session)
                service.openai_client = mock_client
                
                result = await service._check_openai_moderation("safe content")
                
                assert result["flagged"] is False
                assert result["categories"] == {}
    
    @pytest.mark.asyncio
    async def test_check_openai_moderation_with_client_flagged(self, mock_db_session):
        """Test that _check_openai_moderation returns flagged categories correctly."""
        with patch('app.services.moderation_service.settings') as mock_settings:
            mock_settings.OPENAI_API_KEY = "test-api-key"
            with patch('app.services.moderation_service.AsyncOpenAI') as mock_openai_class:
                mock_client = AsyncMock()
                
                # Setup mock response with flagged content
                mock_result = MagicMock()
                mock_result.flagged = True
                mock_result.categories.model_dump.return_value = {
                    "hate": True,
                    "violence": False,
                    "harassment": True
                }
                mock_response = MagicMock()
                mock_response.results = [mock_result]
                mock_client.moderations.create = AsyncMock(return_value=mock_response)
                mock_openai_class.return_value = mock_client
                
                service = ModerationService(mock_db_session)
                service.openai_client = mock_client
                
                result = await service._check_openai_moderation("hateful content")
                
                assert result["flagged"] is True
                assert "hate" in result["categories"]
                assert "harassment" in result["categories"]
                assert "violence" not in result["categories"]
    
    @pytest.mark.asyncio
    async def test_check_openai_moderation_raises_exception(self, mock_db_session):
        """Test that _check_openai_moderation raises exception when API fails."""
        with patch('app.services.moderation_service.settings') as mock_settings:
            mock_settings.OPENAI_API_KEY = "test-api-key"
            with patch('app.services.moderation_service.AsyncOpenAI') as mock_openai_class:
                mock_client = AsyncMock()
                mock_client.moderations.create = AsyncMock(
                    side_effect=Exception("API connection failed")
                )
                mock_openai_class.return_value = mock_client
                
                service = ModerationService(mock_db_session)
                service.openai_client = mock_client
                
                # Should raise exception (not catch it internally)
                with pytest.raises(Exception) as exc_info:
                    await service._check_openai_moderation("any content")
                
                assert "API connection failed" in str(exc_info.value)
