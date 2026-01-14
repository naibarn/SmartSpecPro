"""
SmartSpec Media MCP Server
===========================
MCP Server สำหรับสร้างและจัดการ Media Assets (Image, Video, Audio)
โดยเชื่อมต่อกับ Backend API ผ่าน Kie.ai

Tools:
1. analyze_spec_for_assets - วิเคราะห์ spec.md เพื่อค้นหา Assets ที่ต้องสร้าง
2. generate_asset - สร้างสื่อผ่าน Backend API
3. save_asset_to_project - ดาวน์โหลดและบันทึกไฟล์ลง assets/
4. generate_assets_from_spec - Workflow อัตโนมัติสำหรับสร้าง assets จาก spec
5. register_asset - ลงทะเบียน asset ใน Asset Registry
6. find_assets - ค้นหา assets จาก Asset Registry
7. get_asset_details - ดึงข้อมูลรายละเอียดของ asset

Version: 2.0.0
"""

import asyncio
import os
import re
import json
from pathlib import Path
from typing import Optional, Literal
from dataclasses import dataclass

import httpx
import aiofiles
from mcp.server.fastmcp import FastMCP

# ============================================
# Configuration
# ============================================

BACKEND_URL = os.environ.get("SMARTSPEC_BACKEND_URL", "http://localhost:8000")
API_TOKEN = os.environ.get("SMARTSPEC_API_TOKEN", "")
DEFAULT_PROJECT_PATH = os.environ.get("SMARTSPEC_PROJECT_PATH", "/home/ubuntu/SmartSpecPro")

# Model defaults
DEFAULT_IMAGE_MODEL = "google-nano-banana-pro"
DEFAULT_VIDEO_MODEL = "veo-3-1"
DEFAULT_AUDIO_MODEL = "elevenlabs-tts"

# ============================================
# Data Models
# ============================================

@dataclass
class AssetDefinition:
    """Definition of an asset to be generated"""
    asset_type: str  # image, video, audio
    prompt: str
    filename: str
    model: Optional[str] = None


# ============================================
# MCP Server Setup
# ============================================

mcp = FastMCP(
    name="smartspec-media",
    instructions="SmartSpec Media Generation MCP Server v1.0.0 - สร้างและจัดการ Media Assets (Image, Video, Audio) ผ่าน Kie.ai"
)


# ============================================
# Tool 1: analyze_spec_for_assets
# ============================================

