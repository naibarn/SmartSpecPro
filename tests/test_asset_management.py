"""
SmartSpec Pro - Asset Management Tests
Unit tests for Asset Management feature
"""

import pytest
import json
import asyncio
from pathlib import Path
from datetime import datetime
from unittest.mock import AsyncMock, MagicMock, patch


# ============================================
# Test: Asset Model
# ============================================

class TestAssetModel:
    """Tests for Asset database model"""
    
    def test_asset_model_import(self):
        """Test that Asset model can be imported"""
        import sys
        sys.path.insert(0, str(Path(__file__).parent.parent / 'python-backend'))
        
        from app.models.asset import Asset, AssetType, AssetStatus
        
        assert Asset is not None
        assert AssetType is not None
        assert AssetStatus is not None
    
    def test_asset_type_enum(self):
        """Test AssetType enum values"""
        import sys
        sys.path.insert(0, str(Path(__file__).parent.parent / 'python-backend'))
        
        from app.models.asset import AssetType
        
        assert AssetType.IMAGE.value == "image"
        assert AssetType.VIDEO.value == "video"
        assert AssetType.AUDIO.value == "audio"
    
    def test_asset_status_enum(self):
        """Test AssetStatus enum values"""
        import sys
        sys.path.insert(0, str(Path(__file__).parent.parent / 'python-backend'))
        
        from app.models.asset import AssetStatus
        
        assert AssetStatus.ACTIVE.value == "active"
        assert AssetStatus.ARCHIVED.value == "archived"
        assert AssetStatus.DELETED.value == "deleted"


# ============================================
# Test: Asset Service
# ============================================

class TestAssetService:
    """Tests for Asset service"""
    
    def test_asset_service_import(self):
        """Test that AssetService can be imported"""
        import sys
        sys.path.insert(0, str(Path(__file__).parent.parent / 'python-backend'))
        
        from app.services.asset_service import (
            AssetService,
            AssetCreate,
            AssetUpdate,
            AssetRead,
            AssetSearchParams,
            AssetListResponse,
        )
        
        assert AssetService is not None
        assert AssetCreate is not None
        assert AssetUpdate is not None
        assert AssetRead is not None
    
    def test_asset_create_schema(self):
        """Test AssetCreate schema validation"""
        import sys
        sys.path.insert(0, str(Path(__file__).parent.parent / 'python-backend'))
        
        from app.services.asset_service import AssetCreate
        
        # Valid data
        data = AssetCreate(
            filename="test.png",
            relative_path="assets/test.png",
            asset_type="image"
        )
        
        assert data.filename == "test.png"
        assert data.relative_path == "assets/test.png"
        assert data.asset_type == "image"
    
    def test_asset_update_schema(self):
        """Test AssetUpdate schema validation"""
        import sys
        sys.path.insert(0, str(Path(__file__).parent.parent / 'python-backend'))
        
        from app.services.asset_service import AssetUpdate
        
        # All fields optional
        data = AssetUpdate(description="Updated description")
        
        assert data.description == "Updated description"
        assert data.filename is None
        assert data.tags is None
    
    def test_asset_search_params(self):
        """Test AssetSearchParams schema"""
        import sys
        sys.path.insert(0, str(Path(__file__).parent.parent / 'python-backend'))
        
        from app.services.asset_service import AssetSearchParams
        
        params = AssetSearchParams(
            query="hero",
            asset_type="image",
            page=1,
            page_size=20
        )
        
        assert params.query == "hero"
        assert params.asset_type == "image"
        assert params.page == 1
        assert params.page_size == 20


# ============================================
# Test: MCP Server Asset Tools
# ============================================

class TestMCPAssetTools:
    """Tests for MCP Server asset management tools"""
    
    def test_mcp_server_import(self):
        """Test that MCP Server can be imported"""
        import sys
        sys.path.insert(0, str(Path(__file__).parent.parent))
        
        from media_mcp_server import (
            mcp,
            register_asset,
            find_assets,
            get_asset_details,
        )
        
        assert mcp is not None
        assert register_asset is not None
        assert find_assets is not None
        assert get_asset_details is not None
    
    @pytest.mark.asyncio
    async def test_register_asset_requires_token(self):
        """Test that register_asset requires API token"""
        import sys
        sys.path.insert(0, str(Path(__file__).parent.parent))
        
        # Clear token
        import os
        original_token = os.environ.get("SMARTSPEC_API_TOKEN", "")
        os.environ["SMARTSPEC_API_TOKEN"] = ""
        
        try:
            from media_mcp_server import register_asset
            
            result = await register_asset(
                filename="test.png",
                relative_path="assets/test.png",
                asset_type="image"
            )
            
            data = json.loads(result)
            assert data["success"] == False
            assert "SMARTSPEC_API_TOKEN" in data["error"]
        finally:
            os.environ["SMARTSPEC_API_TOKEN"] = original_token
    
    @pytest.mark.asyncio
    async def test_find_assets_requires_token(self):
        """Test that find_assets requires API token"""
        import sys
        sys.path.insert(0, str(Path(__file__).parent.parent))
        
        # Clear token
        import os
        original_token = os.environ.get("SMARTSPEC_API_TOKEN", "")
        os.environ["SMARTSPEC_API_TOKEN"] = ""
        
        try:
            from media_mcp_server import find_assets
            
            result = await find_assets()
            
            data = json.loads(result)
            assert data["success"] == False
            assert "SMARTSPEC_API_TOKEN" in data["error"]
        finally:
            os.environ["SMARTSPEC_API_TOKEN"] = original_token
    
    @pytest.mark.asyncio
    async def test_get_asset_details_requires_token(self):
        """Test that get_asset_details requires API token"""
        import sys
        sys.path.insert(0, str(Path(__file__).parent.parent))
        
        # Clear token
        import os
        original_token = os.environ.get("SMARTSPEC_API_TOKEN", "")
        os.environ["SMARTSPEC_API_TOKEN"] = ""
        
        try:
            from media_mcp_server import get_asset_details
            
            result = await get_asset_details("test-uuid")
            
            data = json.loads(result)
            assert data["success"] == False
            assert "SMARTSPEC_API_TOKEN" in data["error"]
        finally:
            os.environ["SMARTSPEC_API_TOKEN"] = original_token


