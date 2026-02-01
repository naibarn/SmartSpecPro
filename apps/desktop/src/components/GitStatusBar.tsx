import { useEffect, useState } from "react";
import { useGit } from "../hooks/useGit";
import { useTabs } from "../contexts/TabContext";
import { motion, AnimatePresence } from "framer-motion";

export function GitStatusBar() {
  const git = useGit();
  const { activeTab } = useTabs();
  const [showActions, setShowActions] = useState(false);
  const [commitMessage, setCommitMessage] = useState("");
  const [isCommitting, setIsCommitting] = useState(false);
  const [isPushing, setIsPushing] = useState(false);

  useEffect(() => {
    // Initialize git with current directory (will be set by user later)
    // For now, this is just a placeholder
  }, []);

  const handleCommit = async () => {
    if (!commitMessage.trim() || !activeTab) return;

    setIsCommitting(true);
    try {
      await git.commitAll(commitMessage);
      setCommitMessage("");
      setShowActions(false);
    } catch (error) {
      console.error("Failed to commit:", error);
      alert(`Failed to commit: ${error}`);
    } finally {
      setIsCommitting(false);
    }
  };

  const handlePush = async () => {
    if (!activeTab) return;

    setIsPushing(true);
    try {
      await git.pushBranch(activeTab.branch);
      setShowActions(false);
    } catch (error) {
      console.error("Failed to push:", error);
      alert(`Failed to push: ${error}`);
    } finally {
      setIsPushing(false);
    }
  };

  const handleCommitAndPush = async () => {
    if (!commitMessage.trim() || !activeTab) return;

    setIsCommitting(true);
    setIsPushing(true);
    try {
      await git.commitAll(commitMessage);
      await git.pushBranch(activeTab.branch);
      setCommitMessage("");
      setShowActions(false);
    } catch (error) {
      console.error("Failed to commit and push:", error);
      alert(`Failed to commit and push: ${error}`);
    } finally {
      setIsCommitting(false);
      setIsPushing(false);
    }
  };

  if (!git.initialized || !activeTab) {
    return null;
  }

  return (
    <div className="border-t border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900 px-4 py-2">
      <div className="max-w-4xl mx-auto flex items-center justify-between">
        {/* Left: Git Status */}
        <div className="flex items-center gap-4 text-xs">
          <div className="flex items-center gap-2">
            <svg
              className="w-4 h-4 text-gray-500 dark:text-gray-400"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M10 20l4-16m4 4l4 4-4 4M6 16l-4-4 4-4"
              />
            </svg>
            <span className="text-gray-600 dark:text-gray-400">
              Branch: <span className="font-mono font-semibold">{activeTab.branch}</span>
            </span>
          </div>

          {git.hasChanges && (
            <div className="flex items-center gap-1 text-yellow-600 dark:text-yellow-400">
              <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                <path
                  fillRule="evenodd"
                  d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z"
                  clipRule="evenodd"
                />
              </svg>
              <span>Uncommitted changes</span>
            </div>
          )}
        </div>

        {/* Right: Actions */}
        <div className="flex items-center gap-2">
          {!showActions ? (
            <button
              onClick={() => setShowActions(true)}
              className="px-3 py-1 text-xs font-medium text-blue-600 dark:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-900/20 rounded-md transition-colors"
            >
              Git Actions
            </button>
          ) : (
            <AnimatePresence>
              <motion.div
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: 20 }}
                className="flex items-center gap-2"
              >
                <input
                  type="text"
                  value={commitMessage}
                  onChange={(e) => setCommitMessage(e.target.value)}
                  placeholder="Commit message..."
                  className="px-2 py-1 text-xs border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-800 text-gray-900 dark:text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  style={{ width: "200px" }}
                />

                <button
                  onClick={handleCommit}
                  disabled={!commitMessage.trim() || isCommitting}
                  className="px-2 py-1 text-xs font-medium text-white bg-blue-600 hover:bg-blue-700 disabled:bg-gray-400 rounded transition-colors"
                >
                  {isCommitting ? "..." : "Commit"}
                </button>

                <button
                  onClick={handlePush}
                  disabled={isPushing}
                  className="px-2 py-1 text-xs font-medium text-white bg-green-600 hover:bg-green-700 disabled:bg-gray-400 rounded transition-colors"
                >
                  {isPushing ? "..." : "Push"}
                </button>

                <button
                  onClick={handleCommitAndPush}
                  disabled={!commitMessage.trim() || isCommitting || isPushing}
                  className="px-2 py-1 text-xs font-medium text-white bg-purple-600 hover:bg-purple-700 disabled:bg-gray-400 rounded transition-colors"
                >
                  {isCommitting || isPushing ? "..." : "Commit & Push"}
                </button>

                <button
                  onClick={() => {
                    setShowActions(false);
                    setCommitMessage("");
                  }}
                  className="px-2 py-1 text-xs font-medium text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700 rounded transition-colors"
                >
                  Cancel
                </button>
              </motion.div>
            </AnimatePresence>
          )}
        </div>
      </div>
    </div>
  );
}