@mcp.tool()
async def analyze_spec_for_assets(
    spec_path: str,
    project_path: Optional[str] = None
) -> str:
    """
    วิเคราะห์ไฟล์ spec.md เพื่อค้นหาและดึงรายการ Assets ที่ต้องสร้าง
    
    รูปแบบที่รองรับใน spec.md:
    1. Markdown image syntax พร้อม metadata:
       ![alt text](assets/filename.png "model: model-name, prompt: description")
    
    2. HTML comment format:
       <!-- ASSET: type=image, filename=hero.png, model=flux-2.0, prompt=A beautiful hero image -->
    
    3. YAML-like block:
       ```asset
       type: image
       filename: logo.png
       model: google-nano-banana-pro
       prompt: A modern tech company logo
       ```
    
    Args:
        spec_path: Path to the spec.md file (relative or absolute)
        project_path: Base project path (optional, defaults to SMARTSPEC_PROJECT_PATH)
    
    Returns:
        JSON string containing list of assets to generate
    """
    base_path = Path(project_path or DEFAULT_PROJECT_PATH)
    
    # Handle relative paths
    if not Path(spec_path).is_absolute():
        full_path = base_path / spec_path
    else:
        full_path = Path(spec_path)
    
    if not full_path.exists():
        return json.dumps({
            "success": False,
            "error": f"Spec file not found: {full_path}",
            "assets": []
        })
    
    try:
        async with aiofiles.open(full_path, 'r', encoding='utf-8') as f:
            content = await f.read()
    except Exception as e:
        return json.dumps({
            "success": False,
            "error": f"Failed to read spec file: {str(e)}",
            "assets": []
        })
    
    assets = []
    
    # Pattern 1: Markdown image with metadata
    # ![alt](path "model: xxx, prompt: yyy")
    md_pattern = r'!\[([^\]]*)\]\(([^)]+)\s+"([^"]+)"\)'
    for match in re.finditer(md_pattern, content):
        alt_text, filepath, metadata = match.groups()
        
        # Parse metadata
        model_match = re.search(r'model:\s*([^,]+)', metadata)
        prompt_match = re.search(r'prompt:\s*(.+?)(?:,|$)', metadata)
        
        if prompt_match:
            asset = {
                "asset_type": _detect_asset_type(filepath),
                "filename": Path(filepath).name,
                "prompt": prompt_match.group(1).strip(),
                "model": model_match.group(1).strip() if model_match else None,
                "source": "markdown_image"
            }
            assets.append(asset)
    
    # Pattern 2: HTML comment format
    # <!-- ASSET: type=image, filename=hero.png, model=flux-2.0, prompt=A beautiful hero image -->
    comment_pattern = r'<!--\s*ASSET:\s*(.+?)\s*-->'
    for match in re.finditer(comment_pattern, content, re.DOTALL):
        params_str = match.group(1)
        params = {}
        
        for param in params_str.split(','):
            if '=' in param:
                key, value = param.split('=', 1)
                params[key.strip()] = value.strip()
        
        if 'type' in params and 'prompt' in params and 'filename' in params:
            asset = {
                "asset_type": params['type'],
                "filename": params['filename'],
                "prompt": params['prompt'],
                "model": params.get('model'),
                "source": "html_comment"
            }
            assets.append(asset)
    
    # Pattern 3: YAML-like asset block
    # ```asset ... ```
    yaml_pattern = r'```asset\s*\n(.*?)```'
    for match in re.finditer(yaml_pattern, content, re.DOTALL):
        block = match.group(1)
        params = {}
        
        for line in block.strip().split('\n'):
            if ':' in line:
                key, value = line.split(':', 1)
                params[key.strip()] = value.strip()
        
        if 'type' in params and 'prompt' in params and 'filename' in params:
            asset = {
                "asset_type": params['type'],
                "filename": params['filename'],
                "prompt": params['prompt'],
                "model": params.get('model'),
                "source": "yaml_block"
            }
            assets.append(asset)
    
    # Pattern 4: Simple placeholder images
    # [GENERATE_IMAGE: prompt description -> filename.png]
    placeholder_pattern = r'\[GENERATE_(IMAGE|VIDEO|AUDIO):\s*(.+?)\s*->\s*([^\]]+)\]'
    for match in re.finditer(placeholder_pattern, content):
        asset_type, prompt, filename = match.groups()
        asset = {
            "asset_type": asset_type.lower(),
            "filename": filename.strip(),
            "prompt": prompt.strip(),
            "model": None,
            "source": "placeholder"
        }
        assets.append(asset)
    
    return json.dumps({
        "success": True,
        "spec_path": str(full_path),
        "total_assets": len(assets),
        "assets": assets
    }, indent=2, ensure_ascii=False)


def _detect_asset_type(filepath: str) -> str:
    """Detect asset type from file extension"""
    ext = Path(filepath).suffix.lower()
    if ext in ['.png', '.jpg', '.jpeg', '.gif', '.webp', '.svg']:
        return 'image'
    elif ext in ['.mp4', '.webm', '.mov', '.avi']:
        return 'video'
    elif ext in ['.mp3', '.wav', '.ogg', '.m4a']:
        return 'audio'
    return 'image'  # Default to image


# ============================================
# Tool 2: generate_asset
# ============================================

