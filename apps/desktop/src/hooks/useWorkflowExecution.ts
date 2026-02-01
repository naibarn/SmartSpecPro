import { useState, useCallback, useEffect, useRef } from "react";
import { invoke } from "@tauri-apps/api/core";
import type {
  WorkflowArgs,
  WorkflowExecution,
  OutputMessage,
} from "../types/workflow";

export function useWorkflowExecution() {
  const [executions, setExecutions] = useState<Map<string, WorkflowExecution>>(
    new Map()
  );
  const pollIntervalRef = useRef<number | null>(null);

  // Start a workflow
  const startWorkflow = useCallback(
    async (workflowName: string, args: WorkflowArgs) => {
      const workflowId = `W${Date.now()}`;

      // Create execution record
      const execution: WorkflowExecution = {
        id: workflowId,
        name: workflowName,
        status: "idle",
        args,
        messages: [],
        startTime: new Date(),
      };

      setExecutions((prev) => new Map(prev).set(workflowId, execution));

      try {
        // Invoke Tauri command
        await invoke("run_workflow", {
          workflowId,
          workflowName,
          args,
        });

        // Update status to running
        setExecutions((prev) => {
          const next = new Map(prev);
          const exec = next.get(workflowId);
          if (exec) {
            exec.status = "running";
            next.set(workflowId, { ...exec });
          }
          return next;
        });

        return workflowId;
      } catch (err) {
        // Update status to failed
        setExecutions((prev) => {
          const next = new Map(prev);
          const exec = next.get(workflowId);
          if (exec) {
            exec.status = "failed";
            exec.error = err instanceof Error ? err.message : String(err);
            exec.endTime = new Date();
            next.set(workflowId, { ...exec });
          }
          return next;
        });

        throw err;
      }
    },
    []
  );

  // Stop a workflow
  const stopWorkflow = useCallback(async (workflowId: string) => {
    try {
      await invoke("stop_workflow", { workflowId });

      setExecutions((prev) => {
        const next = new Map(prev);
        const exec = next.get(workflowId);
        if (exec) {
          exec.status = "stopped";
          exec.endTime = new Date();
          next.set(workflowId, { ...exec });
        }
        return next;
      });
    } catch (err) {
      console.error("Failed to stop workflow:", err);
      throw err;
    }
  }, []);

  // Get workflow status
  const getStatus = useCallback(async (workflowId: string) => {
    try {
      const status = await invoke<string>("get_workflow_status", {
        workflowId,
      });
      return status;
    } catch (err) {
      console.error("Failed to get workflow status:", err);
      return "unknown";
    }
  }, []);

  // Poll for output
  const pollOutput = useCallback(async (workflowId: string) => {
    try {
      const message = await invoke<OutputMessage | null>(
        "get_workflow_output",
        { workflowId }
      );

      if (message) {
        setExecutions((prev) => {
          const next = new Map(prev);
          const exec = next.get(workflowId);
          if (exec) {
            exec.messages.push(message);

            // Update status based on message type
            if (message.type === "completed") {
              exec.status = "completed";
              exec.endTime = new Date();
              exec.result = (message as any).result;
            } else if (message.type === "failed") {
              exec.status = "failed";
              exec.endTime = new Date();
              exec.error = (message as any).error;
            }

            next.set(workflowId, { ...exec });
          }
          return next;
        });
      }
    } catch (err) {
      console.error("Failed to poll output:", err);
    }
  }, []);

  // Start polling for all running workflows
  useEffect(() => {
    const runningWorkflows = Array.from(executions.values()).filter(
      (exec) => exec.status === "running"
    );

    if (runningWorkflows.length > 0) {
      // Poll every 100ms
      pollIntervalRef.current = setInterval(() => {
        runningWorkflows.forEach((exec) => {
          pollOutput(exec.id);
        });
      }, 100);
    } else {
      // Clear interval if no running workflows
      if (pollIntervalRef.current) {
        clearInterval(pollIntervalRef.current);
        pollIntervalRef.current = null;
      }
    }

    return () => {
      if (pollIntervalRef.current) {
        clearInterval(pollIntervalRef.current);
      }
    };
  }, [executions, pollOutput]);

  return {
    executions: Array.from(executions.values()),
    startWorkflow,
    stopWorkflow,
    getStatus,
    getExecution: (id: string) => executions.get(id),
  };
}
