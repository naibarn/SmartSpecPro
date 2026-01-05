import { invoke } from "@tauri-apps/api/core";
import { useState } from "react";

export interface GitHook {
  initialized: boolean;
  currentBranch: string | null;
  branches: string[];
  hasChanges: boolean;
  init: (repoPath: string) => Promise<void>;
  createBranch: (branchName: string) => Promise<void>;
  checkoutBranch: (branchName: string) => Promise<void>;
  createAndCheckoutBranch: (branchName: string) => Promise<void>;
  commitAll: (message: string) => Promise<string>;
  pushBranch: (branchName: string, remoteName?: string) => Promise<void>;
  refreshStatus: () => Promise<void>;
  listBranches: () => Promise<string[]>;
}

export function useGit(): GitHook {
  const [initialized, setInitialized] = useState(false);
  const [currentBranch, setCurrentBranch] = useState<string | null>(null);
  const [branches, setBranches] = useState<string[]>([]);
  const [hasChanges, setHasChanges] = useState(false);

  const init = async (repoPath: string) => {
    try {
      await invoke("git_init", { repoPath });
      setInitialized(true);
      await refreshStatus();
    } catch (error) {
      console.error("Failed to initialize git:", error);
      throw error;
    }
  };

  const createBranch = async (branchName: string) => {
    try {
      await invoke("git_create_branch", { branchName });
      await refreshStatus();
    } catch (error) {
      console.error("Failed to create branch:", error);
      throw error;
    }
  };

  const checkoutBranch = async (branchName: string) => {
    try {
      await invoke("git_checkout_branch", { branchName });
      await refreshStatus();
    } catch (error) {
      console.error("Failed to checkout branch:", error);
      throw error;
    }
  };

  const createAndCheckoutBranch = async (branchName: string) => {
    try {
      await invoke("git_create_and_checkout_branch", { branchName });
      await refreshStatus();
    } catch (error) {
      console.error("Failed to create and checkout branch:", error);
      throw error;
    }
  };

  const commitAll = async (message: string): Promise<string> => {
    try {
      const commitId = await invoke<string>("git_commit_all", { message });
      await refreshStatus();
      return commitId;
    } catch (error) {
      console.error("Failed to commit:", error);
      throw error;
    }
  };

  const pushBranch = async (branchName: string, remoteName: string = "origin") => {
    try {
      await invoke("git_push_branch", { branchName, remoteName });
      await refreshStatus();
    } catch (error) {
      console.error("Failed to push branch:", error);
      throw error;
    }
  };

  const refreshStatus = async () => {
    if (!initialized) return;

    try {
      const [branch, changes, branchList] = await Promise.all([
        invoke<string>("git_get_current_branch"),
        invoke<boolean>("git_has_changes"),
        invoke<string[]>("git_list_branches"),
      ]);

      setCurrentBranch(branch);
      setHasChanges(changes);
      setBranches(branchList);
    } catch (error) {
      console.error("Failed to refresh git status:", error);
    }
  };

  const listBranches = async (): Promise<string[]> => {
    try {
      const branchList = await invoke<string[]>("git_list_branches");
      setBranches(branchList);
      return branchList;
    } catch (error) {
      console.error("Failed to list branches:", error);
      throw error;
    }
  };

  return {
    initialized,
    currentBranch,
    branches,
    hasChanges,
    init,
    createBranch,
    checkoutBranch,
    createAndCheckoutBranch,
    commitAll,
    pushBranch,
    refreshStatus,
    listBranches,
  };
}
