from __future__ import annotations
import os
import shlex
import subprocess
import threading
import time
import uuid
from dataclasses import dataclass, field
from queue import Queue, Empty
from typing import Dict, Optional, List, Tuple

SAFE_PREFIXES = ("/",)
DISALLOWED_TOKENS = [";", "|", "&", "`", "$(", "${", ">", "<"]
DEFAULT_WORKFLOW = "/smartspec_project_copilot.md"

def _validate_command(cmd: str) -> str:
    """
    Validate and normalize command.
    Supports both:
    1. Workflow commands: /workflow_name args
    2. Natural language: any question/command (routes to default copilot)

    Returns normalized command.
    """
    c = cmd.strip()

    # Check for disallowed tokens first (security)
    for bad in DISALLOWED_TOKENS:
        if bad in c:
            raise ValueError(f"disallowed_token:{bad}")

    # If starts with /, treat as workflow command
    if c.startswith(SAFE_PREFIXES):
        # Auto-add .md extension if missing
        parts = c.split(maxsplit=1)
        first = parts[0]
        rest = parts[1] if len(parts) > 1 else ""

        if not first.endswith(".md"):
            first = first + ".md"
            c = first + (" " + rest if rest else "")

        return c

    # Otherwise, treat as natural language and route to default copilot
    # Wrap the entire input as an argument to the copilot
    return f'{DEFAULT_WORKFLOW} "{c}"'

@dataclass
class Job:
    job_id: str
    command: str
    cwd: str
    created_at: float = field(default_factory=time.time)
    status: str = "running"  # running|completed|failed|cancelled
    returncode: Optional[int] = None

    _proc: Optional[subprocess.Popen] = None
    _q: Queue[Tuple[int, str]] = field(default_factory=Queue)
    _done: threading.Event = field(default_factory=threading.Event)
    _stdin_lock: threading.Lock = field(default_factory=threading.Lock)

    # ring buffer for reconnect/resume streaming
    _seq: int = 0
    _buffer: List[Tuple[int, str]] = field(default_factory=list)
    _buffer_max: int = 5000  # lines

class JobManager:
    def __init__(self):
        self._jobs: Dict[str, Job] = {}
        self._lock = threading.Lock()

    def start(self, command: str, cwd: str) -> Job:
        # Validate and normalize command (auto-adds .md extension)
        normalized_command = _validate_command(command)
        job_id = uuid.uuid4().hex
        job = Job(job_id=job_id, command=normalized_command, cwd=cwd)

        # Build command: run as Python module with proper PYTHONPATH
        # This is needed because cli_enhanced.py uses relative imports
        python_exe = "python3"
        # Split command into arguments using shlex to properly handle quoted strings and spaces
        command_args = shlex.split(normalized_command)
        # Use -u flag to unbuffer Python output so we get real-time streaming
        argv = [python_exe, "-u", "-m", "ss_autopilot.cli_enhanced"] + command_args

        env = dict(os.environ)
        env["CI"] = "1"

        # CRITICAL: Add .smartspec directory to PYTHONPATH so "ss_autopilot" package can be found
        smartspec_dir = os.path.join(cwd, ".smartspec")
        existing_pythonpath = env.get("PYTHONPATH", "")
        if existing_pythonpath:
            env["PYTHONPATH"] = smartspec_dir + os.pathsep + existing_pythonpath
        else:
            env["PYTHONPATH"] = smartspec_dir

        proc = subprocess.Popen(
            argv,
            cwd=cwd,
            env=env,
            stdin=subprocess.PIPE,
            stdout=subprocess.PIPE,
            stderr=subprocess.STDOUT,
            text=True,
            bufsize=1,
            universal_newlines=True,
        )
        job._proc = proc

        def reader():
            try:
                assert proc.stdout is not None
                for line in proc.stdout:
                    with self._lock:
                        job._seq += 1
                        item = (job._seq, line)
                        job._buffer.append(item)
                        if len(job._buffer) > job._buffer_max:
                            job._buffer = job._buffer[-job._buffer_max:]
                    job._q.put(item)
            finally:
                proc.wait()
                job.returncode = proc.returncode
                if job.status == "running":
                    job.status = "completed" if proc.returncode == 0 else "failed"
                job._done.set()

        threading.Thread(target=reader, daemon=True).start()

        with self._lock:
            self._jobs[job_id] = job
        return job

    def get(self, job_id: str) -> Optional[Job]:
        with self._lock:
            return self._jobs.get(job_id)

    def cancel(self, job_id: str) -> bool:
        job = self.get(job_id)
        if not job or not job._proc or job.status != "running":
            return False
        job.status = "cancelled"
        try:
            job._proc.terminate()
            return True
        except Exception:
            return False

    def send_input(self, job_id: str, text: str) -> bool:
        job = self.get(job_id)
        if not job or not job._proc or job.status != "running":
            return False
        if job._proc.stdin is None:
            return False
        try:
            with job._stdin_lock:
                job._proc.stdin.write(text + "\n")
                job._proc.stdin.flush()
            return True
        except Exception:
            return False

    def pop_output(self, job_id: str, timeout: float = 0.1) -> List[Tuple[int, str]]:
        job = self.get(job_id)
        if not job:
            return []
        out: List[Tuple[int, str]] = []
        while True:
            try:
                out.append(job._q.get(timeout=timeout))
                timeout = 0.0
            except Empty:
                break
        return out

    def buffer_since(self, job_id: str, since_seq: int) -> List[Tuple[int, str]]:
        job = self.get(job_id)
        if not job:
            return []
        with self._lock:
            return [(s, l) for (s, l) in job._buffer if s > since_seq]

JOB_MANAGER = JobManager()
