# แผนการพัฒนา OpenCode/OpenWork Integration

**Version:** 1.0  
**Date:** 16 มกราคม 2569  
**Status:** Draft

---

## 1. Executive Summary

เอกสารนี้นำเสนอแผนการพัฒนาเพื่อแก้ไขปัญหา 4 ข้อที่พบในระบบ SmartSpecPro และสร้าง UI สำหรับเปิด OpenCode CLI และ OpenWork UI โดยทุก LLM calls ต้องผ่าน LLM Gateway ที่ออกแบบไว้

### เป้าหมาย
1. แก้ไขปัญหาที่มีอยู่ 4 ข้อให้สมบูรณ์
2. สร้าง UI ให้เปิดได้ทั้ง OpenCode CLI และ OpenWork UI
3. ทุก LLM calls ผ่าน SmartSpecPro LLM Gateway (credit เดียวกัน)
4. ไม่แก้ไข code ของ OpenWork (ใช้ตามปกติ)

---

## 2. สถานะปัจจุบันและปัญหาที่พบ

### 2.1 ปัญหาที่ 1: OpenCode Gateway ไม่สมบูรณ์

**ตำแหน่ง:** `python-backend/app/api/opencode_gateway.py`

**สถานะปัจจุบัน:**
- มี Endpoint `/v1/opencode/chat/completions` แล้ว
- มี Logic สำหรับ forward request ไปยัง LLM Gateway
- **ปัญหา:** API Key validation ยังไม่ทำงานจริง (ใช้ dummy validation)

**Code ที่เกี่ยวข้อง:**
```python
# บรรทัด 45-55 ของ opencode_gateway.py
async def validate_api_key(api_key: str, db: AsyncSession) -> Optional[User]:
    """Validate API key and return user"""
    # TODO: Implement proper API key validation
    # For now, accept any key starting with sk-smartspec-
    if api_key.startswith("sk-smartspec-"):
        # Mock user for testing
        return None  # Should return actual user
    return None
```

### 2.2 ปัญหาที่ 2: API Key Validation ยังไม่ Implement

**ตำแหน่ง:** `python-backend/app/services/api_key_service.py`

**สถานะปัจจุบัน:**
- มี `APIKeyService` class แล้ว
- มี `generate_api_key()`, `create_api_key()`, `get_api_key_by_hash()` แล้ว
- **ปัญหา:** ไม่มี `validate_api_key()` function สำหรับ validate key จาก request

**สิ่งที่ขาด:**
```python
# ต้องเพิ่ม function นี้
@staticmethod
async def validate_api_key(
    db: AsyncSession,
    raw_key: str
) -> Optional[tuple[APIKey, User]]:
    """
    Validate API key from request
    
    Args:
        db: Database session
        raw_key: Raw API key from Authorization header
    
    Returns:
        (APIKey, User) tuple if valid, None if invalid
    """
    pass
```

### 2.3 ปัญหาที่ 3: OpenCodeAdapter เป็น Mock

**ตำแหน่ง:** `python-backend/app/orchestrator/agents/opencode_adapter.py`

**สถานะปัจจุบัน:**
- มี `OpenCodeAdapter` class แล้ว
- **ปัญหา:** ทุก method return mock response ไม่ได้ call LLM Gateway จริง

**Code ที่เป็นปัญหา:**
```python
async def execute_task(self, task: dict) -> dict:
    """Execute task via OpenCode"""
    # TODO: Implement actual OpenCode integration
    return {
        "status": "mock",
        "message": "OpenCode integration not yet implemented"
    }
```

### 2.4 ปัญหาที่ 4: Desktop App ไม่ได้ Launch OpenCode Server

**ตำแหน่ง:** `desktop-app/src-tauri/src/`

**สถานะปัจจุบัน:**
- มี `python_bridge.rs` สำหรับเรียก Python scripts
- มี `workflow_commands.rs` สำหรับ workflow execution
- **ปัญหา:** ไม่มี commands สำหรับ:
  - Launch `opencode serve` (OpenCode Server)
  - Launch OpenWork Client
  - Manage OpenCode sessions

