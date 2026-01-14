"""
SmartSpecPro Integration Test Suite

Tests the integration between:
1. MCP Server Tools
2. Backend API Endpoints
3. Shared Model Constants
4. Authentication Flow
"""

import pytest
import asyncio
import json
import os
import sys
from pathlib import Path
from unittest.mock import AsyncMock, patch, MagicMock

# Add paths for imports
sys.path.insert(0, str(Path(__file__).parent.parent))
sys.path.insert(0, str(Path(__file__).parent.parent / "python-backend"))

# ============================================
# Test Configuration
# ============================================

TEST_SPEC_CONTENT = """# Test Feature Spec

## Overview
This is a test specification for integration testing.

## Assets Required

### Hero Image
![hero-banner](assets/hero-banner.png "model: flux-2.0, prompt: A modern tech startup hero banner with blue gradient")

### Demo Video
<!-- ASSET: type=video, filename=demo.mp4, prompt=Product demo walkthrough -->

### Background Music
```asset
type: audio
filename: background.mp3
prompt: Upbeat corporate background music
```

### Additional Image
[GENERATE_IMAGE: A professional team photo -> team.png]
"""

# ============================================
# MCP Server Integration Tests
# ============================================

class TestMCPServerIntegration:
    """Test MCP Server tools integration"""
    
    @pytest.fixture
    def setup_test_spec(self, tmp_path):
        """Create a test spec file"""
        spec_file = tmp_path / "test_spec.md"
        spec_file.write_text(TEST_SPEC_CONTENT)
        return str(spec_file), str(tmp_path)
    
    @pytest.mark.asyncio
    async def test_analyze_spec_finds_all_asset_types(self, setup_test_spec):
        """Test that analyze_spec_for_assets finds image, video, and audio assets"""
        from media_mcp_server import analyze_spec_for_assets
        
        spec_path, project_path = setup_test_spec
        result = await analyze_spec_for_assets(
            spec_path=os.path.basename(spec_path),
            project_path=project_path
        )
        
        data = json.loads(result)
        assert data["success"] is True
        assert data["total_assets"] >= 3
        
        # Check asset types (field name is asset_type not type)
        asset_types = [a["asset_type"] for a in data["assets"]]
        assert "image" in asset_types
        assert "video" in asset_types
        assert "audio" in asset_types
    
    @pytest.mark.asyncio
    async def test_generate_asset_requires_token(self):
        """Test that generate_asset fails without API token"""
        from media_mcp_server import generate_asset
        
        # Clear token
        with patch.dict(os.environ, {"SMARTSPEC_API_TOKEN": ""}, clear=False):
            # Re-import to get updated token
            import importlib
            import media_mcp_server
            importlib.reload(media_mcp_server)
            
            result = await media_mcp_server.generate_asset(
                asset_type="image",
                prompt="Test image"
            )
            
            data = json.loads(result)
            assert data["success"] is False
            assert "SMARTSPEC_API_TOKEN" in data["error"]
    
    @pytest.mark.asyncio
    async def test_save_asset_creates_directory(self, tmp_path):
        """Test that save_asset_to_project creates assets directory"""
        from media_mcp_server import save_asset_to_project
        
        # Use a public test image
        test_url = "https://httpbin.org/image/png"
        
        result = await save_asset_to_project(
            media_url=test_url,
            filename="test_image.png",
            project_path=str(tmp_path)
        )
        
        data = json.loads(result)
        
        # Check if assets directory was created
        assets_dir = tmp_path / "assets"
        assert assets_dir.exists()
    
    @pytest.mark.asyncio
    async def test_generate_assets_from_spec_dry_run(self, setup_test_spec):
        """Test dry run mode of generate_assets_from_spec"""
        from media_mcp_server import generate_assets_from_spec
        
        spec_path, project_path = setup_test_spec
        
        result = await generate_assets_from_spec(
            spec_path=os.path.basename(spec_path),
            project_path=project_path,
            dry_run=True
        )
        
        data = json.loads(result)
        assert data["success"] is True
        # dry_run returns assets list or message about no assets
        assert "assets" in data or "message" in data


