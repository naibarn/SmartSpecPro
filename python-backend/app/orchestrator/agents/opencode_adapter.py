"""
SmartSpec Pro - OpenCode Adapter
Phase 1.2: OpenCode Integration

Adapter layer between Supervisor Agent and OpenCode CLI.
Provides a clean interface for the Supervisor to interact with OpenCode
for micro-level implementation tasks.
"""

import asyncio
import json
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
        }


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
    """
    
    def __init__(
        self,
        api_base_url: str = "http://localhost:8000/v1",
        api_key: Optional[str] = None,
    ):
        """Initialize the OpenCode Adapter."""
        self.api_base_url = api_base_url
        self.api_key = api_key
        self._http_client = None
        
        logger.info("opencode_adapter_initialized", api_base_url=api_base_url)
    
    async def execute(self, request: OpenCodeExecutionRequest) -> OpenCodeExecutionResult:
        """
        Execute a task in OpenCode.
        
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
                self._call_opencode_api(api_request),
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
        """Build the API request for OpenCode."""
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
            file_context = f"\n\nFiles to focus on:\n" + "\n".join(f"- {f}" for f in request.files)
            messages[1]["content"] += file_context
        
        return {
            "model": request.context.get("model", "claude-3.5-sonnet"),
            "messages": messages,
            "max_tokens": request.max_tokens,
            "temperature": 0.1,  # Low temperature for code generation
            "metadata": {
                "request_id": request.request_id,
                "project_id": request.project_id,
                "user_id": request.user_id,
            },
        }
    
    def _build_system_prompt(self, request: OpenCodeExecutionRequest) -> str:
        """Build the system prompt for OpenCode."""
        return """You are an expert software engineer working on a codebase.
Your task is to implement the requested changes accurately and efficiently.

Guidelines:
1. Write clean, maintainable code following best practices
2. Include appropriate error handling
3. Add comments for complex logic
4. Follow the existing code style and patterns
5. Consider edge cases and potential issues

When modifying files, output the complete file content.
When creating new files, clearly indicate the file path.

Focus on the specific task requested and avoid unnecessary changes."""
    
    async def _call_opencode_api(self, api_request: Dict[str, Any]) -> OpenCodeExecutionResult:
        """
        Call the OpenCode API.
        
        Note: This is a placeholder implementation.
        The actual API call will be implemented when the OpenCode Gateway is ready.
        """
        # TODO: Implement actual API call when Gateway is ready
        # For now, return a mock response
        
        await asyncio.sleep(0.1)  # Simulate API latency
        
        return OpenCodeExecutionResult(
            request_id=api_request.get("metadata", {}).get("request_id", ""),
            success=True,
            output="[OpenCode Integration Pending]\n\nThis is a placeholder response. "
                   "The actual OpenCode API integration will be implemented in Phase 1.2 "
                   "when the API Gateway is ready.",
            files_created=[],
            files_modified=[],
            tokens_used=100,
            cost=0.001,
        )
    
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
    
    async def check_health(self) -> bool:
        """Check if OpenCode API is healthy."""
        try:
            # TODO: Implement actual health check
            return True
        except Exception:
            return False
    
    async def cleanup(self):
        """Cleanup resources."""
        if self._http_client:
            await self._http_client.close()
            self._http_client = None
        
        logger.info("opencode_adapter_cleanup_complete")