@mcp.tool()
async def generate_asset(
    asset_type: Literal["image", "video", "audio"],
    prompt: str,
    model: Optional[str] = None,
    size: Optional[str] = None,
    aspect_ratio: Optional[str] = None,
    duration: Optional[int] = None,
    voice: Optional[str] = None
) -> str:
    """
    สร้างสื่อ (Image, Video, Audio) ผ่าน Backend API
    
    Args:
        asset_type: ประเภทสื่อ - "image", "video", หรือ "audio"
        prompt: คำอธิบายสิ่งที่ต้องการสร้าง
        model: โมเดลที่ใช้สร้าง (optional)
            - Image: google-nano-banana-pro, flux-2.0, z-image, grok-imagine
            - Video: veo-3-1, sora-2, kling-2.6
            - Audio: elevenlabs-tts, elevenlabs-sfx
        size: ขนาดภาพ เช่น "1024x1024" (สำหรับ image)
        aspect_ratio: อัตราส่วนภาพ เช่น "16:9" (สำหรับ image/video)
        duration: ความยาววิดีโอเป็นวินาที (สำหรับ video)
        voice: เสียงที่ใช้ (สำหรับ audio)
    
    Returns:
        JSON string containing generated media URL and metadata
    """
    # Validate API token is set
    if not API_TOKEN:
        return json.dumps({
            "success": False,
            "error": "SMARTSPEC_API_TOKEN environment variable is not set. Authentication is required to call Backend API.",
            "asset_type": asset_type,
            "hint": "Set the environment variable: export SMARTSPEC_API_TOKEN=your_jwt_token"
        }, indent=2, ensure_ascii=False)
    
    # Set default model based on asset type
    if not model:
        if asset_type == "image":
            model = DEFAULT_IMAGE_MODEL
        elif asset_type == "video":
            model = DEFAULT_VIDEO_MODEL
        else:
            model = DEFAULT_AUDIO_MODEL
    
    # Build request payload
    if asset_type == "image":
        endpoint = f"{BACKEND_URL}/api/v1/media/image"
        payload = {
            "model": model,
            "prompt": prompt,
        }
        if size:
            payload["size"] = size
        if aspect_ratio:
            payload["aspect_ratio"] = aspect_ratio
            
    elif asset_type == "video":
        endpoint = f"{BACKEND_URL}/api/v1/media/video"
        payload = {
            "model": model,
            "prompt": prompt,
        }
        if duration:
            payload["duration"] = duration
        if aspect_ratio:
            payload["aspect_ratio"] = aspect_ratio
            
    else:  # audio
        endpoint = f"{BACKEND_URL}/api/v1/media/audio"
        payload = {
            "model": model,
            "text": prompt,  # Audio uses 'text' instead of 'prompt'
        }
        if voice:
            payload["voice"] = voice
    
    # Prepare headers
    headers = {
        "Content-Type": "application/json",
    }
    if API_TOKEN:
        headers["Authorization"] = f"Bearer {API_TOKEN}"
    
    try:
        async with httpx.AsyncClient(timeout=120.0) as client:
            response = await client.post(endpoint, json=payload, headers=headers)
            
            if response.status_code == 200:
                data = response.json()
                
                # Extract URL from response
                media_url = None
                if "data" in data and len(data["data"]) > 0:
                    media_url = data["data"][0].get("url")
                
                return json.dumps({
                    "success": True,
                    "asset_type": asset_type,
                    "model": model,
                    "prompt": prompt,
                    "media_url": media_url,
                    "response_id": data.get("id"),
                    "credits_used": str(data.get("credits_used", "N/A")),
                    "credits_balance": str(data.get("credits_balance", "N/A"))
                }, indent=2, ensure_ascii=False)
            else:
                error_detail = response.text
                try:
                    error_json = response.json()
                    error_detail = error_json.get("detail", response.text)
                except:
                    pass
                
                return json.dumps({
                    "success": False,
                    "error": f"API returned status {response.status_code}: {error_detail}",
                    "asset_type": asset_type,
                    "model": model
                }, indent=2, ensure_ascii=False)
                
    except httpx.TimeoutException:
        return json.dumps({
            "success": False,
            "error": "Request timeout - การสร้างสื่ออาจใช้เวลานาน โปรดลองอีกครั้ง",
            "asset_type": asset_type,
            "model": model
        }, indent=2, ensure_ascii=False)
        
    except httpx.ConnectError:
        return json.dumps({
            "success": False,
            "error": f"Cannot connect to Backend API at {BACKEND_URL}. Please ensure the backend is running.",
            "asset_type": asset_type,
            "model": model
        }, indent=2, ensure_ascii=False)
        
    except Exception as e:
        return json.dumps({
            "success": False,
            "error": f"Unexpected error: {str(e)}",
            "asset_type": asset_type,
            "model": model
        }, indent=2, ensure_ascii=False)


