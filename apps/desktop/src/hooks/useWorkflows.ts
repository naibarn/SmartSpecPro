import { useState, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import type { Workflow } from "../types/workflow";

export function useWorkflows() {
  const [workflows, setWorkflows] = useState<Workflow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadWorkflows = async () => {
    try {
      setLoading(true);
      setError(null);
      const result = await invoke<Workflow[]>("list_workflows");
      setWorkflows(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      console.error("Failed to load workflows:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadWorkflows();
  }, []);

  return {
    workflows,
    loading,
    error,
    reload: loadWorkflows,
  };
}
