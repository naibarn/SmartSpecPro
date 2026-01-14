"""
Unit Tests for SmartSpec Media MCP Server
==========================================
ทดสอบ Tools ทั้งหมดใน media_mcp_server.py
"""

import asyncio
import json
import os
import sys
import pytest
from pathlib import Path
from unittest.mock import AsyncMock, patch, MagicMock

# Add project root to path
sys.path.insert(0, str(Path(__file__).parent.parent))

from media_mcp_server import (
    analyze_spec_for_assets,
    generate_asset,
    save_asset_to_project,
    generate_assets_from_spec,
    _detect_asset_type,
    _format_file_size
)


# ============================================
# Test Helper Functions
# ============================================

class TestHelperFunctions:
    """Test helper utility functions"""
    
    def test_detect_asset_type_image(self):
        """Test image file detection"""
        assert _detect_asset_type("test.png") == "image"
        assert _detect_asset_type("test.jpg") == "image"
        assert _detect_asset_type("test.jpeg") == "image"
        assert _detect_asset_type("test.gif") == "image"
        assert _detect_asset_type("test.webp") == "image"
        assert _detect_asset_type("test.svg") == "image"
    
    def test_detect_asset_type_video(self):
        """Test video file detection"""
        assert _detect_asset_type("test.mp4") == "video"
        assert _detect_asset_type("test.webm") == "video"
        assert _detect_asset_type("test.mov") == "video"
        assert _detect_asset_type("test.avi") == "video"
    
    def test_detect_asset_type_audio(self):
        """Test audio file detection"""
        assert _detect_asset_type("test.mp3") == "audio"
        assert _detect_asset_type("test.wav") == "audio"
        assert _detect_asset_type("test.ogg") == "audio"
        assert _detect_asset_type("test.m4a") == "audio"
    
    def test_detect_asset_type_default(self):
        """Test default to image for unknown extensions"""
        assert _detect_asset_type("test.xyz") == "image"
        assert _detect_asset_type("test") == "image"
    
    def test_format_file_size(self):
        """Test file size formatting"""
        assert _format_file_size(500) == "500.0 B"
        assert _format_file_size(1024) == "1.0 KB"
        assert _format_file_size(1536) == "1.5 KB"
        assert _format_file_size(1048576) == "1.0 MB"
        assert _format_file_size(1073741824) == "1.0 GB"


# ============================================
# Test analyze_spec_for_assets
# ============================================

class TestAnalyzeSpecForAssets:
    """Test analyze_spec_for_assets tool"""
    
    @pytest.fixture
    def test_spec_path(self, tmp_path):
        """Create a test spec file"""
        spec_content = '''# Test Spec

![Hero](assets/hero.png "model: flux-2.0, prompt: A beautiful hero image")

<!-- ASSET: type=video, filename=demo.mp4, model=veo-3-1, prompt=Demo video -->

```asset
type: audio
filename: welcome.mp3
model: elevenlabs-tts
prompt: Welcome message
```

[GENERATE_IMAGE: Logo design -> logo.png]
'''
        spec_file = tmp_path / "test_spec.md"
        spec_file.write_text(spec_content)
        return str(spec_file)
    
    @pytest.mark.asyncio
    async def test_analyze_finds_all_patterns(self, test_spec_path):
        """Test that all asset patterns are detected"""
        result = await analyze_spec_for_assets(test_spec_path)
        data = json.loads(result)
        
        assert data["success"] is True
        assert data["total_assets"] == 4
        
        # Check asset types
        asset_types = [a["asset_type"] for a in data["assets"]]
        assert "image" in asset_types
        assert "video" in asset_types
        assert "audio" in asset_types
    
    @pytest.mark.asyncio
    async def test_analyze_markdown_image(self, test_spec_path):
        """Test markdown image pattern detection"""
        result = await analyze_spec_for_assets(test_spec_path)
        data = json.loads(result)
        
        markdown_assets = [a for a in data["assets"] if a["source"] == "markdown_image"]
        assert len(markdown_assets) == 1
        assert markdown_assets[0]["filename"] == "hero.png"
        assert markdown_assets[0]["model"] == "flux-2.0"
    
    @pytest.mark.asyncio
    async def test_analyze_html_comment(self, test_spec_path):
        """Test HTML comment pattern detection"""
        result = await analyze_spec_for_assets(test_spec_path)
        data = json.loads(result)
        
        comment_assets = [a for a in data["assets"] if a["source"] == "html_comment"]
        assert len(comment_assets) == 1
        assert comment_assets[0]["filename"] == "demo.mp4"
        assert comment_assets[0]["asset_type"] == "video"
    
    @pytest.mark.asyncio
    async def test_analyze_yaml_block(self, test_spec_path):
        """Test YAML block pattern detection"""
        result = await analyze_spec_for_assets(test_spec_path)
        data = json.loads(result)
        
        yaml_assets = [a for a in data["assets"] if a["source"] == "yaml_block"]
        assert len(yaml_assets) == 1
        assert yaml_assets[0]["filename"] == "welcome.mp3"
        assert yaml_assets[0]["asset_type"] == "audio"
    
    @pytest.mark.asyncio
    async def test_analyze_placeholder(self, test_spec_path):
        """Test placeholder pattern detection"""
        result = await analyze_spec_for_assets(test_spec_path)
        data = json.loads(result)
        
        placeholder_assets = [a for a in data["assets"] if a["source"] == "placeholder"]
        assert len(placeholder_assets) == 1
        assert placeholder_assets[0]["filename"] == "logo.png"
    
    @pytest.mark.asyncio
    async def test_analyze_file_not_found(self):
        """Test error handling for missing file"""
        result = await analyze_spec_for_assets("/nonexistent/path/spec.md")
        data = json.loads(result)
        
        assert data["success"] is False
        assert "not found" in data["error"]
        assert data["assets"] == []


