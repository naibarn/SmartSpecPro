import { motion } from "framer-motion";
import { useTabs, type ConversationMessage } from "../contexts/TabContext";
import { ExecutionItem, type WorkflowExecution } from "./ExecutionItem";
import { useState } from "react";

export function ConversationHistory() {
  const { activeTab } = useTabs();
  const [executions] = useState<WorkflowExecution[]>([]);

  // Mock executions for now - will be replaced with real data from workflow execution
  // This will be populated from actual workflow executions

  if (!activeTab || activeTab.conversationHistory.length === 0) {
    return (
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="flex items-center justify-center h-full"
      >
        <div className="text-center p-8">
          <motion.div
            animate={{
              scale: [1, 1.1, 1],
              rotate: [0, 5, -5, 0],
            }}
            transition={{
              duration: 3,
              repeat: Infinity,
              ease: "easeInOut",
            }}
            className="inline-flex items-center justify-center w-24 h-24 rounded-full bg-gradient-to-br from-blue-100 to-indigo-100 dark:from-blue-900/30 dark:to-indigo-900/30 mb-6"
          >
            <svg
              className="w-12 h-12 text-blue-600 dark:text-blue-400"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z"
              />
            </svg>
          </motion.div>
          <h3 className="text-xl font-bold text-gray-900 dark:text-white mb-2">
            Welcome to SmartSpec Pro
          </h3>
          <p className="text-sm text-gray-600 dark:text-gray-400 max-w-md">
            Select a mode below and start typing your task to get started
          </p>
        </div>
      </motion.div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto p-4 space-y-4">
      {/* Workflow Executions */}
      {executions.map((execution) => (
        <ExecutionItem key={execution.id} execution={execution} />
      ))}

      {/* Conversation Messages */}
      {activeTab.conversationHistory.map((message) => (
        <MessageBubble key={message.id} message={message} />
      ))}
    </div>
  );
}

function MessageBubble({ message }: { message: ConversationMessage }) {
  const isUser = message.role === "user";
  const isSystem = message.role === "system";

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className={`flex ${isUser ? "justify-end" : "justify-start"}`}
    >
      <div
        className={`max-w-[80%] rounded-2xl px-4 py-3 ${
          isUser
            ? "bg-blue-600 text-white"
            : isSystem
            ? "bg-yellow-100 dark:bg-yellow-900/30 text-yellow-900 dark:text-yellow-200 border border-yellow-300 dark:border-yellow-700"
            : "bg-gray-100 dark:bg-gray-800 text-gray-900 dark:text-white"
        }`}
      >
        {message.workflowName && (
          <div className="text-xs font-semibold mb-1 opacity-75">
            {message.workflowName}
          </div>
        )}
        <div className="text-sm whitespace-pre-wrap">{message.content}</div>
        <div className="text-xs mt-1 opacity-60">
          {new Date(message.timestamp).toLocaleTimeString()}
        </div>
      </div>
    </motion.div>
  );
}
