import { useState, useCallback } from "react";
import { invoke } from "@tauri-apps/api/core";
import type {
  Execution,
  ExecutionFilter,
  ExecutionStatus,
} from "../types/database";

export function useExecutionDatabase() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Create execution
  const createExecution = useCallback(
    async (workflowId: string, workflowName: string): Promise<Execution | null> => {
      setLoading(true);
      setError(null);
      try {
        const execution = await invoke<Execution>("create_execution_db", {
          workflowId,
          workflowName,
        });
        return execution;
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

  // Get execution by ID
  const getExecution = useCallback(
    async (id: string): Promise<Execution | null> => {
      setLoading(true);
      setError(null);
      try {
        const execution = await invoke<Execution | null>("get_execution_db", {
          id,
        });
        return execution;
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

  // List executions
  const listExecutions = useCallback(
    async (filter: ExecutionFilter = {}): Promise<Execution[]> => {
      setLoading(true);
      setError(null);
      try {
        const executions = await invoke<Execution[]>("list_executions_db", {
          filter,
        });
        return executions;
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

  // Update execution status
  const updateExecutionStatus = useCallback(
    async (
      id: string,
      status: ExecutionStatus,
      output?: Record<string, any>,
      error?: string
    ): Promise<boolean> => {
      setLoading(true);
      setError(null);
      try {
        await invoke("update_execution_status_db", {
          id,
          status,
          output: output || null,
          error: error || null,
        });
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

  // Delete execution
  const deleteExecution = useCallback(async (id: string): Promise<boolean> => {
    setLoading(true);
    setError(null);
    try {
      await invoke("delete_execution_db", { id });
      return true;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      setError(message);
      return false;
    } finally {
      setLoading(false);
    }
  }, []);

  // Delete old executions
  const deleteOldExecutions = useCallback(
    async (days: number): Promise<number> => {
      setLoading(true);
      setError(null);
      try {
        const count = await invoke<number>("delete_old_executions_db", { days });
        return count;
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        setError(message);
        return 0;
      } finally {
        setLoading(false);
      }
    },
    []
  );

  return {
    loading,
    error,
    createExecution,
    getExecution,
    listExecutions,
    updateExecutionStatus,
    deleteExecution,
    deleteOldExecutions,
  };
}