# ============================================
# Tool 3: save_asset_to_project
# ============================================

@mcp.tool()
async def save_asset_to_project(
    media_url: str,
    filename: str,
    project_path: Optional[str] = None,
    assets_folder: str = "assets"
) -> str:
    """
    ดาวน์โหลดไฟล์สื่อจาก URL และบันทึกลงในโฟลเดอร์ assets/ ของโปรเจกต์
    
    Args:
        media_url: URL ของไฟล์สื่อที่ต้องการดาวน์โหลด
        filename: ชื่อไฟล์ที่ต้องการบันทึก (เช่น "hero.png")
        project_path: Path ของโปรเจกต์ (optional, defaults to SMARTSPEC_PROJECT_PATH)
        assets_folder: ชื่อโฟลเดอร์สำหรับเก็บ assets (default: "assets")
    
    Returns:
        JSON string containing saved file path and metadata
    """
    base_path = Path(project_path or DEFAULT_PROJECT_PATH)
    assets_dir = base_path / assets_folder
    
    # Create assets directory if it doesn't exist
    try:
        assets_dir.mkdir(parents=True, exist_ok=True)
    except Exception as e:
        return json.dumps({
            "success": False,
            "error": f"Failed to create assets directory: {str(e)}",
            "assets_dir": str(assets_dir)
        }, indent=2, ensure_ascii=False)
    
    # Sanitize filename - remove path traversal and dangerous characters
    # First, get only the basename to prevent path traversal
    base_filename = Path(filename).name
    # Then sanitize remaining characters
    safe_filename = re.sub(r'[^\w\-_\.]', '_', base_filename)
    # Remove any remaining dots at the start (hidden files)
    safe_filename = safe_filename.lstrip('.')
    # Ensure filename is not empty
    if not safe_filename:
        safe_filename = 'unnamed_asset'
    file_path = assets_dir / safe_filename
    
    # Download the file
    try:
        async with httpx.AsyncClient(timeout=60.0, follow_redirects=True) as client:
            response = await client.get(media_url)
            
            if response.status_code != 200:
                return json.dumps({
                    "success": False,
                    "error": f"Failed to download: HTTP {response.status_code}",
                    "media_url": media_url
                }, indent=2, ensure_ascii=False)
            
            content = response.content
            content_type = response.headers.get("content-type", "")
            
    except httpx.TimeoutException:
        return json.dumps({
            "success": False,
            "error": "Download timeout",
            "media_url": media_url
        }, indent=2, ensure_ascii=False)
        
    except Exception as e:
        return json.dumps({
            "success": False,
            "error": f"Download failed: {str(e)}",
            "media_url": media_url
        }, indent=2, ensure_ascii=False)
    
    # Save the file
    try:
        async with aiofiles.open(file_path, 'wb') as f:
            await f.write(content)
        
        file_size = len(content)
        
        return json.dumps({
            "success": True,
            "file_path": str(file_path),
            "relative_path": f"{assets_folder}/{safe_filename}",
            "filename": safe_filename,
            "file_size": file_size,
            "file_size_human": _format_file_size(file_size),
            "content_type": content_type,
            "media_url": media_url
        }, indent=2, ensure_ascii=False)
        
    except Exception as e:
        return json.dumps({
            "success": False,
            "error": f"Failed to save file: {str(e)}",
            "file_path": str(file_path)
        }, indent=2, ensure_ascii=False)


