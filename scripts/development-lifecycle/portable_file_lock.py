"""Small cross-platform advisory file lock used by lifecycle authorities."""

from __future__ import annotations

import contextlib
import os
from pathlib import Path
from typing import Any, Iterator


if os.name == "nt":
    import ctypes
    import msvcrt

    class _Overlapped(ctypes.Structure):
        _fields_ = [
            ("Internal", ctypes.c_size_t),
            ("InternalHigh", ctypes.c_size_t),
            ("Offset", ctypes.c_uint32),
            ("OffsetHigh", ctypes.c_uint32),
            ("hEvent", ctypes.c_void_p),
        ]

    _kernel32 = ctypes.WinDLL("kernel32", use_last_error=True)
    _lock_file = _kernel32.LockFileEx
    _lock_file.argtypes = [ctypes.c_void_p, ctypes.c_uint32, ctypes.c_uint32, ctypes.c_uint32, ctypes.c_uint32, ctypes.POINTER(_Overlapped)]
    _lock_file.restype = ctypes.c_int
    _unlock_file = _kernel32.UnlockFileEx
    _unlock_file.argtypes = [ctypes.c_void_p, ctypes.c_uint32, ctypes.c_uint32, ctypes.c_uint32, ctypes.POINTER(_Overlapped)]
    _unlock_file.restype = ctypes.c_int


class FileLock:
    """Lock the first byte of a stable lock file, with flock-compatible modes."""

    def __init__(self, path: Path | str, *, blocking: bool = True):
        self.path = Path(path)
        self.blocking = blocking
        self.file: Any = None
        self._overlapped: Any = None

    def acquire(self, *, blocking: bool = True) -> "FileLock":
        self.file = self.path.open("a+b")
        if os.name == "nt":
            self.file.seek(0, os.SEEK_END)
            if self.file.tell() == 0:
                self.file.write(b"\0")
                self.file.flush()
            self.file.seek(0)
            self._overlapped = _Overlapped()
            flags = 0x00000002 | (0 if blocking else 0x00000001)
            handle = msvcrt.get_osfhandle(self.file.fileno())
            if not _lock_file(handle, flags, 0, 1, 0, self._overlapped):
                error = ctypes.get_last_error()
                self.file.close()
                self.file = None
                if error in {32, 33, 36}:  # sharing/lock violation or resource unavailable
                    raise BlockingIOError(error, "lock is held", str(self.path))
                raise ctypes.WinError(error)
        else:
            import fcntl

            operation = fcntl.LOCK_EX | (0 if blocking else fcntl.LOCK_NB)
            try:
                fcntl.flock(self.file.fileno(), operation)
            except OSError:
                self.file.close()
                self.file = None
                raise
        return self

    def release(self) -> None:
        if self.file is None:
            return
        try:
            if os.name == "nt":
                handle = msvcrt.get_osfhandle(self.file.fileno())
                if not _unlock_file(handle, 0, 1, 0, self._overlapped):
                    raise ctypes.WinError(ctypes.get_last_error())
            else:
                import fcntl

                fcntl.flock(self.file.fileno(), fcntl.LOCK_UN)
        finally:
            self.file.close()
            self.file = None

    def __enter__(self) -> "FileLock":
        return self.acquire(blocking=self.blocking)

    def __exit__(self, exc_type: Any, exc: Any, traceback: Any) -> None:
        self.release()


@contextlib.contextmanager
def file_lock(path: Path | str, *, blocking: bool = True) -> Iterator[FileLock]:
    lock = FileLock(path).acquire(blocking=blocking)
    try:
        yield lock
    finally:
        lock.release()