---

## 3. สถาปัตยกรรมที่นำเสนอ

### 3.1 Architecture Overview

```
┌─────────────────────────────────────────────────────────────────────┐
│                        SmartSpecPro Desktop App                      │
├─────────────────────────────────────────────────────────────────────┤
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────────────────────┐  │
│  │  Chat UI    │  │ Dev Mode UI │  │    Progress Dashboard       │  │
│  │             │  │             │  │                             │  │
│  │ [Open in    │  │ [OpenCode]  │  │  Phase: Implementing...     │  │
│  │  Dev Mode]  │  │ [OpenWork]  │  │  Progress: 65%              │  │
│  └──────┬──────┘  └──────┬──────┘  └─────────────────────────────┘  │
│         │                │                                           │
│         └────────┬───────┘                                           │
│                  ▼                                                   │
│  ┌─────────────────────────────────────────────────────────────┐    │
│  │                    Tauri Core (Rust)                         │    │
│  │  ┌─────────────────┐  ┌─────────────────┐                   │    │
│  │  │ opencode_cmds   │  │ session_manager │                   │    │
│  │  │ - start_server  │  │ - create        │                   │    │
│  │  │ - stop_server   │  │ - get_active    │                   │    │
│  │  │ - open_openwork │  │ - close         │                   │    │
│  │  └────────┬────────┘  └────────┬────────┘                   │    │
│  └───────────┼────────────────────┼────────────────────────────┘    │
└──────────────┼────────────────────┼─────────────────────────────────┘
               │                    │
               ▼                    ▼
┌──────────────────────────────────────────────────────────────────────┐
│                         External Processes                            │
│  ┌────────────────────┐          ┌────────────────────┐              │
│  │   OpenCode Server  │          │   OpenWork Client  │              │
│  │   (opencode serve) │◄────────►│   (Browser/Electron)│              │
│  │                    │          │                    │              │
│  │   Port: 3795       │          │   Connects to:     │              │
│  │   Workspace: /path │          │   localhost:3795   │              │
│  └─────────┬──────────┘          └────────────────────┘              │
└────────────┼─────────────────────────────────────────────────────────┘
             │
             │ LLM Requests (OpenAI-compatible)
             │ Authorization: Bearer sk-smartspec-xxx
             ▼
┌──────────────────────────────────────────────────────────────────────┐
│                    SmartSpecPro Backend                               │
│  ┌────────────────────────────────────────────────────────────────┐  │
│  │                  OpenCode Gateway                               │  │
│  │                  /v1/opencode/chat/completions                  │  │
│  │                                                                 │  │
│  │  1. Validate API Key (sk-smartspec-xxx)                        │  │
│  │  2. Get User from API Key                                       │  │
│  │  3. Check Credits                                               │  │
│  │  4. Forward to LLM Gateway                                      │  │
│  └─────────────────────────────┬──────────────────────────────────┘  │
│                                │                                      │
│                                ▼                                      │
│  ┌────────────────────────────────────────────────────────────────┐  │
│  │                     LLM Gateway                                 │  │
│  │                                                                 │  │
│  │  - Model Selection (OpenRouter/Direct)                         │  │
│  │  - Credit Deduction                                             │  │
│  │  - Usage Tracking                                               │  │
│  └─────────────────────────────┬──────────────────────────────────┘  │
│                                │                                      │
│                                ▼                                      │
│  ┌────────────────────────────────────────────────────────────────┐  │
│  │              OpenRouter / Direct Providers                      │  │
│  │  Claude, GPT-4, Gemini, Llama, etc.                            │  │
│  └────────────────────────────────────────────────────────────────┘  │
└──────────────────────────────────────────────────────────────────────┘
```

### 3.2 Session Management