def _format_file_size(size_bytes: int) -> str:
    """Format file size in human-readable format"""
    for unit in ['B', 'KB', 'MB', 'GB']:
        if size_bytes < 1024:
            return f"{size_bytes:.1f} {unit}"
        size_bytes /= 1024
    return f"{size_bytes:.1f} TB"


# ============================================
# Bonus Tool: generate_assets_from_spec
# ============================================

@mcp.tool()
async def generate_assets_from_spec(
    spec_path: str,
    project_path: Optional[str] = None,
    dry_run: bool = False
) -> str:
    """
    Workflow อัตโนมัติ: วิเคราะห์ spec.md และสร้าง Assets ทั้งหมดที่พบ
    
    ขั้นตอนการทำงาน:
    1. อ่านและวิเคราะห์ spec.md
    2. สร้าง Assets แต่ละรายการผ่าน Backend API
    3. บันทึกไฟล์ลงโฟลเดอร์ assets/
    
    Args:
        spec_path: Path to the spec.md file
        project_path: Base project path (optional)
        dry_run: If True, only analyze without generating (default: False)
    
    Returns:
        JSON string containing workflow results
    """
    # Validate API token is set (required for generation, not for dry_run)
    if not dry_run and not API_TOKEN:
        return json.dumps({
            "success": False,
            "error": "SMARTSPEC_API_TOKEN environment variable is not set. Authentication is required for asset generation.",
            "hint": "Set the environment variable or use dry_run=True to only analyze without generating."
        }, indent=2, ensure_ascii=False)
    
    base_path = project_path or DEFAULT_PROJECT_PATH
    
    # Step 1: Analyze spec
    analysis_result = await analyze_spec_for_assets(spec_path, base_path)
    analysis = json.loads(analysis_result)
    
    if not analysis.get("success"):
        return json.dumps({
            "success": False,
            "step": "analyze",
            "error": analysis.get("error"),
            "results": []
        }, indent=2, ensure_ascii=False)
    
    assets = analysis.get("assets", [])
    
    if len(assets) == 0:
        return json.dumps({
            "success": True,
            "message": "No assets found in spec file",
            "spec_path": spec_path,
            "results": []
        }, indent=2, ensure_ascii=False)
    
    if dry_run:
        return json.dumps({
            "success": True,
            "dry_run": True,
            "message": f"Found {len(assets)} assets to generate",
            "spec_path": spec_path,
            "assets": assets
        }, indent=2, ensure_ascii=False)
    
    # Step 2 & 3: Generate and save each asset
    results = []
    
    for asset in assets:
        asset_result = {
            "asset": asset,
            "generate": None,
            "save": None
        }
        
        # Generate
        gen_result = await generate_asset(
            asset_type=asset["asset_type"],
            prompt=asset["prompt"],
            model=asset.get("model")
        )
        gen_data = json.loads(gen_result)
        asset_result["generate"] = gen_data
        
        if gen_data.get("success") and gen_data.get("media_url"):
            # Save
            save_result = await save_asset_to_project(
                media_url=gen_data["media_url"],
                filename=asset["filename"],
                project_path=base_path
            )
            save_data = json.loads(save_result)
            asset_result["save"] = save_data
        
        results.append(asset_result)
    
    # Summary
    successful = sum(1 for r in results if r.get("save", {}).get("success"))
    failed = len(results) - successful
    
    return json.dumps({
        "success": failed == 0,
        "spec_path": spec_path,
        "total_assets": len(assets),
        "successful": successful,
        "failed": failed,
        "results": results
    }, indent=2, ensure_ascii=False)


# ============================================
# Tool 5: register_asset
# ============================================

