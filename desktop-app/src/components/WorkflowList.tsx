import { motion } from "framer-motion";
import type { Workflow } from "../types/workflow";

interface WorkflowListProps {
  workflows: Workflow[];
  loading: boolean;
  error: string | null;
  selectedWorkflow: Workflow | null;
  onSelectWorkflow: (workflow: Workflow) => void;
  onReload: () => void;
}

export function WorkflowList({
  workflows,
  loading,
  error,
  selectedWorkflow,
  onSelectWorkflow,
  onReload,
}: WorkflowListProps) {
  if (loading) {
    return (
      <div className="p-6 text-center">
        <motion.div
          animate={{ rotate: 360 }}
          transition={{ duration: 1, repeat: Infinity, ease: "linear" }}
          className="inline-block"
        >
          <div className="w-12 h-12 border-4 border-blue-600 border-t-transparent rounded-full" />
        </motion.div>
        <p className="mt-4 text-sm font-medium text-gray-600">Loading workflows...</p>
      </div>
    );
  }

  if (error) {
    return (
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="p-6"
      >
        <div className="bg-red-50 border-2 border-red-200 rounded-xl p-4">
          <div className="flex items-start">
            <svg className="w-5 h-5 text-red-600 mt-0.5 mr-3" fill="currentColor" viewBox="0 0 20 20">
              <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
            </svg>
            <div className="flex-1">
              <p className="text-sm font-medium text-red-800">{error}</p>
              <button
                onClick={onReload}
                className="mt-3 text-sm text-red-600 hover:text-red-800 font-semibold"
              >
                Try again →
              </button>
            </div>
          </div>
        </div>
      </motion.div>
    );
  }

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-sm font-bold text-gray-700 uppercase tracking-wider">
          Workflows ({workflows.length})
        </h2>
        <motion.button
          whileHover={{ scale: 1.1, rotate: 180 }}
          whileTap={{ scale: 0.9 }}
          onClick={onReload}
          className="p-2 text-gray-500 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-all"
          title="Reload workflows"
        >
          <svg
            className="h-5 w-5"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
            />
          </svg>
        </motion.button>
      </div>

      <div className="space-y-3">
        {workflows.map((workflow, index) => (
          <motion.button
            key={workflow.name}
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: index * 0.1, duration: 0.3 }}
            whileHover={{ scale: 1.02, x: 4 }}
            whileTap={{ scale: 0.98 }}
            onClick={() => onSelectWorkflow(workflow)}
            className={`w-full text-left p-4 rounded-xl transition-all duration-200 ${
              selectedWorkflow?.name === workflow.name
                ? "bg-gradient-to-r from-blue-50 to-indigo-50 border-2 border-blue-500 shadow-lg shadow-blue-500/20"
                : "bg-gray-50 border-2 border-transparent hover:bg-white hover:border-gray-200 hover:shadow-md"
            }`}
          >
            <div className="flex items-start justify-between">
              <div className="flex-1">
                <div className="font-semibold text-sm text-gray-900 mb-1">
                  {workflow.name}
                </div>
                <div className="text-xs text-gray-600 line-clamp-2 leading-relaxed">
                  {workflow.description}
                </div>
              </div>
              {selectedWorkflow?.name === workflow.name && (
                <motion.svg
                  initial={{ scale: 0 }}
                  animate={{ scale: 1 }}
                  transition={{ type: "spring", stiffness: 500, damping: 30 }}
                  className="w-5 h-5 text-blue-600 ml-2 flex-shrink-0"
                  fill="currentColor"
                  viewBox="0 0 20 20"
                >
                  <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                </motion.svg>
              )}
            </div>
          </motion.button>
        ))}
      </div>
    </div>
  );
}