```
┌─────────────────────────────────────────────────────────────────┐
│                    Session Management                            │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  Rule: 1 Workspace = 1 Active Session                           │
│                                                                  │
│  ┌─────────────────────────────────────────────────────────────┐│
│  │  Session State                                               ││
│  │  {                                                           ││
│  │    "session_id": "uuid",                                     ││
│  │    "workspace_path": "/path/to/project",                     ││
│  │    "opencode_server_pid": 12345,                             ││
│  │    "opencode_server_port": 3795,                             ││
│  │    "openwork_url": "http://localhost:3795",                  ││
│  │    "api_key": "sk-smartspec-xxx",                            ││
│  │    "created_at": "2025-01-16T10:00:00Z",                     ││
│  │    "status": "active" | "stopped"                            ││
│  │  }                                                           ││
│  └─────────────────────────────────────────────────────────────┘│
│                                                                  │
│  Flow:                                                           │
│  1. User clicks "Open in Dev Mode"                              │
│  2. Check if session exists for workspace                        │
│  3. If exists & active → reuse session                          │
│  4. If not exists → create new session                          │
│  5. Start OpenCode server (if not running)                      │
│  6. Open OpenCode CLI or OpenWork UI                            │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

---

## 4. แผนการดำเนินงาน (Tasks)

### Phase 1: Backend Fixes (3-4 วัน)

#### Task 1.1: Implement API Key Validation
**ไฟล์:** `python-backend/app/services/api_key_service.py`
**ระยะเวลา:** 0.5 วัน

**สิ่งที่ต้องทำ:**
1. เพิ่ม `validate_api_key()` method ใน `APIKeyService`
2. Hash raw key และ compare กับ stored hash
3. Check expiration และ is_active
4. Return (APIKey, User) tuple

**Code ที่ต้องเพิ่ม:**
```python
@staticmethod
async def validate_api_key(
    db: AsyncSession,
    raw_key: str
) -> Optional[tuple[APIKey, User]]:
    """Validate API key and return key + user"""
    from app.core.security_enhanced import TokenGenerator
    
    # Hash the raw key
    key_hash = TokenGenerator.hash_token(raw_key)
    
    # Find API key by hash
    result = await db.execute(
        select(APIKey)
        .options(joinedload(APIKey.user))
        .where(APIKey.key_hash == key_hash)
    )
    api_key = result.scalar_one_or_none()
    
    if not api_key:
        return None
    
    # Check if valid (active and not expired)
    if not api_key.is_valid():
        return None
    
    # Update last_used_at
    api_key.last_used_at = datetime.utcnow()
    await db.commit()
    
    return (api_key, api_key.user)
```

#### Task 1.2: Fix OpenCode Gateway
**ไฟล์:** `python-backend/app/api/opencode_gateway.py`
**ระยะเวลา:** 1 วัน

**สิ่งที่ต้องทำ:**
1. ใช้ `APIKeyService.validate_api_key()` จริง
2. เชื่อมต่อกับ `LLMGateway` สำหรับ forward requests
3. Handle streaming responses
4. Track usage per API key

**Code ที่ต้องแก้ไข:**
```python
async def validate_api_key(api_key: str, db: AsyncSession) -> Optional[tuple[APIKey, User]]:
    """Validate API key and return key + user"""
    from app.services.api_key_service import APIKeyService
    
    if not api_key.startswith("sk-smartspec-"):
        return None
    
    return await APIKeyService.validate_api_key(db, api_key)


@router.post("/v1/opencode/chat/completions")
async def opencode_chat_completions(
    request: Request,
    db: AsyncSession = Depends(get_db)
):
    """OpenAI-compatible chat completions for OpenCode"""
    # Extract API key
    auth_header = request.headers.get("Authorization", "")
    if not auth_header.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Missing API key")
    
    api_key = auth_header.replace("Bearer ", "")
    
    # Validate API key
    result = await validate_api_key(api_key, db)
    if not result:
        raise HTTPException(status_code=401, detail="Invalid API key")
    
    api_key_obj, user = result
    
    # Parse request body
    body = await request.json()
    
    # Create LLM request
    llm_request = LLMRequest(
        model=body.get("model", "anthropic/claude-3.5-sonnet"),
        messages=body.get("messages", []),
        temperature=body.get("temperature", 0.7),
        max_tokens=body.get("max_tokens", 4096),
        stream=body.get("stream", False)
    )
    
    # Forward to LLM Gateway
    gateway = LLMGateway(db)
    response = await gateway.invoke(llm_request, user)
    
    # Return OpenAI-compatible response
    return {
        "id": f"chatcmpl-{uuid.uuid4().hex[:8]}",
        "object": "chat.completion",
        "created": int(datetime.utcnow().timestamp()),
        "model": response.model,
        "choices": [{
            "index": 0,
            "message": {
                "role": "assistant",
                "content": response.content
            },
            "finish_reason": "stop"
        }],
        "usage": {
            "prompt_tokens": response.usage.prompt_tokens,
            "completion_tokens": response.usage.completion_tokens,
            "total_tokens": response.usage.total_tokens
        }
    }
