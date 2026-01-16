"""
SmartSpec Pro - OpenCode Adapter
Phase 1.2: OpenCode Integration (COMPLETED)

Adapter layer between Supervisor Agent and OpenCode CLI.
Provides a clean interface for the Supervisor to interact with OpenCode
for micro-level implementation tasks.

This adapter now connects to the SmartSpecPro LLM Gateway,
ensuring all LLM calls go through the unified credit system.
"""

import asyncio
import json
import os
import subprocess
import aiohttp
from dataclasses import dataclass, field
from datetime import datetime
from typing import Any, Dict, List, Optional
from uuid import uuid4

import structlog

logger = structlog.get_logger()


# ==================== DATA CLASSES ====================

@dataclass
class OpenCodeExecutionRequest:
    """Request to execute a task in OpenCode."""
    request_id: str = field(default_factory=lambda: str(uuid4()))
    project_id: str = ""
    user_id: str = ""
    prompt: str = ""
    files: List[str] = field(default_factory=list)  # Files to focus on
    context: Dict[str, Any] = field(default_factory=dict)
    timeout_seconds: int = 180
    max_tokens: int = 8000
    workspace_path: Optional[str] = None
    
    def to_dict(self) -> Dict[str, Any]:
        return {
            "request_id": self.request_id,
            "project_id": self.project_id,
            "user_id": self.user_id,
            "prompt": self.prompt,
            "files": self.files,
            "context": self.context,
            "timeout_seconds": self.timeout_seconds,
            "max_tokens": self.max_tokens,
            "workspace_path": self.workspace_path,
        }


@dataclass
class OpenCodeExecutionResult:
    """Result from OpenCode execution."""
    request_id: str
    success: bool
    output: str = ""
    files_created: List[str] = field(default_factory=list)
    files_modified: List[str] = field(default_factory=list)
    tests_passed: Optional[int] = None
    tests_failed: Optional[int] = None
    tokens_used: int = 0
    cost: float = 0.0
    duration_ms: int = 0
    error: Optional[str] = None
    model: str = ""
    
    def to_dict(self) -> Dict[str, Any]:
        return {
            "request_id": self.request_id,
            "success": self.success,
            "output": self.output,
            "files_created": self.files_created,
            "files_modified": self.files_modified,
            "tests_passed": self.tests_passed,
            "tests_failed": self.tests_failed,
            "tokens_used": self.tokens_used,
            "cost": self.cost,
            "duration_ms": self.duration_ms,
            "error": self.error,
            "model": self.model,
        }


@dataclass
class FileEditRequest:
    """Request to edit a file."""
    file_path: str
    content: str
    create_if_missing: bool = True
    backup: bool = True


@dataclass
class CommandExecutionResult:
    """Result from command execution."""
    command: str
    stdout: str
    stderr: str
    return_code: int
    duration_ms: int
    success: bool


# ==================== OPENCODE ADAPTER ====================

