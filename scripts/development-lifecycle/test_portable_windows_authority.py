"""Native OS tests for the file locks and process identities used by authority."""

from __future__ import annotations

import importlib.util
import os
import subprocess
import sys
import tempfile
import time
import unittest
from pathlib import Path
from unittest.mock import patch

ROOT = Path(__file__).parent


def load_module(name: str, filename: str):
    spec = importlib.util.spec_from_file_location(name, ROOT / filename)
    if spec is None or spec.loader is None:
        raise ImportError(filename)
    module = importlib.util.module_from_spec(spec)
    sys.modules[name] = module
    spec.loader.exec_module(module)
    return module


locks = load_module("portable_file_lock_test", "portable_file_lock.py")
authority = load_module("windows_authority_test", "workspace_authority.py")


class PortableWindowsAuthorityTests(unittest.TestCase):
    @unittest.skipUnless(os.name == "posix", "POSIX-only flock descriptor cleanup")
    def test_posix_lock_oserror_closes_file_descriptor(self) -> None:
        with tempfile.TemporaryDirectory() as temporary:
            lock = locks.FileLock(Path(temporary) / "failed-posix.lock")
            with patch("fcntl.flock", side_effect=OSError("simulated lock failure")):
                with self.assertRaises(OSError):
                    lock.acquire()
            self.assertIsNone(lock.file)

    def test_lock_contention_is_exclusive_between_processes(self) -> None:
        with tempfile.TemporaryDirectory() as temporary:
            lock = Path(temporary) / "authority.lock"
            ready = Path(temporary) / "ready"
            child_code = (
                "import sys,time; from pathlib import Path; "
                f"sys.path.insert(0, {str(ROOT)!r}); "
                "from portable_file_lock import FileLock; "
                f"l=FileLock({str(lock)!r}); l.acquire(); Path({str(ready)!r}).write_text('ready'); "
                "time.sleep(8)"
            )
            child = subprocess.Popen([sys.executable, "-c", child_code])
            try:
                deadline = time.monotonic() + 5
                while not ready.exists() and time.monotonic() < deadline:
                    time.sleep(0.02)
                self.assertTrue(ready.exists(), "child did not acquire the lock")
                with self.assertRaises(BlockingIOError):
                    locks.FileLock(lock).acquire(blocking=False)
            finally:
                child.kill()
                child.wait(timeout=5)

    def test_lock_is_released_after_owner_process_crash(self) -> None:
        with tempfile.TemporaryDirectory() as temporary:
            lock = Path(temporary) / "crash.lock"
            ready = Path(temporary) / "ready"
            child_code = (
                "import sys,time; from pathlib import Path; "
                f"sys.path.insert(0, {str(ROOT)!r}); "
                "from portable_file_lock import FileLock; "
                f"FileLock({str(lock)!r}).acquire(); Path({str(ready)!r}).write_text('ready'); "
                "time.sleep(30)"
            )
            child = subprocess.Popen([sys.executable, "-c", child_code])
            deadline = time.monotonic() + 5
            while not ready.exists() and time.monotonic() < deadline:
                time.sleep(0.02)
            self.assertTrue(ready.exists(), "child did not acquire the lock")
            child.kill()
            child.wait(timeout=5)
            with locks.FileLock(lock, blocking=False):
                pass

    def test_same_process_concurrent_claims_serialize(self) -> None:
        with tempfile.TemporaryDirectory() as temporary:
            lock = Path(temporary) / "serial.lock"
            counter = Path(temporary) / "counter.txt"
            counter.write_text("0", encoding="ascii")
            worker_code = (
                "import sys; from pathlib import Path; "
                f"sys.path.insert(0, {str(ROOT)!r}); "
                "from portable_file_lock import FileLock; "
                f"lock=Path({str(lock)!r}); counter=Path({str(counter)!r}); "
                "\nfor _ in range(30):\n with FileLock(lock):\n  n=int(counter.read_text()); counter.write_text(str(n+1))"
            )
            workers = [subprocess.Popen([sys.executable, "-c", worker_code]) for _ in range(4)]
            for worker in workers:
                self.assertEqual(worker.wait(timeout=15), 0)
            self.assertEqual(counter.read_text(encoding="ascii"), "120")

    def test_stale_pid_and_invalid_ownership_are_rejected(self) -> None:
        self.assertFalse(authority._pid_alive(0, "invalid"))
        self.assertFalse(authority._pid_alive(-5, None))
        self.assertEqual(authority._owner_state({
            "owner_session_id": "invalid-owner", "owner_host": authority.socket.gethostname(),
            "owner_pid": 0, "owner_lease_expires_at": time.time() + 60,
        }), "STALE_CLOSED_SESSION")

    @unittest.skipUnless(os.name == "nt", "Windows DACL validation")
    def test_recovery_directory_accepts_private_windows_acl(self) -> None:
        with tempfile.TemporaryDirectory() as temporary:
            self.assertTrue(authority._windows_private_directory_acl(Path(temporary)))

    def test_pid_reuse_is_detected_by_creation_time_mismatch(self) -> None:
        with patch.object(authority, "_process_start", return_value="new-process-start"):
            self.assertFalse(authority._pid_alive(12345, "old-process-start"))

    def test_current_process_has_a_stable_identity_and_is_live(self) -> None:
        start = authority._process_start(os.getpid())
        self.assertIsNotNone(start)
        self.assertTrue(authority._pid_alive(os.getpid(), start))


if __name__ == "__main__":
    unittest.main()
