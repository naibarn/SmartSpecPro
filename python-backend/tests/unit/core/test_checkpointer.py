"""
Tests for the checkpointer module.

Tests cover:
- CheckpointerFactory creation
- Memory checkpointer fallback
- PostgreSQL checkpointer initialization
- Connection pool management
"""

import pytest
from unittest.mock import AsyncMock, MagicMock, patch
from langgraph.checkpoint.memory import MemorySaver

from app.core.checkpointer import (
    CheckpointerFactory,
    get_memory_checkpointer,
    get_checkpointer,
    close_checkpointer,
    get_connection_pool,
)


class TestMemoryCheckpointer:
    """Tests for in-memory checkpointer."""
    
    def test_get_memory_checkpointer_returns_memory_saver(self):
        """Test that get_memory_checkpointer returns a MemorySaver instance."""
        checkpointer = get_memory_checkpointer()
        assert isinstance(checkpointer, MemorySaver)
    
    def test_get_memory_checkpointer_returns_new_instance(self):
        """Test that each call returns a new instance."""
        cp1 = get_memory_checkpointer()
        cp2 = get_memory_checkpointer()
        # MemorySaver instances are independent
        assert cp1 is not cp2


class TestCheckpointerFactory:
    """Tests for CheckpointerFactory."""
    
    def test_create_sync_returns_memory_saver(self):
        """Test that create_sync returns a MemorySaver."""
        checkpointer = CheckpointerFactory.create_sync()
        assert isinstance(checkpointer, MemorySaver)
    
    @pytest.mark.asyncio
    async def test_create_with_postgres_false_returns_memory(self):
        """Test that create with use_postgres=False returns MemorySaver."""
        checkpointer = await CheckpointerFactory.create(use_postgres=False)
        assert isinstance(checkpointer, MemorySaver)
    
    @pytest.mark.asyncio
    async def test_create_falls_back_to_memory_on_postgres_error(self):
        """Test that create falls back to MemorySaver when PostgreSQL fails."""
        with patch('app.core.checkpointer.get_checkpointer') as mock_get:
            mock_get.side_effect = Exception("Connection failed")
            
            checkpointer = await CheckpointerFactory.create(use_postgres=True)
            
            # Should fall back to memory
            assert isinstance(checkpointer, MemorySaver)
    
    @pytest.mark.asyncio
    async def test_create_with_empty_database_url_returns_memory(self):
        """Test that create returns MemorySaver when DATABASE_URL is empty."""
        with patch('app.core.checkpointer.settings') as mock_settings:
            mock_settings.CHECKPOINT_DATABASE_URL = ""
            
            checkpointer = await CheckpointerFactory.create(use_postgres=True)
            
            assert isinstance(checkpointer, MemorySaver)


class TestPostgresCheckpointer:
    """Tests for PostgreSQL checkpointer."""
    
    @pytest.mark.asyncio
    async def test_get_connection_pool_creates_pool(self):
        """Test that get_connection_pool creates a connection pool."""
        with patch('app.core.checkpointer.AsyncConnectionPool') as MockPool:
            mock_pool = AsyncMock()
            MockPool.return_value = mock_pool
            
            with patch('app.core.checkpointer._connection_pool', None):
                with patch('app.core.checkpointer.settings') as mock_settings:
                    mock_settings.CHECKPOINT_DATABASE_URL = "postgresql://test"
                    mock_settings.CHECKPOINT_POOL_SIZE = 5
                    
                    # Reset global
                    import app.core.checkpointer as cp_module
                    cp_module._connection_pool = None
                    
                    pool = await get_connection_pool()
                    
                    MockPool.assert_called_once()
                    mock_pool.open.assert_called_once()
    
    @pytest.mark.asyncio
    async def test_get_checkpointer_creates_saver(self):
        """Test that get_checkpointer creates AsyncPostgresSaver."""
        with patch('app.core.checkpointer.get_connection_pool') as mock_get_pool:
            mock_pool = AsyncMock()
            mock_get_pool.return_value = mock_pool
            
            with patch('app.core.checkpointer.AsyncPostgresSaver') as MockSaver:
                mock_saver = AsyncMock()
                MockSaver.return_value = mock_saver
                
                # Reset global
                import app.core.checkpointer as cp_module
                cp_module._checkpointer = None
                
                checkpointer = await get_checkpointer()
                
                MockSaver.assert_called_once_with(mock_pool)
                mock_saver.setup.assert_called_once()
    
    @pytest.mark.asyncio
    async def test_close_checkpointer_closes_pool(self):
        """Test that close_checkpointer closes the connection pool."""
        mock_pool = AsyncMock()
        
        import app.core.checkpointer as cp_module
        cp_module._connection_pool = mock_pool
        cp_module._checkpointer = MagicMock()
        
        await close_checkpointer()
        
        mock_pool.close.assert_called_once()
        assert cp_module._connection_pool is None
        assert cp_module._checkpointer is None
    
    @pytest.mark.asyncio
    async def test_close_checkpointer_handles_none_pool(self):
        """Test that close_checkpointer handles None pool gracefully."""
        import app.core.checkpointer as cp_module
        cp_module._connection_pool = None
        cp_module._checkpointer = None
        
        # Should not raise
        await close_checkpointer()


class TestCheckpointerIntegration:
    """Integration tests for checkpointer with orchestrator."""
    
    @pytest.mark.asyncio
    async def test_orchestrator_uses_memory_checkpointer_in_test_mode(self):
        """Test that orchestrator uses memory checkpointer when use_postgres=False."""
        from app.orchestrator.orchestrator import WorkflowOrchestrator
        
        orchestrator = WorkflowOrchestrator(use_postgres=False)
        
        # Ensure checkpointer
        checkpointer = await orchestrator._ensure_checkpointer()
        
        assert isinstance(checkpointer, MemorySaver)
        assert orchestrator._initialized is True
    
    @pytest.mark.asyncio
    async def test_orchestrator_close_is_idempotent(self):
        """Test that orchestrator.close() can be called multiple times."""
        from app.orchestrator.orchestrator import WorkflowOrchestrator
        
        orchestrator = WorkflowOrchestrator(use_postgres=False)
        
        # Close without initialization
        await orchestrator.close()
        
        # Initialize
        await orchestrator._ensure_checkpointer()
        
        # Close
        await orchestrator.close()
        
        # Close again - should not raise
        await orchestrator.close()
    
    @pytest.mark.asyncio
    async def test_orchestrator_checkpointer_property_returns_none_before_init(self):
        """Test that checkpointer property returns None before initialization."""
        from app.orchestrator.orchestrator import WorkflowOrchestrator
        
        orchestrator = WorkflowOrchestrator(use_postgres=False)
        
        assert orchestrator.checkpointer is None
        assert orchestrator._initialized is False
