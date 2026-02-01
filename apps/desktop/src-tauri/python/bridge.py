#!/usr/bin/env python3
"""
Python Bridge for Kilo Code CLI

This script acts as a bridge between Tauri Desktop App and Kilo Code CLI.
It provides a JSON-based interface for executing workflows and getting results.
"""

import sys
import json
import argparse
from pathlib import Path
from typing import Dict, Any, Optional
from datetime import datetime


class JsonStreamLogger:
    """Logger that outputs JSON Lines to stdout"""
    
    def __init__(self, workflow_id: str):
        self.workflow_id = workflow_id
    
    def log(self, level: str, message: str, **kwargs):
        """Log a message"""
        data = {
            "type": "log",
            "workflow_id": self.workflow_id,
            "level": level,
            "message": message,
            "timestamp": datetime.utcnow().isoformat() + "Z",
            **kwargs
        }
        print(json.dumps(data), flush=True)
    
    def progress(self, step: str, progress: float, message: str):
        """Report progress"""
        data = {
            "type": "progress",
            "workflow_id": self.workflow_id,
            "step": step,
            "progress": progress,
            "message": message,
            "timestamp": datetime.utcnow().isoformat() + "Z"
        }
        print(json.dumps(data), flush=True)
    
    def error(self, code: str, message: str, **kwargs):
        """Log an error"""
        data = {
            "type": "error",
            "workflow_id": self.workflow_id,
            "code": code,
            "message": message,
            "timestamp": datetime.utcnow().isoformat() + "Z",
            **kwargs
        }
        print(json.dumps(data), file=sys.stderr, flush=True)


class WorkflowRunner:
    """Execute Kilo Code CLI workflows"""
    
    def __init__(self, workflow_id: str, smartspec_root: Optional[Path] = None):
        self.workflow_id = workflow_id
        self.logger = JsonStreamLogger(workflow_id)
        
        # Find SmartSpec root
        if smartspec_root:
            self.smartspec_root = smartspec_root
        else:
            # Try to find .smartspec directory
            current = Path.cwd()
            while current != current.parent:
                smartspec_dir = current / ".smartspec"
                if smartspec_dir.exists():
                    self.smartspec_root = current
                    break
                current = current.parent
            else:
                self.smartspec_root = Path.cwd()
        
        # Add .smartspec to path
        smartspec_path = self.smartspec_root / ".smartspec"
        if smartspec_path.exists():
            sys.path.insert(0, str(smartspec_path))
    
    def run(self, workflow_name: str, args: Dict[str, Any]) -> Dict[str, Any]:
        """Run a workflow"""
        try:
            # Log start
            self.logger.log("info", f"Starting workflow: {workflow_name}")
            print(json.dumps({
                "type": "started",
                "workflow_id": self.workflow_id,
                "workflow_name": workflow_name,
                "timestamp": datetime.utcnow().isoformat() + "Z"
            }), flush=True)
            
            # Execute workflow
            self.logger.progress("execute", 0.0, "Initializing...")
            result = self._execute_workflow(workflow_name, args)
            self.logger.progress("execute", 1.0, "Complete")
            
            # Log completion
            self.logger.log("info", "Workflow completed successfully")
            print(json.dumps({
                "type": "completed",
                "workflow_id": self.workflow_id,
                "result": result,
                "timestamp": datetime.utcnow().isoformat() + "Z"
            }), flush=True)
            
            return result
            
        except Exception as e:
            # Log error
            self.logger.error("WORKFLOW_FAILED", str(e))
            print(json.dumps({
                "type": "failed",
                "workflow_id": self.workflow_id,
                "error": str(e),
                "timestamp": datetime.utcnow().isoformat() + "Z"
            }), flush=True)
            raise
    
    def _execute_workflow(self, workflow_name: str, args: Dict[str, Any]) -> Dict[str, Any]:
        """Execute workflow steps"""
        spec_id = args.get("spec_id")
        category = args.get("category", "core")
        mode = args.get("mode", "auto")
        platform = args.get("platform", "kilo")
        
        self.logger.log("info", f"Executing workflow: {workflow_name}")
        self.logger.log("info", f"Spec ID: {spec_id}")
        self.logger.log("info", f"Category: {category}")
        self.logger.log("info", f"Mode: {mode}")
        self.logger.log("info", f"Platform: {platform}")
        
        # Try to import and call CLI
        try:
            self.logger.progress("import", 0.3, "Importing Kilo Code CLI...")
            from ss_autopilot.cli_enhanced import run_autopilot
            
            self.logger.progress("execute", 0.5, "Running autopilot...")
            result = run_autopilot(
                spec_id=spec_id,
                category=category,
                mode=mode,
                platform=platform
            )
            
            return {
                "success": True,
                "spec_id": spec_id,
                "output": result
            }
            
        except ImportError as e:
            self.logger.error("IMPORT_ERROR", f"Failed to import Kilo Code CLI: {e}")
            # Fallback: simulate workflow execution
            self.logger.log("warning", "Kilo Code CLI not found, simulating workflow")
            
            import time
            for i in range(5):
                self.logger.progress("simulate", i / 4, f"Step {i+1}/5")
                time.sleep(0.5)
            
            return {
                "success": True,
                "spec_id": spec_id,
                "output": "Simulated workflow execution (CLI not found)",
                "simulated": True
            }