@mcp.tool()
async def register_asset(
    filename: str,
    relative_path: str,
    asset_type: Literal["image", "video", "audio"],
    project_id: Optional[str] = None,
    spec_id: Optional[str] = None,
    prompt: Optional[str] = None,
    model: Optional[str] = None,
    tags: Optional[str] = None,
    description: Optional[str] = None
) -> str:
    """
    ลงทะเบียน asset ใน Asset Registry ของ Backend
    
    Args:
        filename: ชื่อไฟล์ (เช่น "hero.png")
        relative_path: ตำแหน่งไฟล์เทียบกับ project root (เช่น "assets/hero.png")
        asset_type: ประเภท asset - "image", "video", หรือ "audio"
        project_id: ID ของโปรเจกต์ (optional)
        spec_id: ID ของ spec ที่เกี่ยวข้อง (optional)
        prompt: Prompt ที่ใช้สร้าง (optional)
        model: Model ที่ใช้สร้าง (optional)
        tags: Tags คั่นด้วยเครื่องหมายจุลภาค (optional, เช่น "hero,banner,marketing")
        description: คำอธิบาย asset (optional)
    
    Returns:
        JSON string containing registered asset details
    """
    if not API_TOKEN:
        return json.dumps({
            "success": False,
            "error": "SMARTSPEC_API_TOKEN environment variable is not set.",
            "hint": "Set the environment variable: export SMARTSPEC_API_TOKEN=your_jwt_token"
        }, indent=2, ensure_ascii=False)
    
    # Build request payload
    payload = {
        "filename": filename,
        "relative_path": relative_path,
        "asset_type": asset_type,
    }
    
    if project_id:
        payload["project_id"] = project_id
    if spec_id:
        payload["spec_id"] = spec_id
    if description:
        payload["description"] = description
    
    # Build metadata
    metadata = {}
    if prompt:
        metadata["prompt"] = prompt
    if model:
        metadata["model"] = model
    if metadata:
        payload["metadata"] = metadata
    
    # Parse tags
    if tags:
        payload["tags"] = [t.strip() for t in tags.split(",") if t.strip()]
    
    try:
        async with httpx.AsyncClient(timeout=30.0) as client:
            response = await client.post(
                f"{BACKEND_URL}/api/v1/assets/",
                json=payload,
                headers={
                    "Authorization": f"Bearer {API_TOKEN}",
                    "Content-Type": "application/json"
                }
            )
            
            if response.status_code == 201:
                data = response.json()
                return json.dumps({
                    "success": True,
                    "message": "Asset registered successfully",
                    "asset": data
                }, indent=2, ensure_ascii=False)
            else:
                error_detail = response.text
                try:
                    error_json = response.json()
                    error_detail = error_json.get("detail", response.text)
                except:
                    pass
                
                return json.dumps({
                    "success": False,
                    "error": f"API returned status {response.status_code}: {error_detail}"
                }, indent=2, ensure_ascii=False)
                
    except httpx.ConnectError:
        return json.dumps({
            "success": False,
            "error": f"Cannot connect to Backend API at {BACKEND_URL}"
        }, indent=2, ensure_ascii=False)
        
    except Exception as e:
        return json.dumps({
            "success": False,
            "error": f"Unexpected error: {str(e)}"
        }, indent=2, ensure_ascii=False)


# ============================================
# Tool 6: find_assets
# ============================================

