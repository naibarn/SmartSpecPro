from __future__ import annotations
import asyncio
import os
import time
import uuid
import shutil
from dataclasses import dataclass, field
from typing import Dict, Optional, List, Tuple, Any

import subprocess

IS_WINDOWS = os.name == "nt"
try:
    import pty  # POSIX only
except Exception:
    pty = None  # type: ignore


@dataclass
class PtySession:
    session_id: str
    workspace: str
    command: str
    created_at: float = field(default_factory=time.time)
    status: str = "running"  # running|completed|failed|cancelled
    returncode: Optional[int] = None

    master_fd: Optional[int] = None
    proc: Optional[subprocess.Popen] = None

    seq: int = 0
    buffer: List[Tuple[int, str]] = field(default_factory=list)
    buffer_max: int = 8000

    media_seq: int = 0
    media_buffer: List[Tuple[int, Dict[str, Any]]] = field(default_factory=list)
    media_buffer_max: int = 2000


class PtyManager:
    def __init__(self):
        self._sessions: Dict[str, PtySession] = {}
        self._lock = asyncio.Lock()

    def _get_shell(self) -> str:
        """Get the default shell for the system"""
        if IS_WINDOWS:
            return os.environ.get("COMSPEC", "cmd.exe")
        
        # Try to get user's preferred shell
        shell = os.environ.get("SHELL")
        if shell and shutil.which(shell):
            return shell
        
        # Fallback to common shells
        for sh in ["/bin/bash", "/bin/sh", "/usr/bin/bash", "/usr/bin/sh"]:
            if os.path.exists(sh):
                return sh
        
        return "sh"

    def _build_command(self, command: str) -> List[str]:
        """
        Build command arguments based on the command type.
        
        Supports:
        - Empty command: Open interactive shell
        - Shell commands: Execute via shell
        - Workflow files (*.md): Execute via ss_autopilot if available
        """
        shell = self._get_shell()
        
        # Empty command - open interactive shell
        if not command or command.strip() == "":
            if IS_WINDOWS:
                return [shell]
            return [shell, "-i"]
        
        command = command.strip()
        
        # Check if it's a workflow file (for ss_autopilot)
        if command.endswith(".md"):
            # Check if ss_autopilot is available
            try:
                result = subprocess.run(
                    ["python", "-c", "import ss_autopilot"],
                    capture_output=True,
                    timeout=5
                )
                if result.returncode == 0:
                    return ["python", "-m", "ss_autopilot.cli_enhanced", command]
            except Exception:
                pass
            # Fallback: just cat the file
            return [shell, "-c", f"cat {command}"]
        
        # Regular shell command
        if IS_WINDOWS:
            return [shell, "/c", command]
        return [shell, "-c", command]

    async def create(self, workspace: str, command: str) -> PtySession:
        """
        Create a new PTY session.
        
        Args:
            workspace: Working directory for the session
            command: Command to execute (empty for interactive shell)
        
        Returns:
            PtySession object
        """
        sid = uuid.uuid4().hex
        sess = PtySession(session_id=sid, workspace=workspace, command=command)

        # Validate workspace
        if workspace and not os.path.isdir(workspace):
            # Create workspace if it doesn't exist
            try:
                os.makedirs(workspace, exist_ok=True)
            except Exception:
                workspace = os.path.expanduser("~")
        
        if not workspace:
            workspace = os.path.expanduser("~")

        argv = self._build_command(command)
        env = dict(os.environ)
        env["CI"] = "0"
        env["TERM"] = "xterm-256color"
        env["COLORTERM"] = "truecolor"

        if (not IS_WINDOWS) and pty is not None:
            master_fd, slave_fd = pty.openpty()
            
            # Set terminal size
            try:
                import fcntl
                import struct
                import termios
                # Default size: 24 rows, 80 cols
                winsize = struct.pack("HHHH", 24, 80, 0, 0)
                fcntl.ioctl(slave_fd, termios.TIOCSWINSZ, winsize)
            except Exception:
                pass
            
            proc = subprocess.Popen(
                argv,
                cwd=workspace,
                env=env,
                stdin=slave_fd,
                stdout=slave_fd,
                stderr=slave_fd,
                close_fds=True,
            )
            os.close(slave_fd)
            sess.master_fd = master_fd
            sess.proc = proc
        else:
            # Windows/fallback
            proc = subprocess.Popen(
                argv,
                cwd=workspace,
                env=env,
                stdin=subprocess.PIPE,
                stdout=subprocess.PIPE,
                stderr=subprocess.STDOUT,
                text=True,
                bufsize=1,
                universal_newlines=True,
            )
            sess.proc = proc

        async with self._lock:
            self._sessions[sid] = sess

        asyncio.create_task(self._reader_loop(sid))
        return sess

    async def get(self, sid: str) -> Optional[PtySession]:
        async with self._lock:
            return self._sessions.get(sid)

    async def list_sessions(self) -> List[Dict[str, Any]]:
        """List all active sessions"""
        async with self._lock:
            return [
                {
                    "session_id": s.session_id,
                    "workspace": s.workspace,
                    "command": s.command,
                    "status": s.status,
                    "created_at": s.created_at,
                    "returncode": s.returncode
                }
                for s in self._sessions.values()
            ]

    async def cancel(self, sid: str) -> bool:
        s = await self.get(sid)
        if not s or not s.proc or s.status != "running":
            return False
        s.status = "cancelled"
        try:
            s.proc.terminate()
            return True
        except Exception:
            return False

    async def kill(self, sid: str) -> bool:
        """Force kill a session"""
        s = await self.get(sid)
        if not s or not s.proc:
            return False
        try:
            s.proc.kill()
            s.status = "killed"
            return True
        except Exception:
            return False

    async def write(self, sid: str, data: str) -> bool:
        s = await self.get(sid)
        if not s or not s.proc or s.status != "running":
            return False
        if (not IS_WINDOWS) and s.master_fd is not None:
            try:
                os.write(s.master_fd, data.encode("utf-8"))
                return True
            except Exception:
                return False
        if s.proc.stdin is None:
            return False
        try:
            s.proc.stdin.write(data)
            s.proc.stdin.flush()
            return True
        except Exception:
            return False

    async def resize(self, sid: str, rows: int, cols: int) -> bool:
        """Resize the terminal"""
        s = await self.get(sid)
        if not s or s.master_fd is None:
            return False
        
        if IS_WINDOWS:
            return False
        
        try:
            import fcntl
            import struct
            import termios
            winsize = struct.pack("HHHH", rows, cols, 0, 0)
            fcntl.ioctl(s.master_fd, termios.TIOCSWINSZ, winsize)
            return True
        except Exception:
            return False

    async def send_signal(self, sid: str, sig: int) -> bool:
        s = await self.get(sid)
        if not s or not s.proc or s.status != "running":
            return False
        try:
            s.proc.send_signal(sig)
            return True
        except Exception:
            return False

    async def append_media_event(self, sid: str, event: Dict[str, Any]) -> Optional[int]:
        s = await self.get(sid)
        if not s:
            return None
        s.media_seq += 1
        s.media_buffer.append((s.media_seq, event))
        if len(s.media_buffer) > s.media_buffer_max:
            s.media_buffer = s.media_buffer[-s.media_buffer_max:]
        return s.media_seq

    async def buffer_since(self, sid: str, since_seq: int) -> List[Tuple[int, str]]:
        s = await self.get(sid)
        if not s:
            return []
        return [(seq, line) for (seq, line) in s.buffer if seq > since_seq]

    async def media_since(self, sid: str, since_seq: int) -> List[Tuple[int, Dict[str, Any]]]:
        s = await self.get(sid)
        if not s:
            return []
        return [(seq, ev) for (seq, ev) in s.media_buffer if seq > since_seq]

    async def cleanup_session(self, sid: str) -> bool:
        """Remove a completed/cancelled session from memory"""
        async with self._lock:
            if sid in self._sessions:
                s = self._sessions[sid]
                if s.status in ("completed", "failed", "cancelled", "killed"):
                    # Close master_fd if open
                    if s.master_fd is not None:
                        try:
                            os.close(s.master_fd)
                        except Exception:
                            pass
                    del self._sessions[sid]
                    return True
        return False

    async def _reader_loop(self, sid: str):
        s = await self.get(sid)
        if not s or not s.proc:
            return

        if (not IS_WINDOWS) and s.master_fd is not None:
            loop = asyncio.get_event_loop()
            while True:
                await asyncio.sleep(0)
                try:
                    chunk = await loop.run_in_executor(None, os.read, s.master_fd, 4096)
                except Exception:
                    chunk = b""
                if not chunk:
                    break
                text = chunk.decode("utf-8", errors="ignore")
                s.seq += 1
                s.buffer.append((s.seq, text))
                if len(s.buffer) > s.buffer_max:
                    s.buffer = s.buffer[-s.buffer_max:]
            s.proc.wait()
        else:
            assert s.proc.stdout is not None
            for line in s.proc.stdout:
                s.seq += 1
                s.buffer.append((s.seq, line))
                if len(s.buffer) > s.buffer_max:
                    s.buffer = s.buffer[-s.buffer_max:]
            s.proc.wait()

        s.returncode = s.proc.returncode
        if s.status == "running":
            s.status = "completed" if (s.proc.returncode == 0) else "failed"


PTY_MANAGER = PtyManager()