```

#### Task 1.3: Implement OpenCodeAdapter
**ไฟล์:** `python-backend/app/orchestrator/agents/opencode_adapter.py`
**ระยะเวลา:** 1.5 วัน

**สิ่งที่ต้องทำ:**
1. Implement `execute_task()` ให้เรียก LLM Gateway จริง
2. Implement `run_command()` สำหรับ execute shell commands
3. Implement `edit_file()` สำหรับ file operations
4. Handle task context และ workspace path

**Code ที่ต้องแก้ไข:**
```python
class OpenCodeAdapter:
    """Adapter for OpenCode integration with LLM Gateway"""
    
    def __init__(self, db: AsyncSession, user: User, workspace_path: str):
        self.db = db
        self.user = user
        self.workspace_path = workspace_path
        self.gateway = LLMGateway(db)
    
    async def execute_task(self, task: dict) -> dict:
        """Execute task via LLM Gateway"""
        # Build prompt from task
        prompt = self._build_prompt(task)
        
        # Create LLM request
        request = LLMRequest(
            model=task.get("model", "anthropic/claude-3.5-sonnet"),
            messages=[
                {"role": "system", "content": self._get_system_prompt()},
                {"role": "user", "content": prompt}
            ],
            temperature=0.2,
            max_tokens=8192
        )
        
        # Call LLM Gateway
        response = await self.gateway.invoke(request, self.user)
        
        # Parse and execute response
        return await self._process_response(response)
    
    async def run_command(self, command: str) -> dict:
        """Execute shell command in workspace"""
        import subprocess
        
        result = subprocess.run(
            command,
            shell=True,
            cwd=self.workspace_path,
            capture_output=True,
            text=True,
            timeout=300
        )
        
        return {
            "stdout": result.stdout,
            "stderr": result.stderr,
            "returncode": result.returncode
        }
    
    async def edit_file(self, file_path: str, content: str) -> dict:
        """Edit file in workspace"""
        full_path = os.path.join(self.workspace_path, file_path)
        
        # Ensure directory exists
        os.makedirs(os.path.dirname(full_path), exist_ok=True)
        
        # Write content
        with open(full_path, 'w') as f:
            f.write(content)
        
        return {"status": "success", "path": full_path}
```

### Phase 2: Desktop App Integration (2-3 วัน)

#### Task 2.1: Create OpenCode Commands (Tauri)
**ไฟล์:** `desktop-app/src-tauri/src/opencode_commands.rs`
**ระยะเวลา:** 1 วัน

**สิ่งที่ต้องทำ:**
1. สร้าง `start_opencode_server` command
2. สร้าง `stop_opencode_server` command
3. สร้าง `get_opencode_status` command
4. สร้าง `open_openwork` command
5. Manage session state

**Code ที่ต้องสร้าง:**
```rust
// opencode_commands.rs

use std::process::{Command, Child, Stdio};
use std::sync::Mutex;
use std::collections::HashMap;
use tauri::State;
use serde::{Deserialize, Serialize};

#[derive(Default)]
pub struct OpenCodeState {
    sessions: Mutex<HashMap<String, OpenCodeSession>>,
}

#[derive(Clone, Serialize, Deserialize)]
pub struct OpenCodeSession {
    session_id: String,
    workspace_path: String,
    server_port: u16,
    api_key: String,
    status: String,
}