@mcp.tool()
async def find_assets(
    query: Optional[str] = None,
    asset_type: Optional[Literal["image", "video", "audio"]] = None,
    project_id: Optional[str] = None,
    spec_id: Optional[str] = None,
    tags: Optional[str] = None,
    page: int = 1,
    page_size: int = 20
) -> str:
    """
    ค้นหา assets จาก Asset Registry
    
    Args:
        query: คำค้นหา (ค้นหาใน filename และ description)
        asset_type: กรองตามประเภท - "image", "video", หรือ "audio"
        project_id: กรองตาม project ID
        spec_id: กรองตาม spec ID
        tags: กรองตาม tags (คั่นด้วยเครื่องหมายจุลภาค)
        page: หมายเลขหน้า (default: 1)
        page_size: จำนวนรายการต่อหน้า (default: 20)
    
    Returns:
        JSON string containing list of assets
    """
    if not API_TOKEN:
        return json.dumps({
            "success": False,
            "error": "SMARTSPEC_API_TOKEN environment variable is not set."
        }, indent=2, ensure_ascii=False)
    
    # Build query params
    params = {
        "page": page,
        "page_size": page_size
    }
    
    if query:
        params["query"] = query
    if asset_type:
        params["asset_type"] = asset_type
    if project_id:
        params["project_id"] = project_id
    if spec_id:
        params["spec_id"] = spec_id
    if tags:
        params["tags"] = [t.strip() for t in tags.split(",") if t.strip()]
    
    try:
        async with httpx.AsyncClient(timeout=30.0) as client:
            response = await client.get(
                f"{BACKEND_URL}/api/v1/assets/",
                params=params,
                headers={
                    "Authorization": f"Bearer {API_TOKEN}"
                }
            )
            
            if response.status_code == 200:
                data = response.json()
                return json.dumps({
                    "success": True,
                    "total": data.get("total", 0),
                    "page": data.get("page", 1),
                    "page_size": data.get("page_size", 20),
                    "total_pages": data.get("total_pages", 1),
                    "assets": data.get("items", [])
                }, indent=2, ensure_ascii=False)
            else:
                return json.dumps({
                    "success": False,
                    "error": f"API returned status {response.status_code}"
                }, indent=2, ensure_ascii=False)
                
    except httpx.ConnectError:
        return json.dumps({
            "success": False,
            "error": f"Cannot connect to Backend API at {BACKEND_URL}"
        }, indent=2, ensure_ascii=False)
        
    except Exception as e:
        return json.dumps({
            "success": False,
            "error": f"Unexpected error: {str(e)}"
        }, indent=2, ensure_ascii=False)


# ============================================
# Tool 7: get_asset_details
# ============================================

@mcp.tool()
async def get_asset_details(asset_id: str) -> str:
    """
    ดึงข้อมูลรายละเอียดของ asset ตาม ID
    
    Args:
        asset_id: UUID ของ asset
    
    Returns:
        JSON string containing asset details
    """
    if not API_TOKEN:
        return json.dumps({
            "success": False,
            "error": "SMARTSPEC_API_TOKEN environment variable is not set."
        }, indent=2, ensure_ascii=False)
    
    try:
        async with httpx.AsyncClient(timeout=30.0) as client:
            response = await client.get(
                f"{BACKEND_URL}/api/v1/assets/{asset_id}",
                headers={
                    "Authorization": f"Bearer {API_TOKEN}"
                }
            )
            
            if response.status_code == 200:
                data = response.json()
                return json.dumps({
                    "success": True,
                    "asset": data
                }, indent=2, ensure_ascii=False)
            elif response.status_code == 404:
                return json.dumps({
                    "success": False,
                    "error": "Asset not found",
                    "asset_id": asset_id
                }, indent=2, ensure_ascii=False)
            else:
                return json.dumps({
                    "success": False,
                    "error": f"API returned status {response.status_code}"
                }, indent=2, ensure_ascii=False)
                
    except httpx.ConnectError:
        return json.dumps({
            "success": False,
            "error": f"Cannot connect to Backend API at {BACKEND_URL}"
        }, indent=2, ensure_ascii=False)
        
    except Exception as e:
        return json.dumps({
            "success": False,
            "error": f"Unexpected error: {str(e)}"
        }, indent=2, ensure_ascii=False)


# ============================================
# Main Entry Point
# ============================================

if __name__ == "__main__":
    # Run with stdio transport for CLI usage
    mcp.run(transport="stdio")