def cmd_run_workflow(args):
    """Run a workflow"""
    runner = WorkflowRunner(
        args.workflow_id,
        smartspec_root=Path(args.smartspec_root) if args.smartspec_root else None
    )
    
    workflow_args = {
        "spec_id": args.spec_id,
        "category": args.category,
        "mode": args.mode,
        "platform": args.platform
    }
    
    result = runner.run(args.workflow_name, workflow_args)
    return 0 if result.get("success") else 1


def cmd_list_workflows(args):
    """List available workflows"""
    try:
        # Try to import workflow catalog
        from ss_autopilot.workflow_catalog import WorkflowCatalog
        
        catalog = WorkflowCatalog()
        workflows = catalog.list_workflows()
        
        output = {
            "type": "workflows_list",
            "workflows": workflows,
            "count": len(workflows),
            "timestamp": datetime.utcnow().isoformat() + "Z"
        }
    except ImportError:
        # Fallback: return dummy workflows
        workflows = [
            {
                "name": "smartspec_generate_spec",
                "description": "Generate specification from requirements"
            },
            {
                "name": "smartspec_generate_plan",
                "description": "Generate implementation plan"
            },
            {
                "name": "smartspec_generate_tasks",
                "description": "Generate task list"
            }
        ]
        
        output = {
            "type": "workflows_list",
            "workflows": workflows,
            "count": len(workflows),
            "simulated": True,
            "timestamp": datetime.utcnow().isoformat() + "Z"
        }
    
    print(json.dumps(output), flush=True)
    return 0


def cmd_validate_spec(args):
    """Validate a spec file"""
    spec_path = Path(args.spec_path)
    
    if not spec_path.exists():
        error = {
            "type": "error",
            "code": "SPEC_NOT_FOUND",
            "message": f"Spec file not found: {spec_path}",
            "timestamp": datetime.utcnow().isoformat() + "Z"
        }
        print(json.dumps(error), file=sys.stderr, flush=True)
        return 1
    
    # Basic validation
    try:
        content = spec_path.read_text()
        
        # Check if file is not empty
        if not content.strip():
            raise ValueError("Spec file is empty")
        
        # Check if it's markdown
        if not spec_path.suffix == ".md":
            raise ValueError("Spec file must be a Markdown file (.md)")
        
        result = {
            "type": "validation_result",
            "valid": True,
            "spec_path": str(spec_path),
            "size": len(content),
            "lines": len(content.splitlines()),
            "timestamp": datetime.utcnow().isoformat() + "Z"
        }
        
        print(json.dumps(result), flush=True)
        return 0
        
    except Exception as e:
        error = {
            "type": "error",
            "code": "VALIDATION_FAILED",
            "message": str(e),
            "spec_path": str(spec_path),
            "timestamp": datetime.utcnow().isoformat() + "Z"
        }
        print(json.dumps(error), file=sys.stderr, flush=True)
        return 1


def cmd_get_status(args):
    """Get workflow status (placeholder)"""
    status = {
        "type": "status",
        "workflow_id": args.workflow_id,
        "status": "unknown",
        "message": "Status tracking not yet implemented",
        "timestamp": datetime.utcnow().isoformat() + "Z"
    }
    
    print(json.dumps(status), flush=True)
    return 0


def main():
    """Main entry point"""
    parser = argparse.ArgumentParser(description="Python Bridge for Kilo Code CLI")
    subparsers = parser.add_subparsers(dest="command", required=True)
    
    # run-workflow command
    run_parser = subparsers.add_parser("run-workflow", help="Run a workflow")
    run_parser.add_argument("--workflow-id", required=True, help="Unique workflow ID")
    run_parser.add_argument("--workflow-name", required=True, help="Workflow name")
    run_parser.add_argument("--spec-id", required=True, help="Spec ID")
    run_parser.add_argument("--category", default="core", help="Spec category")
    run_parser.add_argument("--mode", default="auto", help="Execution mode")
    run_parser.add_argument("--platform", default="kilo", help="Platform")
    run_parser.add_argument("--smartspec-root", help="Path to SmartSpec root directory")
    run_parser.set_defaults(func=cmd_run_workflow)
    
    # list-workflows command
    list_parser = subparsers.add_parser("list-workflows", help="List available workflows")
    list_parser.set_defaults(func=cmd_list_workflows)
    
    # validate-spec command
    validate_parser = subparsers.add_parser("validate-spec", help="Validate a spec file")
    validate_parser.add_argument("--spec-path", required=True, help="Path to spec file")
    validate_parser.set_defaults(func=cmd_validate_spec)
    
    # get-status command
    status_parser = subparsers.add_parser("get-status", help="Get workflow status")
    status_parser.add_argument("--workflow-id", required=True, help="Workflow ID")
    status_parser.set_defaults(func=cmd_get_status)
    
    args = parser.parse_args()
    
    try:
        return args.func(args)
    except Exception as e:
        error = {
            "type": "error",
            "code": "UNKNOWN_ERROR",
            "message": str(e),
            "timestamp": datetime.utcnow().isoformat() + "Z"
        }
        print(json.dumps(error), file=sys.stderr, flush=True)
        return 1


if __name__ == "__main__":
    sys.exit(main())