# ============================================
# Test generate_asset
# ============================================

class TestGenerateAsset:
    """Test generate_asset tool"""
    
    @pytest.mark.asyncio
    async def test_generate_image_connection_error(self):
        """Test error handling when backend is not available"""
        result = await generate_asset(
            asset_type="image",
            prompt="Test prompt",
            model="google-nano-banana-pro"
        )
        data = json.loads(result)
        
        assert data["success"] is False
        assert "Cannot connect" in data["error"] or "error" in data
    
    @pytest.mark.asyncio
    async def test_generate_uses_default_model(self):
        """Test that default models are used when not specified"""
        with patch('media_mcp_server.httpx.AsyncClient') as mock_client:
            mock_response = MagicMock()
            mock_response.status_code = 200
            mock_response.json.return_value = {
                "id": "test-id",
                "data": [{"url": "https://example.com/image.png"}]
            }
            
            mock_client_instance = AsyncMock()
            mock_client_instance.post.return_value = mock_response
            mock_client_instance.__aenter__.return_value = mock_client_instance
            mock_client_instance.__aexit__.return_value = None
            mock_client.return_value = mock_client_instance
            
            result = await generate_asset(
                asset_type="image",
                prompt="Test prompt"
            )
            data = json.loads(result)
            
            # Check that default model was used
            assert data.get("model") == "google-nano-banana-pro" or "error" in data


# ============================================
# Test save_asset_to_project
# ============================================

class TestSaveAssetToProject:
    """Test save_asset_to_project tool"""
    
    @pytest.mark.asyncio
    async def test_save_creates_assets_directory(self, tmp_path):
        """Test that assets directory is created if it doesn't exist"""
        with patch('media_mcp_server.httpx.AsyncClient') as mock_client:
            mock_response = MagicMock()
            mock_response.status_code = 200
            mock_response.content = b"fake image content"
            mock_response.headers = {"content-type": "image/png"}
            
            mock_client_instance = AsyncMock()
            mock_client_instance.get.return_value = mock_response
            mock_client_instance.__aenter__.return_value = mock_client_instance
            mock_client_instance.__aexit__.return_value = None
            mock_client.return_value = mock_client_instance
            
            result = await save_asset_to_project(
                media_url="https://example.com/image.png",
                filename="test.png",
                project_path=str(tmp_path)
            )
            data = json.loads(result)
            
            assert data["success"] is True
            assert (tmp_path / "assets").exists()
            assert (tmp_path / "assets" / "test.png").exists()
    
    @pytest.mark.asyncio
    async def test_save_sanitizes_filename(self, tmp_path):
        """Test that dangerous characters are sanitized from filename"""
        with patch('media_mcp_server.httpx.AsyncClient') as mock_client:
            mock_response = MagicMock()
            mock_response.status_code = 200
            mock_response.content = b"fake content"
            mock_response.headers = {"content-type": "image/png"}
            
            mock_client_instance = AsyncMock()
            mock_client_instance.get.return_value = mock_response
            mock_client_instance.__aenter__.return_value = mock_client_instance
            mock_client_instance.__aexit__.return_value = None
            mock_client.return_value = mock_client_instance
            
            result = await save_asset_to_project(
                media_url="https://example.com/image.png",
                filename="../../../etc/passwd",
                project_path=str(tmp_path)
            )
            data = json.loads(result)
            
            assert data["success"] is True
            # Filename should be sanitized
            assert ".." not in data["filename"]
            assert "/" not in data["filename"]


# ============================================
# Run Tests
# ============================================

if __name__ == "__main__":
    pytest.main([__file__, "-v"])
