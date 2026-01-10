from __future__ import annotations
import asyncio
import os
import time
import uuid
import shutil
import select
from dataclasses import dataclass, field
from typing import Dict, Optional, List, Tuple, Any, Callable, Set

import subprocess

IS_WINDOWS = os.name == "nt"
try:
    import pty  # POSIX only
    import fcntl
    import struct
    import termios
except Exception:
    pty = None  # type: ignore
    fcntl = None
    struct = None
    termios = None


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
    
    # Subscribers for real-time output
    subscribers: Set[Callable[[int, str], None]] = field(default_factory=set)


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
        """
        shell = self._get_shell()
        
        # Empty command - open interactive shell
        if not command or command.strip() == "":
            if IS_WINDOWS:
                return [shell]
            # Use login shell for better environment
            return [shell, "-l"]
        
        command = command.strip()
        
        # Check if it's a workflow file (for ss_autopilot)
        if command.endswith(".md"):
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
            return [shell, "-c", f"cat {command}"]
        
        # Regular shell command
        if IS_WINDOWS:
            return [shell, "/c", command]
        return [shell, "-c", command]

    def _set_nonblocking(self, fd: int):
        """Set file descriptor to non-blocking mode"""
        if fcntl is None:
            return
        flags = fcntl.fcntl(fd, fcntl.F_GETFL)
        fcntl.fcntl(fd, fcntl.F_SETFL, flags | os.O_NONBLOCK)

    async def create(self, workspace: str, command: str) -> PtySession:
        """Create a new PTY session."""
        sid = uuid.uuid4().hex
        sess = PtySession(session_id=sid, workspace=workspace, command=command)

        # Validate workspace
        if workspace and not os.path.isdir(workspace):
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
        env["LANG"] = env.get("LANG", "en_US.UTF-8")
        env["LC_ALL"] = env.get("LC_ALL", "en_US.UTF-8")
        # Force color output
        env["CLICOLOR"] = "1"
        env["CLICOLOR_FORCE"] = "1"

        if (not IS_WINDOWS) and pty is not None:
            master_fd, slave_fd = pty.openpty()
            
            # Set terminal size
            if termios and struct and fcntl:
                try:
                    winsize = struct.pack("HHHH", 30, 120, 0, 0)
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
                start_new_session=True,
            )
            os.close(slave_fd)
            
            # Set master to non-blocking
            self._set_nonblocking(master_fd)
            
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
                bufsize=0,
            )
            sess.proc = proc

        async with self._lock:
            self._sessions[sid] = sess

        # Start reader loop
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
            except Exception as e:
                print(f"PTY write error: {e}")
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
        
        if IS_WINDOWS or termios is None or struct is None or fcntl is None:
            return False
        
        try:
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

    def subscribe(self, sid: str, callback: Callable[[int, str], None]) -> bool:
        """Subscribe to real-time output from a session"""
        if sid not in self._sessions:
            return False
        self._sessions[sid].subscribers.add(callback)
        return True

    def unsubscribe(self, sid: str, callback: Callable[[int, str], None]) -> bool:
        """Unsubscribe from session output"""
        if sid not in self._sessions:
            return False
        self._sessions[sid].subscribers.discard(callback)
        return True

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
                    if s.master_fd is not None:
                        try:
                            os.close(s.master_fd)
                        except Exception:
                            pass
                    del self._sessions[sid]
                    return True
        return False

    def _notify_subscribers(self, s: PtySession, seq: int, data: str):
        """Notify all subscribers of new output"""
        for callback in list(s.subscribers):
            try:
                callback(seq, data)
            except Exception:
                s.subscribers.discard(callback)

    async def _reader_loop(self, sid: str):
        """Read output from PTY and buffer it"""
        s = await self.get(sid)
        if not s or not s.proc:
            return

        if (not IS_WINDOWS) and s.master_fd is not None:
            loop = asyncio.get_event_loop()
            
            while s.status == "running":
                # Check if process is still running
                if s.proc.poll() is not None:
                    break
                
                try:
                    # Use select to check if data is available
                    readable, _, _ = select.select([s.master_fd], [], [], 0.1)
                    
                    if readable:
                        try:
                            chunk = os.read(s.master_fd, 4096)
                            if chunk:
                                text = chunk.decode("utf-8", errors="replace")
                                s.seq += 1
                                s.buffer.append((s.seq, text))
                                if len(s.buffer) > s.buffer_max:
                                    s.buffer = s.buffer[-s.buffer_max:]
                                # Notify subscribers
                                self._notify_subscribers(s, s.seq, text)
                        except OSError as e:
                            if e.errno == 5:  # Input/output error - PTY closed
                                break
                            raise
                    else:
                        # No data available, yield to other tasks
                        await asyncio.sleep(0.05)
                        
                except Exception as e:
                    print(f"PTY reader error: {e}")
                    break
            
            # Wait for process to finish
            try:
                s.proc.wait(timeout=1)
            except Exception:
                pass
        else:
            # Windows/fallback - line-based reading
            if s.proc.stdout:
                for line in s.proc.stdout:
                    s.seq += 1
                    s.buffer.append((s.seq, line))
                    if len(s.buffer) > s.buffer_max:
                        s.buffer = s.buffer[-s.buffer_max:]
                    self._notify_subscribers(s, s.seq, line)
            s.proc.wait()

        s.returncode = s.proc.returncode
        if s.status == "running":
            s.status = "completed" if (s.proc.returncode == 0) else "failed"


PTY_MANAGER = PtyManager()