# ============================================
# Test: API Endpoints Structure
# ============================================

class TestAssetAPIEndpoints:
    """Tests for Asset API endpoint structure"""
    
    def test_assets_router_exists(self):
        """Test that assets router file exists"""
        api_file = Path(__file__).parent.parent / 'python-backend/app/api/v1/assets.py'
        assert api_file.exists(), "assets.py should exist"
    
    def test_assets_router_registered(self):
        """Test that assets router is registered in main.py"""
        main_file = Path(__file__).parent.parent / 'python-backend/app/main.py'
        content = main_file.read_text()
        
        assert "from app.api.v1 import" in content
        assert "assets" in content
        assert "assets.router" in content
        assert "/api/v1/assets" in content
    
    def test_assets_api_endpoints(self):
        """Test that assets API has required endpoints"""
        api_file = Path(__file__).parent.parent / 'python-backend/app/api/v1/assets.py'
        content = api_file.read_text()
        
        # Check for CRUD endpoints (using flexible pattern matching)
        assert "@router.post" in content and "response_model=AssetRead" in content
        assert "@router.get" in content
        assert "@router.put" in content
        assert "@router.delete" in content
        assert "asset_id" in content
        
        # Check for version endpoint
        assert "versions" in content


# ============================================
# Test: Frontend Components
# ============================================

class TestFrontendAssetComponents:
    """Tests for Frontend asset components"""
    
    def test_asset_service_exists(self):
        """Test that assetService.ts exists"""
        service_file = Path(__file__).parent.parent / 'desktop-app/src/services/assetService.ts'
        assert service_file.exists(), "assetService.ts should exist"
    
    def test_asset_browser_exists(self):
        """Test that AssetBrowser.tsx exists"""
        component_file = Path(__file__).parent.parent / 'desktop-app/src/components/AssetBrowser.tsx'
        assert component_file.exists(), "AssetBrowser.tsx should exist"
    
    def test_asset_service_exports(self):
        """Test that assetService.ts has required exports"""
        service_file = Path(__file__).parent.parent / 'desktop-app/src/services/assetService.ts'
        content = service_file.read_text()
        
        # Check for type exports
        assert "export interface Asset" in content
        assert "export interface AssetMetadata" in content
        assert "export interface AssetListResponse" in content
        
        # Check for function exports
        assert "export async function createAsset" in content
        assert "export async function getAsset" in content
        assert "export async function updateAsset" in content
        assert "export async function deleteAsset" in content
        assert "export async function searchAssets" in content
    
    def test_asset_browser_component(self):
        """Test that AssetBrowser.tsx has required structure"""
        component_file = Path(__file__).parent.parent / 'desktop-app/src/components/AssetBrowser.tsx'
        content = component_file.read_text()
        
        # Check for component structure
        assert "AssetBrowser" in content
        assert "useState" in content
        assert "useEffect" in content
        
        # Check for features
        assert "searchAssets" in content
        assert "grid" in content.lower()
        assert "list" in content.lower()


# ============================================
# Test: Integration
# ============================================

class TestAssetManagementIntegration:
    """Integration tests for Asset Management feature"""
    
    def test_all_components_exist(self):
        """Test that all Asset Management components exist"""
        base_path = Path(__file__).parent.parent
        
        # Backend
        assert (base_path / 'python-backend/app/models/asset.py').exists()
        assert (base_path / 'python-backend/app/services/asset_service.py').exists()
        assert (base_path / 'python-backend/app/api/v1/assets.py').exists()
        
        # MCP Server
        mcp_content = (base_path / 'media_mcp_server.py').read_text()
        assert "register_asset" in mcp_content
        assert "find_assets" in mcp_content
        assert "get_asset_details" in mcp_content
        
        # Frontend
        assert (base_path / 'desktop-app/src/services/assetService.ts').exists()
        assert (base_path / 'desktop-app/src/components/AssetBrowser.tsx').exists()
    
    def test_asset_type_consistency(self):
        """Test that asset types are consistent across components"""
        base_path = Path(__file__).parent.parent
        
        # Check backend model
        model_content = (base_path / 'python-backend/app/models/asset.py').read_text()
        assert 'IMAGE = "image"' in model_content
        assert 'VIDEO = "video"' in model_content
        assert 'AUDIO = "audio"' in model_content
        
        # Check frontend service
        service_content = (base_path / 'desktop-app/src/services/assetService.ts').read_text()
        assert "'image'" in service_content
        assert "'video'" in service_content
        assert "'audio'" in service_content
        
        # Check MCP server
        mcp_content = (base_path / 'media_mcp_server.py').read_text()
        assert '"image"' in mcp_content
        assert '"video"' in mcp_content
        assert '"audio"' in mcp_content


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