# ============================================
# Backend Model Constants Tests
# ============================================

class TestModelConstantsIntegration:
    """Test shared model constants between Backend and MCP Server"""
    
    def test_backend_models_exist(self):
        """Test that backend media_models.py has all required models"""
        from app.core.media_models import (
            ImageModel, VideoModel, AudioModel,
            get_all_models, is_valid_model
        )
        
        models = get_all_models()
        
        # Check image models
        assert len(models["image"]) >= 4
        assert "google-nano-banana-pro" in models["image"]
        assert "flux-2.0" in models["image"]
        
        # Check video models
        assert len(models["video"]) >= 3
        assert "veo-3-1" in models["video"]
        
        # Check audio models
        assert len(models["audio"]) >= 2
        assert "elevenlabs-tts" in models["audio"]
    
    def test_model_validation(self):
        """Test model validation functions"""
        from app.core.media_models import is_valid_model, get_model_metadata
        
        # Valid models
        assert is_valid_model("google-nano-banana-pro") is True
        assert is_valid_model("veo-3-1") is True
        assert is_valid_model("elevenlabs-tts") is True
        
        # Invalid models
        assert is_valid_model("invalid-model") is False
        assert is_valid_model("") is False
        
        # Type-specific validation
        assert is_valid_model("google-nano-banana-pro", "image") is True
        assert is_valid_model("google-nano-banana-pro", "video") is False
    
    def test_model_metadata(self):
        """Test that model metadata is complete"""
        from app.core.media_models import get_model_metadata, MODEL_METADATA
        
        for model_id, metadata in MODEL_METADATA.items():
            assert "type" in metadata
            assert "name" in metadata
            assert "provider" in metadata
            assert "description" in metadata
            assert metadata["type"] in ["image", "video", "audio"]
    
    def test_mcp_server_models_match_backend(self):
        """Test that MCP Server uses same models as Backend"""
        from app.core.media_models import get_all_models
        from media_mcp_server import (
            DEFAULT_IMAGE_MODEL,
            DEFAULT_VIDEO_MODEL,
            DEFAULT_AUDIO_MODEL
        )
        
        backend_models = get_all_models()
        
        # Check default models exist in backend
        assert DEFAULT_IMAGE_MODEL in backend_models["image"]
        assert DEFAULT_VIDEO_MODEL in backend_models["video"]
        assert DEFAULT_AUDIO_MODEL in backend_models["audio"]


# ============================================
# API Endpoint Structure Tests
# ============================================

class TestAPIEndpointStructure:
    """Test API endpoint structure and registration"""
    
    def test_media_generation_router_exists(self):
        """Test that media_generation router is properly defined"""
        # Check file structure instead of importing (to avoid dependency issues)
        media_gen_path = Path(__file__).parent.parent / "python-backend" / "app" / "api" / "v1" / "media_generation.py"
        assert media_gen_path.exists()
        
        content = media_gen_path.read_text()
        # Check router has routes
        assert "router = APIRouter()" in content
        assert '@router.post("/image"' in content
        assert '@router.post("/video"' in content
        assert '@router.post("/audio"' in content
    
    def test_main_imports_media_generation(self):
        """Test that main.py imports media_generation"""
        main_path = Path(__file__).parent.parent / "python-backend" / "app" / "main.py"
        content = main_path.read_text()
        
        assert "media_generation" in content
        assert "media_generation.router" in content
        assert "/api/v1/media" in content
    
    def test_api_v1_init_includes_media(self):
        """Test that api/v1/__init__.py includes media_generation"""
        init_path = Path(__file__).parent.parent / "python-backend" / "app" / "api" / "v1" / "__init__.py"
        content = init_path.read_text()
        
        assert "media_generation" in content
        assert "media_generation_router" in content


# ============================================
# Frontend Constants Tests
# ============================================

