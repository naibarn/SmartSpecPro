from __future__ import annotations
import asyncio
import os
import time
import uuid
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

    async def create(self, workspace: str, command: str) -> PtySession:
        sid = uuid.uuid4().hex
        sess = PtySession(session_id=sid, workspace=workspace, command=command)

        if (not IS_WINDOWS) and pty is not None:
            master_fd, slave_fd = pty.openpty()
            argv = ["python", "-m", "ss_autopilot.cli_enhanced", command]
            env = dict(os.environ)
            env["CI"] = "0"
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
            argv = ["python", "-m", "ss_autopilot.cli_enhanced", command]
            env = dict(os.environ)
            env["CI"] = "0"
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
