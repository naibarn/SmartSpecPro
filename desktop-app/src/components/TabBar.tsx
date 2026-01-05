import { useTabs } from "../contexts/TabContext";
import { useState } from "react";
import { useGit } from "../hooks/useGit";

export default function TabBar() {
  const { tabs, activeTabId, createTab, closeTab, switchTab, renameTab } = useTabs();
  const git = useGit();
  const [editingTabId, setEditingTabId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState("");

  const handleCreateTab = async () => {
    const branchName = `smartspec/chat-${Date.now()}`;
    
    // Create tab first
    createTab(undefined, branchName);
    
    // Try to create git branch if initialized
    if (git.initialized) {
      try {
        await git.createAndCheckoutBranch(branchName);
      } catch (error) {
        console.error("Failed to create git branch:", error);
        // Continue anyway - tab is already created
      }
    }
  };

  const handleDoubleClick = (tabId: string, currentName: string) => {
    setEditingTabId(tabId);
    setEditingName(currentName);
  };

  const handleRename = (tabId: string) => {
    if (editingName.trim()) {
      renameTab(tabId, editingName.trim());
    }
    setEditingTabId(null);
    setEditingName("");
  };

  const handleKeyDown = (e: React.KeyboardEvent, tabId: string) => {
    if (e.key === "Enter") {
      handleRename(tabId);
    } else if (e.key === "Escape") {
      setEditingTabId(null);
      setEditingName("");
    }
  };

  return (
    <div className="flex items-center gap-1 bg-gray-100 dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 px-2 py-1">
      {tabs.map((tab) => (
        <div
          key={tab.id}
          className={`
            group flex items-center gap-2 px-3 py-1.5 rounded-t-md cursor-pointer
            transition-colors duration-150
            ${
              activeTabId === tab.id
                ? "bg-white dark:bg-gray-900 border-t border-x border-gray-200 dark:border-gray-700"
                : "bg-gray-50 dark:bg-gray-700 hover:bg-gray-100 dark:hover:bg-gray-600"
            }
          `}
          onClick={() => switchTab(tab.id)}
        >
          {editingTabId === tab.id ? (
            <input
              type="text"
              value={editingName}
              onChange={(e) => setEditingName(e.target.value)}
              onBlur={() => handleRename(tab.id)}
              onKeyDown={(e) => handleKeyDown(e, tab.id)}
              className="w-24 px-1 text-sm bg-transparent border-b border-blue-500 outline-none"
              autoFocus
            />
          ) : (
            <span
              className="text-sm font-medium text-gray-700 dark:text-gray-200"
              onDoubleClick={() => handleDoubleClick(tab.id, tab.name)}
            >
              {tab.name}
            </span>
          )}

          {tabs.length > 1 && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                closeTab(tab.id);
              }}
              className="opacity-0 group-hover:opacity-100 transition-opacity p-0.5 hover:bg-gray-200 dark:hover:bg-gray-600 rounded"
            >
              <svg
                className="w-3 h-3 text-gray-500 dark:text-gray-400"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M6 18L18 6M6 6l12 12"
                />
              </svg>
            </button>
          )}
        </div>
      ))}

      <button
        onClick={handleCreateTab}
        className="flex items-center justify-center w-8 h-8 rounded-md hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors"
        title="New Tab"
      >
        <svg
          className="w-4 h-4 text-gray-600 dark:text-gray-400"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M12 4v16m8-8H4"
          />
        </svg>
      </button>
    </div>
  );
}
