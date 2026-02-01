import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import type { Workflow, WorkflowArgs } from "../types/workflow";
import { Button } from "./ui/button";
import { LLMSelector, type LLMModel } from "./LLMSelector";
import { WorkflowPicker } from "./WorkflowPicker";
import { useTabs } from "../contexts/TabContext";

interface ChatInterfaceProps {
  workflow: Workflow | null;
  onRun: (workflow: Workflow, args: WorkflowArgs) => Promise<void>;
  running: boolean;
  mode: string;
  workflows: Workflow[];
  onWorkflowChange: (workflow: Workflow | null) => void;
}

export function ChatInterface({
  workflow,
  onRun,
  running,
  mode,
  workflows,
  onWorkflowChange,
}: ChatInterfaceProps) {
  const [input, setInput] = useState("");
  const [llmModel, setLLMModel] = useState<LLMModel>("gpt-4-turbo");
  const [showWorkflowPicker, setShowWorkflowPicker] = useState(false);
  const [workflowFilter, setWorkflowFilter] = useState("");
  const { activeTab, addMessage } = useTabs();

  const handleInputChange = (value: string) => {
    setInput(value);

    // Check for / command
    if (value.startsWith("/")) {
      const filter = value.slice(1); // Remove /
      setWorkflowFilter(filter);
      setShowWorkflowPicker(true);
    } else {
      setShowWorkflowPicker(false);
      setWorkflowFilter("");
    }
  };

  const handleWorkflowSelect = (selectedWorkflow: Workflow) => {
    onWorkflowChange(selectedWorkflow);
    setInput("");
    setShowWorkflowPicker(false);
    setWorkflowFilter("");
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!workflow || !input.trim() || running || showWorkflowPicker || !activeTab) return;

    const userMessage = input.trim();

    // Add user message to tab history
    addMessage(activeTab.id, {
      role: "user",
      content: userMessage,
      workflowName: workflow.name,
    });

    const args: WorkflowArgs = {
      spec_id: userMessage,
      category: "general",
      mode: mode,
      platform: "web",
    };

    try {
      await onRun(workflow, args);
      
      // Add system message indicating workflow started
      addMessage(activeTab.id, {
        role: "system",
        content: `Started workflow: ${workflow.name}`,
        workflowName: workflow.name,
      });
    } catch (error) {
      // Add error message to tab history
      addMessage(activeTab.id, {
        role: "system",
        content: `Error: ${error instanceof Error ? error.message : "Unknown error"}`,
      });
    }

    setInput("");
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    // Don't submit if workflow picker is open
    if (showWorkflowPicker) {
      return;
    }

    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSubmit(e as any);
    }
  };

  return (
    <div className="flex flex-col h-full">
      {/* Input Area */}
      <div className="flex-1 flex items-end p-4">
        <motion.form
          initial={{ y: 20, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          onSubmit={handleSubmit}
          className="w-full max-w-4xl mx-auto relative"
        >
          {/* Workflow Picker */}
          <AnimatePresence>
            {showWorkflowPicker && (
              <WorkflowPicker
                workflows={workflows}
                onSelect={handleWorkflowSelect}
                onClose={() => {
                  setShowWorkflowPicker(false);
                  setWorkflowFilter("");
                  setInput("");
                }}
                filterText={workflowFilter}
              />
            )}
          </AnimatePresence>

          <div className="bg-white dark:bg-gray-800 border-2 border-gray-200 dark:border-gray-700 rounded-2xl shadow-lg overflow-hidden">
            {/* Textarea */}
            <textarea
              value={input}
              onChange={(e) => handleInputChange(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder={
                workflow
                  ? `Type your task here... (e.g., "Generate spec for user authentication") or type / to change workflow`
                  : "Type / to select a workflow..."
              }
              className="w-full px-6 py-4 bg-transparent text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-gray-500 resize-none focus:outline-none"
              rows={3}
              disabled={running}
            />

            {/* Bottom Bar */}
            <div className="flex items-center justify-between px-4 py-3 bg-gray-50 dark:bg-gray-900 border-t border-gray-200 dark:border-gray-700">
              {/* Left: Character Count */}
              <div className="flex items-center space-x-4">
                <span className="text-xs font-medium text-gray-500 dark:text-gray-400">
                  {input.length} characters
                </span>
                {workflow && (
                  <div className="flex items-center space-x-2">
                    <span className="text-xs font-semibold text-blue-600 dark:text-blue-400">
                      {workflow.name}
                    </span>
                    <button
                      type="button"
                      onClick={() => onWorkflowChange(null)}
                      className="text-xs text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
                      title="Clear workflow"
                    >
                      ✕
                    </button>
                  </div>
                )}
                {activeTab && (
                  <div className="flex items-center space-x-2">
                    <span className="text-xs text-gray-500 dark:text-gray-400">
                      Branch: <span className="font-mono">{activeTab.branch}</span>
                    </span>
                  </div>
                )}
              </div>

              {/* Right: LLM Selector and Submit */}
              <div className="flex items-center space-x-3">
                <LLMSelector
                  selectedModel={llmModel}
                  onModelChange={setLLMModel}
                />

                <Button
                  type="submit"
                  disabled={!workflow || !input.trim() || running || showWorkflowPicker}
                  size="sm"
                  className="min-w-[100px]"
                >
                  {running ? (
                    <>
                      <motion.div
                        animate={{ rotate: 360 }}
                        transition={{ duration: 1, repeat: Infinity, ease: "linear" }}
                        className="w-4 h-4 border-2 border-white border-t-transparent rounded-full mr-2"
                      />
                      Running...
                    </>
                  ) : (
                    <>
                      <svg
                        className="w-4 h-4 mr-2"
                        fill="none"
                        viewBox="0 0 24 24"
                        stroke="currentColor"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2}
                          d="M13 10V3L4 14h7v7l9-11h-7z"
                        />
                      </svg>
                      Run
                    </>
                  )}
                </Button>
              </div>
            </div>
          </div>

          {/* Hint */}
          <div className="mt-2 text-center">
            <p className="text-xs text-gray-500 dark:text-gray-400">
              Press <kbd className="px-2 py-1 bg-gray-100 dark:bg-gray-800 rounded text-xs font-mono">Enter</kbd> to submit, or{" "}
              <kbd className="px-2 py-1 bg-gray-100 dark:bg-gray-800 rounded text-xs font-mono">Shift + Enter</kbd> for new line
            </p>
          </div>
        </motion.form>
      </div>
    </div>
  );
}
