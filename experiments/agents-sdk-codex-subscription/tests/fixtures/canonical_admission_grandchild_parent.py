from __future__ import annotations

import subprocess
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[2]))
from model_admission import validate_private_admission_fds

run_id = sys.argv[1]
evidence_root = Path(sys.argv[2])
validate_private_admission_fds(3, 4)
grandchild = Path(__file__).with_name("canonical_admission_grandchild.py")
subprocess.run([sys.executable, str(grandchild), run_id, str(evidence_root / run_id)],
               check=True, close_fds=True, pass_fds=(3, 4))
from durable_store import DurableRunStore

store = DurableRunStore(evidence_root / run_id, run_id=run_id,
                        initial_state={"runId": run_id, "status": "completed"})
store.state["status"] = "completed"
store.export()
store.close()
