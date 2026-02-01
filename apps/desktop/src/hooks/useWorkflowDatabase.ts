import { useState, useCallback } from "react";
import { invoke } from "@tauri-apps/api/core";
import type {
  Workflow,
  CreateWorkflowRequest,
  UpdateWorkflowRequest,
  WorkflowFilter,
} from "../types/database";

export function useWorkflowDatabase() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Create workflow
  const createWorkflow = useCallback(
    async (req: CreateWorkflowRequest): Promise<Workflow | null> => {
      setLoading(true);
      setError(null);
      try {
        const workflow = await invoke<Workflow>("create_workflow_db", { req });
        return workflow;
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        setError(message);
        return null;
      } finally {
        setLoading(false);
      }
    },
    []
  );

  // Get workflow by ID
  const getWorkflow = useCallback(async (id: string): Promise<Workflow | null> => {
    setLoading(true);
    setError(null);
    try {
      const workflow = await invoke<Workflow | null>("get_workflow_db", { id });
      return workflow;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      setError(message);
      return null;
    } finally {
      setLoading(false);
    }
  }, []);

  // Get workflow by name
  const getWorkflowByName = useCallback(
    async (name: string): Promise<Workflow | null> => {
      setLoading(true);
      setError(null);
      try {
        const workflow = await invoke<Workflow | null>("get_workflow_by_name_db", {
          name,
        });
        return workflow;
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        setError(message);
        return null;
      } finally {
        setLoading(false);
      }
    },
    []
  );

  // List workflows
  const listWorkflows = useCallback(
    async (filter: WorkflowFilter = {}): Promise<Workflow[]> => {
      setLoading(true);
      setError(null);
      try {
        const workflows = await invoke<Workflow[]>("list_workflows_db", {
          filter,
        });
        return workflows;
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        setError(message);
        return [];
      } finally {
        setLoading(false);
      }
    },
    []
  );

  // Update workflow
  const updateWorkflow = useCallback(
    async (id: string, req: UpdateWorkflowRequest): Promise<boolean> => {
      setLoading(true);
      setError(null);
      try {
        await invoke("update_workflow_db", { id, req });
        return true;
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        setError(message);
        return false;
      } finally {
        setLoading(false);
      }
    },
    []
  );

  // Delete workflow
  const deleteWorkflow = useCallback(async (id: string): Promise<boolean> => {
    setLoading(true);
    setError(null);
    try {
      await invoke("delete_workflow_db", { id });
      return true;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      setError(message);
      return false;
    } finally {
      setLoading(false);
    }
  }, []);

  return {
    loading,
    error,
    createWorkflow,
    getWorkflow,
    getWorkflowByName,
    listWorkflows,
    updateWorkflow,
    deleteWorkflow,
  };
}