#[tauri::command]
pub async fn start_opencode_server(
    workspace_path: String,
    api_key: String,
    backend_url: String,
    state: State<'_, OpenCodeState>,
) -> Result<OpenCodeSession, String> {
    // Check if session already exists
    let sessions = state.sessions.lock().unwrap();
    if let Some(session) = sessions.get(&workspace_path) {
        if session.status == "active" {
            return Ok(session.clone());
        }
    }
    drop(sessions);
    
    // Find available port
    let port = find_available_port(3795, 3800)?;
    
    // Start OpenCode server
    let child = Command::new("opencode")
        .args(&[
            "serve",
            "--port", &port.to_string(),
            "--workspace", &workspace_path,
            "--api-base", &format!("{}/v1/opencode", backend_url),
            "--api-key", &api_key,
        ])
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()
        .map_err(|e| format!("Failed to start OpenCode: {}", e))?;
    
    // Create session
    let session = OpenCodeSession {
        session_id: uuid::Uuid::new_v4().to_string(),
        workspace_path: workspace_path.clone(),
        server_port: port,
        api_key,
        status: "active".to_string(),
    };
    
    // Store session
    let mut sessions = state.sessions.lock().unwrap();
    sessions.insert(workspace_path, session.clone());
    
    Ok(session)
}

#[tauri::command]
pub async fn stop_opencode_server(
    workspace_path: String,
    state: State<'_, OpenCodeState>,
) -> Result<(), String> {
    let mut sessions = state.sessions.lock().unwrap();
    
    if let Some(session) = sessions.get_mut(&workspace_path) {
        // Kill the process
        // ... implementation
        session.status = "stopped".to_string();
    }
    
    Ok(())
}

#[tauri::command]
pub async fn open_openwork(
    workspace_path: String,
    state: State<'_, OpenCodeState>,
) -> Result<String, String> {
    let sessions = state.sessions.lock().unwrap();
    
    let session = sessions.get(&workspace_path)
        .ok_or("No active session for this workspace")?;
    
    if session.status != "active" {
        return Err("Session is not active".to_string());
    }
    
    // Construct OpenWork URL
    let openwork_url = format!(
        "http://localhost:{}?workspace={}",
        session.server_port,
        urlencoding::encode(&workspace_path)
    );
    
    // Open in default browser
    open::that(&openwork_url)
        .map_err(|e| format!("Failed to open browser: {}", e))?;
    
    Ok(openwork_url)
}

#[tauri::command]
pub async fn get_opencode_status(
    workspace_path: String,
    state: State<'_, OpenCodeState>,
) -> Result<Option<OpenCodeSession>, String> {
    let sessions = state.sessions.lock().unwrap();
    Ok(sessions.get(&workspace_path).cloned())
}
```

#### Task 2.2: Create Frontend Service
**ไฟล์:** `desktop-app/src/services/openCodeService.ts`
**ระยะเวลา:** 0.5 วัน

**สิ่งที่ต้องทำ:**
1. สร้าง TypeScript wrapper สำหรับ Tauri commands
2. สร้าง `useOpenCode` hook
3. Handle session state ใน React

**Code ที่ต้องสร้าง:**
```typescript
// openCodeService.ts

import { invoke } from '@tauri-apps/api/tauri';
import { useState, useEffect, useCallback } from 'react';

export interface OpenCodeSession {
  session_id: string;
  workspace_path: string;
  server_port: number;
  api_key: string;
  status: 'active' | 'stopped';
}

export class OpenCodeService {
  static async startServer(
    workspacePath: string,
    apiKey: string,
    backendUrl: string
  ): Promise<OpenCodeSession> {
    return await invoke('start_opencode_server', {
      workspacePath,
      apiKey,
      backendUrl,
    });
  }

  static async stopServer(workspacePath: string): Promise<void> {
    await invoke('stop_opencode_server', { workspacePath });
  }

  static async openOpenWork(workspacePath: string): Promise<string> {
    return await invoke('open_openwork', { workspacePath });
  }

