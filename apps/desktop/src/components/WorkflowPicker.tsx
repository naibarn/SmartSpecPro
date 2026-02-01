import { useState, useEffect, useRef } from "react";
import { motion } from "framer-motion";
import type { Workflow } from "../types/workflow";

interface WorkflowPickerProps {
  workflows: Workflow[];
  onSelect: (workflow: Workflow) => void;
  onClose: () => void;
  filterText: string;
}

export function WorkflowPicker({
  workflows,
  onSelect,
  onClose,
  filterText,
}: WorkflowPickerProps) {
  const [selectedIndex, setSelectedIndex] = useState(0);
  const listRef = useRef<HTMLDivElement>(null);

  // Filter workflows based on input
  const filteredWorkflows = workflows.filter((w) =>
    w.name.toLowerCase().includes(filterText.toLowerCase()) ||
    w.description.toLowerCase().includes(filterText.toLowerCase())
  );

  // Reset selection when filter changes
  useEffect(() => {
    setSelectedIndex(0);
  }, [filterText]);

  // Handle keyboard navigation
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setSelectedIndex((prev) =>
          Math.min(prev + 1, filteredWorkflows.length - 1)
        );
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        setSelectedIndex((prev) => Math.max(prev - 1, 0));
      } else if (e.key === "Enter") {
        e.preventDefault();
        if (filteredWorkflows[selectedIndex]) {
          onSelect(filteredWorkflows[selectedIndex]);
        }
      } else if (e.key === "Escape") {
        e.preventDefault();
        onClose();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [filteredWorkflows, selectedIndex, onSelect, onClose]);

  // Scroll selected item into view
  useEffect(() => {
    if (listRef.current) {
      const selectedElement = listRef.current.children[selectedIndex] as HTMLElement;
      if (selectedElement) {
        selectedElement.scrollIntoView({
          block: "nearest",
          behavior: "smooth",
        });
      }
    }
  }, [selectedIndex]);

  if (filteredWorkflows.length === 0) {
    return (
      <motion.div
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: -10 }}
        className="absolute bottom-full left-0 right-0 mb-2 bg-white dark:bg-gray-800 border-2 border-gray-200 dark:border-gray-700 rounded-xl shadow-2xl p-4"
      >
        <div className="text-center text-gray-500 dark:text-gray-400">
          <svg
            className="w-12 h-12 mx-auto mb-2 opacity-50"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M9.172 16.172a4 4 0 015.656 0M9 10h.01M15 10h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
            />
          </svg>
          <p className="text-sm">No workflows found</p>
          <p className="text-xs mt-1">Try a different search term</p>
        </div>
      </motion.div>
    );
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: -10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -10 }}
      className="absolute bottom-full left-0 right-0 mb-2 bg-white dark:bg-gray-800 border-2 border-gray-200 dark:border-gray-700 rounded-xl shadow-2xl overflow-hidden"
    >
      {/* Header */}
      <div className="px-4 py-3 bg-gray-50 dark:bg-gray-900 border-b border-gray-200 dark:border-gray-700">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <svg
              className="w-4 h-4 text-blue-600 dark:text-blue-400"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
              />
            </svg>
            <span className="text-sm font-semibold text-gray-700 dark:text-gray-300">
              Select Workflow
            </span>
          </div>
          <span className="text-xs text-gray-500 dark:text-gray-400">
            {filteredWorkflows.length} found
          </span>
        </div>
      </div>

      {/* Workflow List */}
      <div
        ref={listRef}
        className="max-h-80 overflow-y-auto"
      >
        {filteredWorkflows.map((workflow, index) => (
          <motion.button
            key={workflow.name}
            onClick={() => onSelect(workflow)}
            className={`
              w-full px-4 py-3 text-left transition-colors
              ${
                index === selectedIndex
                  ? "bg-blue-50 dark:bg-blue-900/30"
                  : "hover:bg-gray-50 dark:hover:bg-gray-700"
              }
              ${index !== filteredWorkflows.length - 1 ? "border-b border-gray-100 dark:border-gray-700" : ""}
            `}
            whileHover={{ x: 4 }}
          >
            <div className="flex items-start justify-between">
              <div className="flex-1">
                <div className="flex items-center space-x-2">
                  <span
                    className={`
                      text-sm font-semibold
                      ${
                        index === selectedIndex
                          ? "text-blue-600 dark:text-blue-400"
                          : "text-gray-900 dark:text-white"
                      }
                    `}
                  >
                    {workflow.name}
                  </span>
                  {index === selectedIndex && (
                    <motion.div
                      initial={{ scale: 0 }}
                      animate={{ scale: 1 }}
                      className="w-2 h-2 bg-blue-600 dark:bg-blue-400 rounded-full"
                    />
                  )}
                </div>
                <p className="text-xs text-gray-600 dark:text-gray-400 mt-1">
                  {workflow.description}
                </p>
              </div>
              {index === selectedIndex && (
                <div className="ml-2 text-xs font-medium text-blue-600 dark:text-blue-400">
                  ↵
                </div>
              )}
            </div>
          </motion.button>
        ))}
      </div>

      {/* Footer */}
      <div className="px-4 py-2 bg-gray-50 dark:bg-gray-900 border-t border-gray-200 dark:border-gray-700">
        <div className="flex items-center justify-between text-xs text-gray-500 dark:text-gray-400">
          <span>↑↓ Navigate</span>
          <span>↵ Select</span>
          <span>Esc Close</span>
        </div>
      </div>
    </motion.div>
  );
}