class OpenCodeAdapter:
    """
    Adapter for OpenCode CLI integration.
    
    Provides a clean interface between the Supervisor Agent and OpenCode,
    handling API communication, authentication, and result processing.
    
    OpenCode is used as the "Micro-hand" for implementation tasks:
    - Writing code
    - Fixing bugs
    - Running tests
    - Refactoring
    
    All LLM calls go through SmartSpecPro's LLM Gateway for unified
    credit management and billing.
    """
    
    def __init__(
        self,
        api_base_url: str = "http://localhost:8000/v1/opencode",
        api_key: Optional[str] = None,
        workspace_path: Optional[str] = None,
        default_model: str = "anthropic/claude-3.5-sonnet",
    ):
        """
        Initialize the OpenCode Adapter.
        
        Args:
            api_base_url: Base URL for SmartSpecPro's OpenCode Gateway
            api_key: SmartSpec API key (sk-smartspec-...)
            workspace_path: Default workspace path for file operations
            default_model: Default model to use for LLM calls
        """
        self.api_base_url = api_base_url.rstrip("/")
        self.api_key = api_key
        self.workspace_path = workspace_path
        self.default_model = default_model
        self._http_session: Optional[aiohttp.ClientSession] = None
        
        logger.info(
            "opencode_adapter_initialized",
            api_base_url=api_base_url,
            workspace_path=workspace_path,
            default_model=default_model,
        )
    
    async def _get_session(self) -> aiohttp.ClientSession:
        """Get or create HTTP session."""
        if self._http_session is None or self._http_session.closed:
            headers = {
                "Content-Type": "application/json",
            }
            if self.api_key:
                headers["Authorization"] = f"Bearer {self.api_key}"
            
            self._http_session = aiohttp.ClientSession(
                headers=headers,
                timeout=aiohttp.ClientTimeout(total=300),
            )
        return self._http_session
    
    async def execute(self, request: OpenCodeExecutionRequest) -> OpenCodeExecutionResult:
        """
        Execute a task in OpenCode via LLM Gateway.
        
        Args:
            request: The execution request
            
        Returns:
            OpenCodeExecutionResult with the outcome
        """
        start_time = datetime.utcnow()
        
        try:
            logger.info(
                "opencode_execution_started",
                request_id=request.request_id,
                prompt_length=len(request.prompt),
            )
            
            # Build the API request
            api_request = self._build_api_request(request)
            
            # Execute with timeout
            result = await asyncio.wait_for(
                self._call_opencode_api(api_request, request),
                timeout=request.timeout_seconds,
            )
            
            # Calculate duration
            duration_ms = int((datetime.utcnow() - start_time).total_seconds() * 1000)
            result.duration_ms = duration_ms
            
            logger.info(
                "opencode_execution_completed",
                request_id=request.request_id,
                success=result.success,
                duration_ms=duration_ms,
                tokens_used=result.tokens_used,
            )
            
            return result
            
        except asyncio.TimeoutError:
            duration_ms = int((datetime.utcnow() - start_time).total_seconds() * 1000)
            logger.error("opencode_execution_timeout", request_id=request.request_id)
            
            return OpenCodeExecutionResult(
                request_id=request.request_id,
                success=False,
                error=f"Execution timed out after {request.timeout_seconds} seconds",
                duration_ms=duration_ms,
            )
            
        except Exception as e:
            duration_ms = int((datetime.utcnow() - start_time).total_seconds() * 1000)
            logger.error("opencode_execution_error", request_id=request.request_id, error=str(e))
            
            return OpenCodeExecutionResult(
                request_id=request.request_id,
                success=False,
                error=str(e),
                duration_ms=duration_ms,
            )
    
    def _build_api_request(self, request: OpenCodeExecutionRequest) -> Dict[str, Any]:
        """Build the API request for OpenCode Gateway."""
        messages = [
            {
                "role": "system",
                "content": self._build_system_prompt(request),
            },
            {
                "role": "user",
                "content": request.prompt,
            },
        ]
        
        # Add file context if provided
        if request.files:
            file_context = self._build_file_context(request)
            if file_context:
                messages[1]["content"] += f"\n\n{file_context}"
        
        return {
            "model": request.context.get("model", self.default_model),
            "messages": messages,
            "max_tokens": request.max_tokens,
            "temperature": 0.1,  # Low temperature for code generation
            "stream": False,
        }
    
    def _build_system_prompt(self, request: OpenCodeExecutionRequest) -> str:
        """Build the system prompt for OpenCode."""
        workspace_info = ""
        if request.workspace_path or self.workspace_path:
            workspace = request.workspace_path or self.workspace_path
            workspace_info = f"\nWorkspace: {workspace}"
        
        return f"""You are an expert software engineer working on a codebase.
Your task is to implement the requested changes accurately and efficiently.
{workspace_info}

Guidelines:
1. Write clean, maintainable code following best practices
2. Include appropriate error handling
3. Add comments for complex logic
4. Follow the existing code style and patterns
5. Consider edge cases and potential issues

When modifying files, output the complete file content with clear markers:
```filepath:/path/to/file.ext
<file content here>
```

When creating new files, clearly indicate the file path.
When running commands, prefix with: `$ command`

Focus on the specific task requested and avoid unnecessary changes."""
    
    def _build_file_context(self, request: OpenCodeExecutionRequest) -> str:
        """Build file context from provided files."""
        workspace = request.workspace_path or self.workspace_path
        if not workspace:
            return ""
        
        context_parts = ["Files to focus on:"]
        
        for file_path in request.files:
            full_path = os.path.join(workspace, file_path) if not os.path.isabs(file_path) else file_path
            
            if os.path.exists(full_path):
                try:
                    with open(full_path, 'r', encoding='utf-8') as f:
                        content = f.read()
                    context_parts.append(f"\n--- {file_path} ---\n```\n{content}\n```")
                except Exception as e:
                    context_parts.append(f"\n--- {file_path} --- (Error reading: {e})")
            else:
                context_parts.append(f"\n- {file_path} (file not found)")
        
        return "\n".join(context_parts)
    
    async def _call_opencode_api(
        self,
        api_request: Dict[str, Any],
        original_request: OpenCodeExecutionRequest
    ) -> OpenCodeExecutionResult:
        """
        Call the OpenCode Gateway API.
        
        This method sends the request to SmartSpecPro's LLM Gateway,
        which handles model routing, credit management, and billing.
        """
        session = await self._get_session()
        
        url = f"{self.api_base_url}/chat/completions"
        
        try:
            async with session.post(url, json=api_request) as response:
                if response.status == 401:
                    return OpenCodeExecutionResult(
                        request_id=original_request.request_id,
                        success=False,
                        error="Authentication failed. Please check your API key.",
                    )
                
                if response.status == 402:
                    return OpenCodeExecutionResult(
                        request_id=original_request.request_id,
                        success=False,
                        error="Insufficient credits. Please add credits to continue.",
                    )
                
                if response.status != 200:
                    error_text = await response.text()
                    return OpenCodeExecutionResult(
                        request_id=original_request.request_id,
                        success=False,
                        error=f"API error ({response.status}): {error_text}",
                    )
                
                data = await response.json()
                
                # Extract response
                content = ""
                if data.get("choices"):
                    content = data["choices"][0].get("message", {}).get("content", "")
                
                # Extract usage
                usage = data.get("usage", {})
                tokens_used = usage.get("total_tokens", 0)
                
                # Parse output for file changes
                files_created, files_modified = self._parse_file_changes(
                    content, original_request
                )
                
                return OpenCodeExecutionResult(
                    request_id=original_request.request_id,
                    success=True,
                    output=content,
                    files_created=files_created,
                    files_modified=files_modified,
                    tokens_used=tokens_used,
                    model=data.get("model", api_request.get("model", "")),
                )
                
        except aiohttp.ClientError as e:
            return OpenCodeExecutionResult(
                request_id=original_request.request_id,
                success=False,
                error=f"Network error: {str(e)}",
            )
    
    def _parse_file_changes(
        self,
        content: str,
        request: OpenCodeExecutionRequest
    ) -> tuple[List[str], List[str]]:
        """Parse LLM output for file changes."""
        files_created = []
        files_modified = []
        
        # Look for file markers in the output
        # Format: ```filepath:/path/to/file.ext
        import re
        file_pattern = r'```filepath:([^\n]+)\n'
        matches = re.findall(file_pattern, content)
        
        workspace = request.workspace_path or self.workspace_path
        
        for file_path in matches:
            file_path = file_path.strip()
            if workspace:
                full_path = os.path.join(workspace, file_path) if not os.path.isabs(file_path) else file_path
                if os.path.exists(full_path):
                    files_modified.append(file_path)
                else:
                    files_created.append(file_path)
            else:
                files_created.append(file_path)
        
        return files_created, files_modified
    
    async def run_command(
        self,
        command: str,
        workspace_path: Optional[str] = None,
        timeout: int = 300,
        env: Optional[Dict[str, str]] = None,
    ) -> CommandExecutionResult:
        """
        Execute a shell command in the workspace.
        
        Args:
            command: Shell command to execute
            workspace_path: Working directory (defaults to adapter's workspace)
            timeout: Command timeout in seconds
            env: Additional environment variables
        
        Returns:
            CommandExecutionResult with stdout, stderr, and return code
        """
        cwd = workspace_path or self.workspace_path
        start_time = datetime.utcnow()
        
        logger.info(
            "opencode_command_started",
            command=command[:100],
            cwd=cwd,
        )
        
        try:
            # Prepare environment
            process_env = os.environ.copy()
            if env:
                process_env.update(env)
            
            # Run command
            process = await asyncio.create_subprocess_shell(
                command,
                stdout=asyncio.subprocess.PIPE,
                stderr=asyncio.subprocess.PIPE,
                cwd=cwd,
                env=process_env,
            )
            
            try:
                stdout, stderr = await asyncio.wait_for(
                    process.communicate(),
                    timeout=timeout,
                )
            except asyncio.TimeoutError:
                process.kill()
                await process.wait()
                duration_ms = int((datetime.utcnow() - start_time).total_seconds() * 1000)
                return CommandExecutionResult(
                    command=command,
                    stdout="",
                    stderr=f"Command timed out after {timeout} seconds",
                    return_code=-1,
                    duration_ms=duration_ms,
                    success=False,
                )
            
            duration_ms = int((datetime.utcnow() - start_time).total_seconds() * 1000)
            
            result = CommandExecutionResult(
                command=command,
                stdout=stdout.decode('utf-8', errors='replace'),
                stderr=stderr.decode('utf-8', errors='replace'),
                return_code=process.returncode,
                duration_ms=duration_ms,
                success=process.returncode == 0,
            )
            
            logger.info(
                "opencode_command_completed",
                command=command[:100],
                return_code=result.return_code,
                duration_ms=duration_ms,
            )
            
            return result
            
        except Exception as e:
            duration_ms = int((datetime.utcnow() - start_time).total_seconds() * 1000)
            logger.error("opencode_command_error", command=command[:100], error=str(e))
            
            return CommandExecutionResult(
                command=command,
                stdout="",
                stderr=str(e),
                return_code=-1,
                duration_ms=duration_ms,
                success=False,
            )
    
    async def edit_file(
        self,
        file_path: str,
        content: str,
        workspace_path: Optional[str] = None,
        create_if_missing: bool = True,
        backup: bool = True,
    ) -> Dict[str, Any]:
        """
        Edit or create a file in the workspace.
        
        Args:
            file_path: Path to the file (relative to workspace or absolute)
            content: New file content
            workspace_path: Working directory (defaults to adapter's workspace)
            create_if_missing: Create file if it doesn't exist
            backup: Create backup before modifying
        
        Returns:
            Dict with status, path, and any errors
        """
        workspace = workspace_path or self.workspace_path
        
        # Resolve full path
        if os.path.isabs(file_path):
            full_path = file_path
        elif workspace:
            full_path = os.path.join(workspace, file_path)
        else:
            return {
                "status": "error",
                "error": "No workspace path specified",
                "path": file_path,
            }
        
        logger.info(
            "opencode_file_edit_started",
            file_path=full_path,
            content_length=len(content),
        )
        
        try:
            # Check if file exists
            file_exists = os.path.exists(full_path)
            
            if not file_exists and not create_if_missing:
                return {
                    "status": "error",
                    "error": "File does not exist and create_if_missing is False",
                    "path": full_path,
                }
            
            # Create backup if file exists and backup is enabled
            backup_path = None
            if file_exists and backup:
                backup_path = f"{full_path}.backup.{datetime.utcnow().strftime('%Y%m%d_%H%M%S')}"
                with open(full_path, 'r', encoding='utf-8') as f:
                    original_content = f.read()
                with open(backup_path, 'w', encoding='utf-8') as f:
                    f.write(original_content)
            
            # Ensure directory exists
            os.makedirs(os.path.dirname(full_path), exist_ok=True)
            
            # Write content
            with open(full_path, 'w', encoding='utf-8') as f:
                f.write(content)
            
            logger.info(
                "opencode_file_edit_completed",
                file_path=full_path,
                created=not file_exists,
                backup_path=backup_path,
            )
            
            return {
                "status": "success",
                "path": full_path,
                "created": not file_exists,
                "backup_path": backup_path,
            }
            
        except Exception as e:
            logger.error("opencode_file_edit_error", file_path=full_path, error=str(e))
            return {
                "status": "error",
                "error": str(e),
                "path": full_path,
            }
    
    async def read_file(
        self,
        file_path: str,
        workspace_path: Optional[str] = None,
    ) -> Dict[str, Any]:
        """
        Read a file from the workspace.
        
        Args:
            file_path: Path to the file
            workspace_path: Working directory
        
        Returns:
            Dict with content or error
        """
        workspace = workspace_path or self.workspace_path
        
        if os.path.isabs(file_path):
            full_path = file_path
        elif workspace:
            full_path = os.path.join(workspace, file_path)
        else:
            return {
                "status": "error",
                "error": "No workspace path specified",
            }
        
        try:
            with open(full_path, 'r', encoding='utf-8') as f:
                content = f.read()
            
            return {
                "status": "success",
                "path": full_path,
                "content": content,
                "size": len(content),
            }
            
        except FileNotFoundError:
            return {
                "status": "error",
                "error": "File not found",
                "path": full_path,
            }
        except Exception as e:
            return {
                "status": "error",
                "error": str(e),
                "path": full_path,
            }
    
    async def apply_file_changes(
        self,
        execution_result: OpenCodeExecutionResult,
        workspace_path: Optional[str] = None,
    ) -> Dict[str, Any]:
        """
        Apply file changes from an execution result.
        
        Parses the output for file content and applies changes.
        
        Args:
            execution_result: Result from execute()
            workspace_path: Working directory
        
        Returns:
            Dict with applied changes summary
        """
        import re
        
        workspace = workspace_path or self.workspace_path
        if not workspace:
            return {
                "status": "error",
                "error": "No workspace path specified",
            }
        
        # Parse file blocks from output
        # Format: ```filepath:/path/to/file.ext\n<content>\n```
        pattern = r'```filepath:([^\n]+)\n(.*?)```'
        matches = re.findall(pattern, execution_result.output, re.DOTALL)
        
        applied = []
        errors = []
        
        for file_path, content in matches:
            file_path = file_path.strip()
            content = content.strip()
            
            result = await self.edit_file(
                file_path=file_path,
                content=content,
                workspace_path=workspace,
            )
            
            if result["status"] == "success":
                applied.append({
                    "path": file_path,
                    "created": result.get("created", False),
                })
            else:
                errors.append({
                    "path": file_path,
                    "error": result.get("error"),
                })
        
        return {
            "status": "success" if not errors else "partial",
            "applied": applied,
            "errors": errors,
            "total_files": len(matches),
        }
    
    async def execute_batch(
        self,
        requests: List[OpenCodeExecutionRequest],
        max_concurrent: int = 3,
    ) -> List[OpenCodeExecutionResult]:
        """
        Execute multiple tasks in OpenCode concurrently.
        
        Args:
            requests: List of execution requests
            max_concurrent: Maximum concurrent executions
            
        Returns:
            List of OpenCodeExecutionResult
        """
        semaphore = asyncio.Semaphore(max_concurrent)
        
        async def execute_with_semaphore(request: OpenCodeExecutionRequest):
            async with semaphore:
                return await self.execute(request)
        
        tasks = [execute_with_semaphore(req) for req in requests]
        results = await asyncio.gather(*tasks, return_exceptions=True)
        
        # Convert exceptions to error results
        processed_results = []
        for i, result in enumerate(results):
            if isinstance(result, Exception):
                processed_results.append(OpenCodeExecutionResult(
                    request_id=requests[i].request_id,
                    success=False,
                    error=str(result),
                ))
            else:
                processed_results.append(result)
        
        return processed_results
    
    async def check_health(self) -> Dict[str, Any]:
        """
        Check if OpenCode Gateway is healthy.
        
        Returns:
            Dict with health status
        """
        try:
            session = await self._get_session()
            url = f"{self.api_base_url}/health"
            
            async with session.get(url) as response:
                if response.status == 200:
                    data = await response.json()
                    return {
                        "status": "healthy",
                        "gateway": data,
                    }
                else:
                    return {
                        "status": "unhealthy",
                        "error": f"Gateway returned status {response.status}",
                    }
                    
        except Exception as e:
            return {
                "status": "unhealthy",
                "error": str(e),
            }
    
    async def cleanup(self):
        """Cleanup resources."""
        if self._http_session and not self._http_session.closed:
            await self._http_session.close()
            self._http_session = None
        
        logger.info("opencode_adapter_cleanup_complete")
    
    async def __aenter__(self):
        """Async context manager entry."""
        return self
    
    async def __aexit__(self, exc_type, exc_val, exc_tb):
        """Async context manager exit."""
        await self.cleanup()