  static async getStatus(workspacePath: string): Promise<OpenCodeSession | null> {
    return await invoke('get_opencode_status', { workspacePath });
  }
}

export function useOpenCode(workspacePath: string) {
  const [session, setSession] = useState<OpenCodeSession | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refreshStatus = useCallback(async () => {
    try {
      const status = await OpenCodeService.getStatus(workspacePath);
      setSession(status);
    } catch (e) {
      setError(String(e));
    }
  }, [workspacePath]);

  useEffect(() => {
    refreshStatus();
  }, [refreshStatus]);

  const startServer = async (apiKey: string, backendUrl: string) => {
    setLoading(true);
    setError(null);
    try {
      const newSession = await OpenCodeService.startServer(
        workspacePath,
        apiKey,
        backendUrl
      );
      setSession(newSession);
      return newSession;
    } catch (e) {
      setError(String(e));
      throw e;
    } finally {
      setLoading(false);
    }
  };

  const stopServer = async () => {
    setLoading(true);
    try {
      await OpenCodeService.stopServer(workspacePath);
      await refreshStatus();
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  };

  const openOpenWork = async () => {
    try {
      return await OpenCodeService.openOpenWork(workspacePath);
    } catch (e) {
      setError(String(e));
      throw e;
    }
  };

  return {
    session,
    loading,
    error,
    startServer,
    stopServer,
    openOpenWork,
    refreshStatus,
  };
}
```

#### Task 2.3: Create Dev Mode UI
**ไฟล์:** `desktop-app/src/components/DevModePanel.tsx`
**ระยะเวลา:** 1 วัน

**สิ่งที่ต้องทำ:**
1. สร้าง UI สำหรับ Dev Mode
2. แสดงสถานะ OpenCode Server
3. ปุ่ม Start/Stop Server
4. ปุ่ม Open OpenCode CLI
5. ปุ่ม Open OpenWork UI

**Code ที่ต้องสร้าง:**
```tsx
// DevModePanel.tsx

import React, { useState } from 'react';
import { useOpenCode } from '../services/openCodeService';
import { useAuth } from '../hooks/useAuth';
import { useProject } from '../hooks/useProject';

export const DevModePanel: React.FC = () => {
  const { currentProject } = useProject();
  const { apiKey, backendUrl } = useAuth();
  const {
    session,
    loading,
    error,
    startServer,
    stopServer,
    openOpenWork,
  } = useOpenCode(currentProject?.path || '');

  const [showApiKeyInput, setShowApiKeyInput] = useState(false);

  const handleStartServer = async () => {
    if (!apiKey) {
      setShowApiKeyInput(true);
      return;
    }
    await startServer(apiKey, backendUrl);
  };

  const handleOpenOpenWork = async () => {
    if (!session || session.status !== 'active') {
      await handleStartServer();
    }
    await openOpenWork();
  };

  const handleOpenCLI = () => {
    // Open terminal with opencode command
    // Implementation depends on platform
  };

  return (
    <div className="dev-mode-panel p-4 bg-gray-900 rounded-lg">
      <h2 className="text-xl font-bold text-white mb-4">
        🛠️ Dev Mode
      </h2>

      {/* Status */}
      <div className="mb-4">
        <div className="flex items-center gap-2">
          <div
            className={`w-3 h-3 rounded-full ${
              session?.status === 'active'
                ? 'bg-green-500'
                : 'bg-gray-500'
            }`}
          />
          <span className="text-gray-300">
            {session?.status === 'active'
              ? `Server running on port ${session.server_port}`
              : 'Server not running'}
          </span>
        </div>
      </div>

      {/* Error */}
      {error && (
        <div className="mb-4 p-2 bg-red-900/50 text-red-300 rounded">
          {error}
        </div>
      )}

      {/* Actions */}
      <div className="flex flex-col gap-2">
        {session?.status !== 'active' ? (
          <button
            onClick={handleStartServer}
            disabled={loading}
            className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded disabled:opacity-50"
          >
            {loading ? 'Starting...' : '▶️ Start Dev Server'}
          </button>
        ) : (
          <>
            <button
              onClick={handleOpenCLI}
              className="px-4 py-2 bg-gray-700 hover:bg-gray-600 text-white rounded"
            >
              💻 Open OpenCode CLI
            </button>
            <button
              onClick={handleOpenOpenWork}
              className="px-4 py-2 bg-purple-600 hover:bg-purple-700 text-white rounded"
            >
              🌐 Open OpenWork UI
            </button>
            <button
              onClick={stopServer}
              disabled={loading}
              className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded disabled:opacity-50"
            >
              ⏹️ Stop Server
            </button>
          </>
        )}
      </div>

      {/* Info */}
      <div className="mt-4 text-sm text-gray-500">
        <p>💡 Dev Mode ใช้ LLM Gateway ของ SmartSpecPro</p>
        <p>Credits จะถูกหักจากบัญชีเดียวกัน</p>
      </div>
    </div>
  );
};
```

---

## 5. Timeline Summary

| Phase | Task | ระยะเวลา | Dependencies |
|-------|------|----------|--------------|
| **1** | **Backend Fixes** | **3-4 วัน** | |
| 1.1 | Implement API Key Validation | 0.5 วัน | - |
| 1.2 | Fix OpenCode Gateway | 1 วัน | 1.1 |
| 1.3 | Implement OpenCodeAdapter | 1.5 วัน | 1.2 |
| **2** | **Desktop App Integration** | **2-3 วัน** | Phase 1 |
| 2.1 | Create OpenCode Commands (Tauri) | 1 วัน | - |
| 2.2 | Create Frontend Service | 0.5 วัน | 2.1 |
| 2.3 | Create Dev Mode UI | 1 วัน | 2.2 |
| **Total** | | **5-7 วัน** | |

---

## 6. Testing Plan

### 6.1 Unit Tests
- `test_api_key_validation.py` - ทดสอบ API Key validation
- `test_opencode_gateway.py` - ทดสอบ OpenCode Gateway endpoints
- `test_opencode_adapter.py` - ทดสอบ OpenCodeAdapter methods

### 6.2 Integration Tests
- ทดสอบ flow: Create API Key → Use in OpenCode → Verify credit deduction
- ทดสอบ session management: Start → Stop → Restart
- ทดสอบ OpenWork connection

### 6.3 E2E Tests
- ทดสอบ full flow จาก Desktop App UI

---

## 7. Risks and Mitigations

| Risk | Impact | Mitigation |
|------|--------|------------|
| OpenCode CLI ไม่ติดตั้ง | High | แสดง error message พร้อมลิงก์ติดตั้ง |
| Port conflict | Medium | Auto-find available port |
| API Key leak | High | ใช้ secure storage, ไม่แสดงใน logs |
| OpenWork version incompatible | Medium | Document supported versions |

---

## 8. Success Criteria

1. ✅ API Key `sk-smartspec-*` ใช้งานได้จริง
2. ✅ OpenCode Gateway forward requests ไปยัง LLM Gateway ได้
3. ✅ OpenCodeAdapter execute tasks ผ่าน LLM Gateway ได้
4. ✅ Desktop App สามารถ Start/Stop OpenCode Server ได้
5. ✅ Desktop App สามารถเปิด OpenWork UI ได้
6. ✅ Credits ถูกหักจากบัญชีเดียวกัน
7. ✅ ไม่มีการแก้ไข code ของ OpenWork

---

## 9. Appendix

### A. OpenCode CLI Commands

```bash
# Start server with custom API base
opencode serve --port 3795 --api-base http://localhost:8000/v1/opencode --api-key sk-smartspec-xxx

# Check status
opencode status

# Run in workspace
opencode --workspace /path/to/project
```

### B. OpenWork URL Parameters

```
http://localhost:3795?workspace=/path/to/project&session=xxx
```

### C. API Key Format

```
sk-smartspec-{random_32_chars}

Example: sk-smartspec-abc123def456ghi789jkl012mno345pq
```
