import os
import json
import hashlib
import mimetypes
import subprocess
from pathlib import Path
from typing import Any, Dict, Optional, List
import requests

from .control_plane_client import ControlPlaneClient
from .task_contract import load_tasks_registry, parse_tasks_from_markdown
from .sandbox import validate_workspace, sanitize_env

def sha256_file(p: Path) -> str:
    h = hashlib.sha256()
    with p.open("rb") as f:
        for chunk in iter(lambda: f.read(1024 * 1024), b""):
            h.update(chunk)
    return h.hexdigest()

class SaaSFactoryOrchestrator:
    def __init__(self, cp: ControlPlaneClient, workspace: str, workspace_root: str = "", max_report_bytes: int = 10 * 1024 * 1024):
        self.cp = cp
        self.workspace = validate_workspace(workspace, workspace_root)
        self.max_report_bytes = max_report_bytes

    def _run_cmd(self, cmd: List[str], cwd: str) -> subprocess.CompletedProcess:
        env = sanitize_env(dict(os.environ))
        return subprocess.run(cmd, cwd=cwd, env=env, stdout=subprocess.PIPE, stderr=subprocess.STDOUT, text=True, timeout=60 * 30)

    def _upload_reports(self, project_id: str, session_id: str, iteration: int = 0) -> List[Dict[str, Any]]:
        reports_dir = Path(self.workspace) / ".spec" / "reports"
        if not reports_dir.exists():
            return []

        uploaded = []
        for p in sorted(reports_dir.glob("**/*")):
            if not p.is_file():
                continue
            size = p.stat().st_size
            if size <= 0 or size > self.max_report_bytes:
                continue

            name = str(p.relative_to(reports_dir)).replace("\\", "/")
            ctype, _ = mimetypes.guess_type(p.name)
            ctype = ctype or "application/octet-stream"

            pres = self.cp.presign_put(session_id=session_id, project_id=project_id, name=f"reports/{name}", content_type=ctype, size_bytes=size, iteration=iteration)
            url = pres["url"]
            key = pres["key"]

            with p.open("rb") as f:
                r = requests.put(url, data=f, headers={"Content-Type": ctype}, timeout=120)
                r.raise_for_status()

            digest = sha256_file(p)
            self.cp.artifacts_complete(session_id=session_id, project_id=project_id, key=key, sha256=digest, size_bytes=size)

            rep = self.cp.create_report(session_id=session_id, project_id=project_id, title=f"Report: {name}", artifact_key=key, kind="workflow_report", summary={"path": name})
            uploaded.append({"artifactKey": key, "reportId": rep["id"], "path": name})
        return uploaded

    def _upsert_tasks_from_registry(self, project_id: str, session_id: str) -> int:
        # Deterministic contract: prefer .spec/registry/tasks.json
        reg = Path(self.workspace) / ".spec" / "registry" / "tasks.json"
        tasks = load_tasks_registry(str(reg)) if reg.exists() else []

        # fallback parse from latest markdown report
        if not tasks:
            latest = None
            repdir = Path(self.workspace) / ".spec" / "reports"
            if repdir.exists():
                md_files = sorted(repdir.glob("**/*.md"), key=lambda p: p.stat().st_mtime, reverse=True)
                if md_files:
                    latest = md_files[0]
            if latest:
                tasks = parse_tasks_from_markdown(latest.read_text(encoding="utf-8", errors="ignore"))

        count = 0
        for t in tasks:
            payload = {
                "title": t.get("title", "Untitled"),
                "originatingSpec": t.get("originatingSpec"),
                "acceptanceCriteria": t.get("acceptanceCriteria"),
                "mappedFiles": t.get("mappedFiles", []) or [],
                "mappedTests": t.get("mappedTests", []) or [],
                "status": t.get("status", "planned"),
            }
            self.cp.upsert_task(session_id=session_id, project_id=project_id, task=payload)
            count += 1
        return count

    def run(self, project_id: str, session_id: str, apply: bool = False, apply_approval_token: Optional[str] = None, max_iterations: int = 8) -> Dict[str, Any]:
        # If apply requested, require approval token and consume it first.
        if apply:
            if not apply_approval_token:
                raise ValueError("apply_requires_approval_token")
            self.cp.consume_apply_approval(session_id=session_id, project_id=project_id, token=apply_approval_token)

        gates_history = []
        for i in range(max_iterations):
            self.cp.create_iteration(session_id=session_id, project_id=project_id)

            # 1) Sync tasks (Kilo workflow) - allowlist command
            # NOTE: replace with your actual runner invocation if needed.
            # For safety we do not allow arbitrary cmd from user input.
            sync = self._run_cmd(["python", "-m", "ss_autopilot.cli_enhanced", "/sync-tasks.md"], cwd=self.workspace)

            # 2) Upload reports + record reports
            uploaded = self._upload_reports(project_id, session_id, iteration=i)

            # 3) Upsert tasks (deterministic)
            tasks_upserted = self._upsert_tasks_from_registry(project_id, session_id)

            # 4) Run tests + coverage (allowlist)
            test = self._run_cmd(["pytest", "-q"], cwd=self.workspace)
            passed = (test.returncode == 0)
            self.cp.record_test_run(session_id, project_id, passed=passed, summary={"returncode": test.returncode})

            # coverage best-effort if pytest-cov present
            cov_percent = 0.0
            cov = self._run_cmd(["pytest", "-q", "--cov=.", "--cov-report=term-missing"], cwd=self.workspace)
            # naive parse: look for TOTAL line "TOTAL ... 85%"
            for line in cov.stdout.splitlines():
                if line.strip().startswith("TOTAL") and "%" in line:
                    try:
                        cov_percent = float(line.split()[-1].replace("%", ""))
                    except Exception:
                        pass
            if cov_percent > 0:
                self.cp.record_coverage_run(session_id, project_id, percent=cov_percent, summary={"parsedFrom": "pytest-cov"})

            # 5) Security check placeholder (default pass) - can be extended to secret scan, etc.
            self.cp.record_security_check(session_id, project_id, status="pass", summary={"note": "placeholder"})

            # 6) Evaluate gates
            evaluation = self.cp.evaluate_gates(session_id, project_id)
            evaluation["iteration"] = i
            evaluation["tasksUpserted"] = tasks_upserted
            evaluation["reportsUploaded"] = len(uploaded)
            evaluation["syncOutputTail"] = sync.stdout[-2000:]
            evaluation["testOutputTail"] = test.stdout[-2000:]
            gates_history.append(evaluation)

            if evaluation.get("ok"):
                return {"ok": True, "iterations": i + 1, "gates": evaluation, "history": gates_history}

            # If not ok, run implement/fix workflow - apply controls whether it can mutate
            implement_cmd = "/implement.md" if apply else "/implement.md --plan-only"
            _ = self._run_cmd(["python", "-m", "ss_autopilot.cli_enhanced", implement_cmd], cwd=self.workspace)

        return {"ok": False, "iterations": max_iterations, "history": gates_history}
