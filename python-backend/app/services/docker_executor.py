"""
SmartSpec Pro - Docker Executor
Enables execution of commands inside Docker containers for Kilo Code CLI integration.

Supports two approaches:
- Approach A: Kilo runs on host, commands execute in Docker
- Approach B: Everything runs inside Docker container
"""

import asyncio
import json
import os
import shutil
from dataclasses import dataclass, field
from enum import Enum
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple

import structlog

logger = structlog.get_logger()


class DockerExecutionMode(str, Enum):
    """Docker execution mode."""
    HOST = "host"  # Run commands directly on host
    DOCKER = "docker"  # Run commands inside Docker container
    AUTO = "auto"  # Auto-detect based on environment


@dataclass
class DockerConfig:
    """Configuration for Docker execution."""
    # Container settings
    container_name: str = "smartspec-dev"
    image_name: str = "smartspec-dev:latest"
    
    # Execution settings
    mode: DockerExecutionMode = DockerExecutionMode.AUTO
    user: str = "devuser"
    workdir: str = "/workspace"
    
    # Path mapping (host_path -> container_path)
    path_mappings: Dict[str, str] = field(default_factory=dict)
    
    # Environment variables to pass
    environment: Dict[str, str] = field(default_factory=dict)
    
    # Timeout settings
    default_timeout: int = 300
    startup_timeout: int = 60
    
    # Docker command
    docker_cmd: str = "docker"
    
    def __post_init__(self):
        # Set default path mapping if not provided
        if not self.path_mappings:
            # Try to detect project root
            project_root = os.environ.get("SMARTSPEC_PROJECT_ROOT", "/home/ubuntu/SmartSpec")
            self.path_mappings = {
                project_root: self.workdir,
            }


