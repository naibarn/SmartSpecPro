"""
Simple Artifact Storage for LLM Chat
Stores uploaded files temporarily and provides URLs for access
"""

import logging
import os
import uuid
import json
from pathlib import Path
from typing import Dict, Optional
from fastapi import APIRouter, HTTPException, Request, UploadFile, File
from pydantic import BaseModel

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/artifacts", tags=["Artifacts"])

# Storage directory — use app data dir, NOT /tmp (which is world-readable)
_DATA_DIR = Path(os.environ.get("SMARTSPEC_DATA_DIR", "./data"))
ARTIFACT_STORAGE_DIR = _DATA_DIR / "artifacts"
ARTIFACT_STORAGE_DIR.mkdir(parents=True, exist_ok=True)

# Upload limits
MAX_ARTIFACT_SIZE = 10 * 1024 * 1024  # 10 MB

# Metadata storage files
SESSIONS_FILE = ARTIFACT_STORAGE_DIR / "sessions.json"
ARTIFACTS_FILE = ARTIFACT_STORAGE_DIR / "artifacts.json"

# Initialize from files if they exist
def load_json_file(file_path: Path) -> Dict:
    """Load JSON file or return empty dict"""
    try:
        if file_path.exists():
            with open(file_path, "r") as f:
                return json.load(f)
    except Exception:
        pass
    return {}

def save_json_file(file_path: Path, data: Dict):
    """Save dict to JSON file"""
    try:
        with open(file_path, "w") as f:
            json.dump(data, f, indent=2)
    except Exception as e:
        logger.error("artifacts_save_json_failed", extra={"error_type": type(e).__name__})

# Load existing data
SESSIONS = load_json_file(SESSIONS_FILE)
ARTIFACTS = load_json_file(ARTIFACTS_FILE)


class CreateSessionRequest(BaseModel):
    name: str


class CreateSessionResponse(BaseModel):
    session: Dict


class PresignPutRequest(BaseModel):
    iteration: int
    name: str
    contentType: Optional[str] = "application/octet-stream"


class PresignPutResponse(BaseModel):
    artifact: Dict


class PresignGetResponse(BaseModel):
    artifact: Dict


def get_base_url(request: Request) -> str:
    """Get base URL from request"""
    return f"{request.url.scheme}://{request.url.netloc}"


@router.post("/sessions")
async def create_session(req: CreateSessionRequest, request: Request):
    """Create a new session (simplified - no project needed)"""
    session_id = str(uuid.uuid4())
    session = {
        "id": session_id,
        "name": req.name,
        "artifacts": {}
    }
    SESSIONS[session_id] = session
    save_json_file(SESSIONS_FILE, SESSIONS)
    return CreateSessionResponse(session=session)


@router.post("/sessions/{session_id}/artifacts/presign-put")
async def presign_put(
    session_id: str,
    req: PresignPutRequest,
    request: Request
):
    """
    Generate presigned PUT URL for uploading artifact

    For simplicity, we'll use a regular POST endpoint instead of actual presigned URLs
    """
    # Auto-create session if not found (for robustness)
    if session_id not in SESSIONS:
        SESSIONS[session_id] = {
            "id": session_id,
            "name": f"Auto-created session {session_id[:8]}",
            "artifacts": {}
        }
        save_json_file(SESSIONS_FILE, SESSIONS)

    # Generate artifact key
    artifact_key = f"{session_id}/{req.iteration}/{uuid.uuid4()}_{req.name}"

    # Create artifact metadata
    artifact = {
        "key": artifact_key,
        "url": f"{get_base_url(request)}/api/artifacts/upload/{artifact_key}",
        "expiresInSeconds": 3600,
        "headers": {
            "Content-Type": req.contentType
        }
    }

    # Store artifact metadata
    ARTIFACTS[artifact_key] = {
        "session_id": session_id,
        "iteration": req.iteration,
        "name": req.name,
        "content_type": req.contentType,
        "uploaded": False
    }
    save_json_file(ARTIFACTS_FILE, ARTIFACTS)

    return PresignPutResponse(artifact=artifact)


@router.put("/upload/{artifact_key:path}")
async def upload_artifact(
    artifact_key: str,
    request: Request
):
    """Upload artifact data"""
    if artifact_key not in ARTIFACTS:
        raise HTTPException(status_code=404, detail="Artifact not found")

    # Check Content-Length header before reading body
    content_length = request.headers.get("content-length")
    if content_length and int(content_length) > MAX_ARTIFACT_SIZE:
        raise HTTPException(status_code=413, detail="File too large (max 10 MB)")

    # Read file content
    content = await request.body()

    if len(content) > MAX_ARTIFACT_SIZE:
        raise HTTPException(status_code=413, detail="File too large (max 10 MB)")

    # Save to disk — sanitize artifact_key to prevent path traversal
    import re as _re
    safe_name = _re.sub(r'[^a-zA-Z0-9_\-.]', '_', artifact_key)
    artifact_path = (ARTIFACT_STORAGE_DIR / safe_name).resolve()
    # Verify resolved path is within storage dir
    if not str(artifact_path).startswith(str(ARTIFACT_STORAGE_DIR.resolve())):
        raise HTTPException(status_code=403, detail="Invalid artifact path")
    artifact_path.parent.mkdir(parents=True, exist_ok=True)

    with open(artifact_path, "wb") as f:
        f.write(content)

    # Update metadata
    ARTIFACTS[artifact_key]["uploaded"] = True
    ARTIFACTS[artifact_key]["path"] = str(artifact_path)
    ARTIFACTS[artifact_key]["size"] = len(content)
    save_json_file(ARTIFACTS_FILE, ARTIFACTS)

    return {"success": True}


@router.get("/sessions/{session_id}/artifacts/presign-get")
async def presign_get(
    session_id: str,
    key: str,
    request: Request
):
    """Generate presigned GET URL for downloading artifact"""
    # Auto-create session if not found (for robustness)
    if session_id not in SESSIONS:
        SESSIONS[session_id] = {
            "id": session_id,
            "name": f"Auto-created session {session_id[:8]}",
            "artifacts": {}
        }
        save_json_file(SESSIONS_FILE, SESSIONS)

    if key not in ARTIFACTS:
        raise HTTPException(status_code=404, detail="Artifact not found")

    artifact = {
        "key": key,
        "url": f"{get_base_url(request)}/api/artifacts/download/{key}",
        "expiresInSeconds": 3600
    }

    return PresignGetResponse(artifact=artifact)


@router.get("/download/{artifact_key:path}")
async def download_artifact(artifact_key: str):
    """Download artifact data"""
    if artifact_key not in ARTIFACTS:
        raise HTTPException(status_code=404, detail="Artifact not found")

    artifact_meta = ARTIFACTS[artifact_key]

    if not artifact_meta.get("uploaded"):
        raise HTTPException(status_code=404, detail="Artifact not uploaded yet")

    artifact_path = Path(artifact_meta["path"]).resolve()

    # Ensure path is within storage dir (prevent path traversal)
    if not str(artifact_path).startswith(str(ARTIFACT_STORAGE_DIR.resolve())):
        raise HTTPException(status_code=403, detail="Access denied")

    if not artifact_path.exists():
        raise HTTPException(status_code=404, detail="Artifact file not found")

    from fastapi.responses import FileResponse

    return FileResponse(
        path=str(artifact_path),
        media_type=artifact_meta.get("content_type", "application/octet-stream"),
        filename=artifact_meta.get("name", "download")
    )
