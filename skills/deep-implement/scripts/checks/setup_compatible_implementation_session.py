#!/usr/bin/env python3
"""Compatibility alias for deep-implement session setup.

This wrapper exists to mirror deep-plan's compatible-mode entrypoint while
preserving the legacy setup_implementation_session.py path for Claude users.
"""

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent.parent))

from scripts.checks.setup_implementation_session import main


if __name__ == "__main__":
    main()