class DockerExecutor:
    """
    Executes commands inside Docker containers.
    
    This class provides a unified interface for running commands either
    directly on the host or inside a Docker container, enabling consistent
    development environments that match production.
    """
    
    def __init__(self, config: Optional[DockerConfig] = None):
        """
        Initialize the Docker executor.
        
        Args:
            config: Docker configuration
        """
        self.config = config or DockerConfig()
        self._docker_available: Optional[bool] = None
        self._container_running: Optional[bool] = None
        self._effective_mode: Optional[DockerExecutionMode] = None
        
        logger.info(
            "Docker executor initialized",
            container=self.config.container_name,
            mode=self.config.mode.value,
        )
    
    async def check_docker_available(self) -> bool:
        """
        Check if Docker is available on the system.
        
        Returns:
            True if Docker is available
        """
        if self._docker_available is not None:
            return self._docker_available
        
        try:
            process = await asyncio.create_subprocess_exec(
                self.config.docker_cmd, "--version",
                stdout=asyncio.subprocess.PIPE,
                stderr=asyncio.subprocess.PIPE,
            )
            stdout, _ = await asyncio.wait_for(
                process.communicate(),
                timeout=10,
            )
            
            self._docker_available = process.returncode == 0
            
            if self._docker_available:
                version = stdout.decode().strip()
                logger.info("Docker available", version=version)
            
            return self._docker_available
        except Exception as e:
            logger.warning("Docker not available", error=str(e))
            self._docker_available = False
            return False
    
    async def check_container_running(self) -> bool:
        """
        Check if the target container is running.
        
        Returns:
            True if container is running
        """
        if not await self.check_docker_available():
            return False
        
        try:
            process = await asyncio.create_subprocess_exec(
                self.config.docker_cmd, "ps",
                "--filter", f"name={self.config.container_name}",
                "--filter", "status=running",
                "--format", "{{.Names}}",
                stdout=asyncio.subprocess.PIPE,
                stderr=asyncio.subprocess.PIPE,
            )
            stdout, _ = await asyncio.wait_for(
                process.communicate(),
                timeout=10,
            )
            
            running_containers = stdout.decode().strip().split("\n")
            self._container_running = self.config.container_name in running_containers
            
            if self._container_running:
                logger.info("Container running", container=self.config.container_name)
            else:
                logger.warning("Container not running", container=self.config.container_name)
            
            return self._container_running
        except Exception as e:
            logger.error("Error checking container", error=str(e))
            self._container_running = False
            return False
    
    async def start_container(self) -> bool:
        """
        Start the development container if not running.
        
        Returns:
            True if container is now running
        """
        if await self.check_container_running():
            return True
        
        logger.info("Starting container", container=self.config.container_name)
        
        try:
            # Try to start existing container first
            process = await asyncio.create_subprocess_exec(
                self.config.docker_cmd, "start", self.config.container_name,
                stdout=asyncio.subprocess.PIPE,
                stderr=asyncio.subprocess.PIPE,
            )
            _, stderr = await asyncio.wait_for(
                process.communicate(),
                timeout=self.config.startup_timeout,
            )
            
            if process.returncode == 0:
                self._container_running = True
                logger.info("Container started", container=self.config.container_name)
                return True
            
            logger.warning(
                "Failed to start container",
                error=stderr.decode().strip(),
            )
            return False
        except Exception as e:
            logger.error("Error starting container", error=str(e))
            return False
    
    async def get_effective_mode(self) -> DockerExecutionMode:
        """
        Determine the effective execution mode.
        
        Returns:
            The effective DockerExecutionMode
        """
        if self._effective_mode is not None:
            return self._effective_mode
        
        if self.config.mode == DockerExecutionMode.HOST:
            self._effective_mode = DockerExecutionMode.HOST
        elif self.config.mode == DockerExecutionMode.DOCKER:
            self._effective_mode = DockerExecutionMode.DOCKER
        else:
            # Auto-detect
            # Check if we're already inside a container
            if self._is_inside_container():
                self._effective_mode = DockerExecutionMode.HOST
                logger.info("Running inside container, using HOST mode")
            elif await self.check_container_running():
                self._effective_mode = DockerExecutionMode.DOCKER
                logger.info("Container available, using DOCKER mode")
            else:
                self._effective_mode = DockerExecutionMode.HOST
                logger.info("No container available, using HOST mode")
        
        return self._effective_mode
    
    def _is_inside_container(self) -> bool:
        """Check if we're running inside a Docker container."""
        # Check for .dockerenv file
        if os.path.exists("/.dockerenv"):
            return True
        
        # Check cgroup
        try:
            with open("/proc/1/cgroup", "r") as f:
                return "docker" in f.read()
        except Exception:
            pass
        
        return False
    
    def translate_path(self, host_path: str) -> str:
        """
        Translate a host path to container path.
        
        Args:
            host_path: Path on the host system
        
        Returns:
            Corresponding path inside the container
        """
        host_path = os.path.abspath(host_path)
        
        for host_prefix, container_prefix in self.config.path_mappings.items():
            host_prefix = os.path.abspath(host_prefix)
            if host_path.startswith(host_prefix):
                relative = os.path.relpath(host_path, host_prefix)
                return os.path.join(container_prefix, relative)
        
        # No mapping found, return original
        return host_path
    
    def translate_path_reverse(self, container_path: str) -> str:
        """
        Translate a container path to host path.
        
        Args:
            container_path: Path inside the container
        
        Returns:
            Corresponding path on the host system
        """
        for host_prefix, container_prefix in self.config.path_mappings.items():
            if container_path.startswith(container_prefix):
                relative = os.path.relpath(container_path, container_prefix)
                return os.path.join(host_prefix, relative)
        
        # No mapping found, return original
        return container_path
    
    async def execute(
        self,
        command: List[str],
        cwd: Optional[str] = None,
        env: Optional[Dict[str, str]] = None,
        timeout: Optional[int] = None,
        user: Optional[str] = None,
        capture_output: bool = True,
    ) -> Tuple[int, str, str]:
        """
        Execute a command, either on host or in Docker container.
        
        Args:
            command: Command and arguments to execute
            cwd: Working directory
            env: Additional environment variables
            timeout: Execution timeout in seconds
            user: User to run as (Docker only)
            capture_output: Whether to capture stdout/stderr
        
        Returns:
            Tuple of (exit_code, stdout, stderr)
        """
        effective_mode = await self.get_effective_mode()
        
        if effective_mode == DockerExecutionMode.DOCKER:
            return await self._execute_in_docker(
                command, cwd, env, timeout, user, capture_output
            )
        else:
            return await self._execute_on_host(
                command, cwd, env, timeout, capture_output
            )
    
    async def _execute_on_host(
        self,
        command: List[str],
        cwd: Optional[str] = None,
        env: Optional[Dict[str, str]] = None,
        timeout: Optional[int] = None,
        capture_output: bool = True,
    ) -> Tuple[int, str, str]:
        """Execute command directly on host."""
        exec_timeout = timeout or self.config.default_timeout
        
        # Merge environment
        exec_env = os.environ.copy()
        exec_env.update(self.config.environment)
        if env:
            exec_env.update(env)
        
        logger.debug(
            "Executing on host",
            command=command,
            cwd=cwd,
        )
        
        try:
            if capture_output:
                process = await asyncio.create_subprocess_exec(
                    *command,
                    stdout=asyncio.subprocess.PIPE,
                    stderr=asyncio.subprocess.PIPE,
                    cwd=cwd,
                    env=exec_env,
                )
                stdout, stderr = await asyncio.wait_for(
                    process.communicate(),
                    timeout=exec_timeout,
                )
                return process.returncode, stdout.decode(), stderr.decode()
            else:
                process = await asyncio.create_subprocess_exec(
                    *command,
                    cwd=cwd,
                    env=exec_env,
                )
                await asyncio.wait_for(process.wait(), timeout=exec_timeout)
                return process.returncode, "", ""
        except asyncio.TimeoutError:
            if process:
                process.kill()
            return 124, "", "Command timed out"
        except Exception as e:
            return 1, "", str(e)
    
    async def _execute_in_docker(
        self,
        command: List[str],
        cwd: Optional[str] = None,
        env: Optional[Dict[str, str]] = None,
        timeout: Optional[int] = None,
        user: Optional[str] = None,
        capture_output: bool = True,
    ) -> Tuple[int, str, str]:
        """Execute command inside Docker container."""
        exec_timeout = timeout or self.config.default_timeout
        exec_user = user or self.config.user
        
        # Translate working directory
        if cwd:
            exec_cwd = self.translate_path(cwd)
        else:
            exec_cwd = self.config.workdir
        
        # Build docker exec command
        docker_cmd = [
            self.config.docker_cmd, "exec",
            "--user", exec_user,
            "--workdir", exec_cwd,
        ]
        
        # Add environment variables
        all_env = {**self.config.environment}
        if env:
            all_env.update(env)
        
        for key, value in all_env.items():
            docker_cmd.extend(["-e", f"{key}={value}"])
        
        # Add container name
        docker_cmd.append(self.config.container_name)
        
        # Wrap command in bash for proper environment
        # This ensures PATH and other env vars are loaded
        cmd_str = " ".join(f'"{arg}"' if " " in arg else arg for arg in command)
        docker_cmd.extend(["bash", "-lc", cmd_str])
        
        logger.debug(
            "Executing in Docker",
            container=self.config.container_name,
            command=command,
            cwd=exec_cwd,
        )
        
        try:
            if capture_output:
                process = await asyncio.create_subprocess_exec(
                    *docker_cmd,
                    stdout=asyncio.subprocess.PIPE,
                    stderr=asyncio.subprocess.PIPE,
                )
                stdout, stderr = await asyncio.wait_for(
                    process.communicate(),
                    timeout=exec_timeout,
                )
                return process.returncode, stdout.decode(), stderr.decode()
            else:
                process = await asyncio.create_subprocess_exec(*docker_cmd)
                await asyncio.wait_for(process.wait(), timeout=exec_timeout)
                return process.returncode, "", ""
        except asyncio.TimeoutError:
            if process:
                process.kill()
            return 124, "", "Command timed out"
        except Exception as e:
            return 1, "", str(e)
    
    async def execute_shell(
        self,
        script: str,
        cwd: Optional[str] = None,
        env: Optional[Dict[str, str]] = None,
        timeout: Optional[int] = None,
    ) -> Tuple[int, str, str]:
        """
        Execute a shell script.
        
        Args:
            script: Shell script content
            cwd: Working directory
            env: Additional environment variables
            timeout: Execution timeout in seconds
        
        Returns:
            Tuple of (exit_code, stdout, stderr)
        """
        return await self.execute(
            ["bash", "-c", script],
            cwd=cwd,
            env=env,
            timeout=timeout,
        )
    
    async def copy_to_container(
        self,
        src: str,
        dest: str,
    ) -> bool:
        """
        Copy a file from host to container.
        
        Args:
            src: Source path on host
            dest: Destination path in container
        
        Returns:
            True if successful
        """
        effective_mode = await self.get_effective_mode()
        
        if effective_mode == DockerExecutionMode.HOST:
            # Direct copy
            try:
                shutil.copy2(src, dest)
                return True
            except Exception as e:
                logger.error("Copy failed", error=str(e))
                return False
        
        try:
            process = await asyncio.create_subprocess_exec(
                self.config.docker_cmd, "cp",
                src, f"{self.config.container_name}:{dest}",
                stdout=asyncio.subprocess.PIPE,
                stderr=asyncio.subprocess.PIPE,
            )
            _, stderr = await process.communicate()
            
            if process.returncode != 0:
                logger.error("Docker cp failed", error=stderr.decode())
                return False
            
            return True
        except Exception as e:
            logger.error("Copy to container failed", error=str(e))
            return False
    
    async def copy_from_container(
        self,
        src: str,
        dest: str,
    ) -> bool:
        """
        Copy a file from container to host.
        
        Args:
            src: Source path in container
            dest: Destination path on host
        
        Returns:
            True if successful
        """
        effective_mode = await self.get_effective_mode()
        
        if effective_mode == DockerExecutionMode.HOST:
            # Direct copy
            try:
                shutil.copy2(src, dest)
                return True
            except Exception as e:
                logger.error("Copy failed", error=str(e))
                return False
        
        try:
            process = await asyncio.create_subprocess_exec(
                self.config.docker_cmd, "cp",
                f"{self.config.container_name}:{src}", dest,
                stdout=asyncio.subprocess.PIPE,
                stderr=asyncio.subprocess.PIPE,
            )
            _, stderr = await process.communicate()
            
            if process.returncode != 0:
                logger.error("Docker cp failed", error=stderr.decode())
                return False
            
            return True
        except Exception as e:
            logger.error("Copy from container failed", error=str(e))
            return False


# Singleton instance
_docker_executor: Optional[DockerExecutor] = None


def get_docker_executor(config: Optional[DockerConfig] = None) -> DockerExecutor:
    """Get or create the Docker executor singleton."""
    global _docker_executor
    
    if _docker_executor is None:
        _docker_executor = DockerExecutor(config)
    
    return _docker_executor