class TestFrontendConstants:
    """Test Frontend constants file"""
    
    def test_frontend_constants_exist(self):
        """Test that frontend mediaModels.ts exists and has content"""
        constants_path = Path(__file__).parent.parent / "desktop-app" / "src" / "constants" / "mediaModels.ts"
        
        assert constants_path.exists()
        content = constants_path.read_text()
        
        # Check for required exports
        assert "IMAGE_MODELS" in content
        assert "VIDEO_MODELS" in content
        assert "AUDIO_MODELS" in content
        assert "DEFAULT_IMAGE_MODEL" in content
        assert "getModelsForType" in content
    
    def test_frontend_models_match_backend(self):
        """Test that frontend models match backend models"""
        from app.core.media_models import get_all_models
        
        constants_path = Path(__file__).parent.parent / "desktop-app" / "src" / "constants" / "mediaModels.ts"
        content = constants_path.read_text()
        
        backend_models = get_all_models()
        
        # Check each backend model is in frontend
        for model_id in backend_models["image"]:
            assert model_id in content, f"Image model {model_id} not in frontend"
        
        for model_id in backend_models["video"]:
            assert model_id in content, f"Video model {model_id} not in frontend"
        
        for model_id in backend_models["audio"]:
            assert model_id in content, f"Audio model {model_id} not in frontend"


# ============================================
# Frontend Component Tests
# ============================================

class TestFrontendComponents:
    """Test Frontend component structure"""
    
    def test_media_generation_panel_has_auth(self):
        """Test that MediaGenerationPanel includes authentication"""
        panel_path = Path(__file__).parent.parent / "desktop-app" / "src" / "components" / "chat" / "MediaGenerationPanel.tsx"
        content = panel_path.read_text()
        
        # Check for auth imports and usage
        assert "getAuthToken" in content
        assert "Authorization" in content
        assert "Bearer" in content
        assert "authToken" in content
    
    def test_media_generation_panel_uses_shared_constants(self):
        """Test that MediaGenerationPanel uses shared constants"""
        panel_path = Path(__file__).parent.parent / "desktop-app" / "src" / "components" / "chat" / "MediaGenerationPanel.tsx"
        content = panel_path.read_text()
        
        # Check for shared constants imports
        assert "from '../../constants/mediaModels'" in content
        assert "getModelsForType" in content
        assert "getDefaultModelForType" in content


# ============================================
# End-to-End Flow Tests
# ============================================

class TestEndToEndFlow:
    """Test end-to-end integration flows"""
    
    @pytest.mark.asyncio
    async def test_spec_to_assets_flow(self, tmp_path):
        """Test the complete flow from spec analysis to asset generation"""
        from media_mcp_server import analyze_spec_for_assets
        
        # Create test spec
        spec_file = tmp_path / "feature_spec.md"
        spec_file.write_text(TEST_SPEC_CONTENT)
        
        # Step 1: Analyze spec
        result = await analyze_spec_for_assets(
            spec_path="feature_spec.md",
            project_path=str(tmp_path)
        )
        
        data = json.loads(result)
        assert data["success"] is True
        
        # Verify assets were found
        assets = data["assets"]
        assert len(assets) >= 3
        
        # Verify each asset has required fields
        for asset in assets:
            assert "asset_type" in asset
            assert "filename" in asset
            assert "prompt" in asset
            assert asset["asset_type"] in ["image", "video", "audio"]
    
    def test_model_consistency_across_components(self):
        """Test that models are consistent across all components"""
        from app.core.media_models import get_all_models, DEFAULT_IMAGE_MODEL, DEFAULT_VIDEO_MODEL, DEFAULT_AUDIO_MODEL
        from media_mcp_server import (
            DEFAULT_IMAGE_MODEL as MCP_IMAGE_MODEL,
            DEFAULT_VIDEO_MODEL as MCP_VIDEO_MODEL,
            DEFAULT_AUDIO_MODEL as MCP_AUDIO_MODEL
        )
        
        # Check defaults match
        assert DEFAULT_IMAGE_MODEL.value == MCP_IMAGE_MODEL
        assert DEFAULT_VIDEO_MODEL.value == MCP_VIDEO_MODEL
        assert DEFAULT_AUDIO_MODEL.value == MCP_AUDIO_MODEL


# ============================================
# Run Tests
# ============================================

if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
