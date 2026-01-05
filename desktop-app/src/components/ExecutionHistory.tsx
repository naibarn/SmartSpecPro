import { useState, useEffect } from "react";
import { useExecutionDatabase } from "../hooks/useExecutionDatabase";
import type { Execution, ExecutionStatus } from "../types/database";

export function ExecutionHistory() {
  const [executions, setExecutions] = useState<Execution[]>([]);
  const [selectedExecution, setSelectedExecution] = useState<Execution | null>(
    null
  );
  const [statusFilter, setStatusFilter] = useState<ExecutionStatus | "all">("all");
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);
  const [showCleanup, setShowCleanup] = useState(false);

  const { loading, error, listExecutions, deleteExecution, deleteOldExecutions } =
    useExecutionDatabase();

  // Load executions
  const loadExecutions = async () => {
    const result = await listExecutions({
      status: statusFilter !== "all" ? statusFilter : undefined,
      limit: 100,
      offset: 0,
    });
    setExecutions(result);
  };

  useEffect(() => {
    loadExecutions();
  }, [statusFilter]);

  // Handle delete
  const handleDelete = async (id: string) => {
    const success = await deleteExecution(id);
    if (success) {
      setDeleteConfirm(null);
      loadExecutions();
    }
  };

  // Handle cleanup
  const handleCleanup = async (days: number) => {
    const count = await deleteOldExecutions(days);
    if (count > 0) {
      setShowCleanup(false);
      loadExecutions();
    }
  };

  // Format date
  const formatDate = (timestamp: number) => {
    return new Date(timestamp * 1000).toLocaleString();
  };

  // Format duration
  const formatDuration = (execution: Execution) => {
    if (!execution.completed_at) return "-";
    const duration = execution.completed_at - execution.started_at;
    if (duration < 60) return `${duration}s`;
    if (duration < 3600) return `${Math.floor(duration / 60)}m ${duration % 60}s`;
    return `${Math.floor(duration / 3600)}h ${Math.floor((duration % 3600) / 60)}m`;
  };

  // Get status badge color
  const getStatusColor = (status: ExecutionStatus) => {
    switch (status) {
      case "running":
        return "bg-blue-100 text-blue-800";
      case "completed":
        return "bg-green-100 text-green-800";
      case "failed":
        return "bg-red-100 text-red-800";
      case "stopped":
        return "bg-gray-100 text-gray-800";
    }
  };

  return (
    <div className="h-full flex flex-col bg-white">
      {/* Header */}
      <div className="border-b border-gray-200 p-4">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-xl font-semibold text-gray-900">
            Execution History
          </h2>
          <div className="flex space-x-2">
            <button
              onClick={() => loadExecutions()}
              className="px-4 py-2 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50 transition-colors"
            >
              🔄 Refresh
            </button>
            <button
              onClick={() => setShowCleanup(true)}
              className="px-4 py-2 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50 transition-colors"
            >
              🗑️ Cleanup
            </button>
          </div>
        </div>

        {/* Status Filter */}
        <div className="flex space-x-2">
          {(["all", "running", "completed", "failed", "stopped"] as const).map(
            (status) => (
              <button
                key={status}
                onClick={() => setStatusFilter(status)}
                className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                  statusFilter === status
                    ? "bg-blue-600 text-white"
                    : "bg-gray-100 text-gray-700 hover:bg-gray-200"
                }`}
              >
                {status.charAt(0).toUpperCase() + status.slice(1)}
              </button>
            )
          )}
        </div>
      </div>

      {/* Error */}
      {error && (
        <div className="mx-4 mt-4 p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">
          {error}
        </div>
      )}

      {/* Loading */}
      {loading && (
        <div className="flex-1 flex items-center justify-center">
          <div className="text-gray-500">Loading executions...</div>
        </div>
      )}

      {/* Empty State */}
      {!loading && executions.length === 0 && (
        <div className="flex-1 flex items-center justify-center">
          <div className="text-center text-gray-500">
            <p className="text-lg mb-2">No executions found</p>
            <p className="text-sm">
              {statusFilter !== "all"
                ? `No ${statusFilter} executions`
                : "Run a workflow to see execution history"}
            </p>
          </div>
        </div>
      )}

      {/* Execution List */}
      {!loading && executions.length > 0 && (
        <div className="flex-1 overflow-auto">
          <table className="w-full">
            <thead className="bg-gray-50 border-b border-gray-200 sticky top-0">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                  Workflow
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                  Status
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                  Started
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                  Duration
                </th>
                <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {executions.map((execution) => (
                <tr
                  key={execution.id}
                  className="hover:bg-gray-50 transition-colors cursor-pointer"
                  onClick={() => setSelectedExecution(execution)}
                >
                  <td className="px-4 py-3 text-sm font-medium text-gray-900">
                    {execution.workflow_name}
                  </td>
                  <td className="px-4 py-3 text-sm">
                    <span
                      className={`px-2 py-1 rounded-full text-xs font-medium ${getStatusColor(
                        execution.status
                      )}`}
                    >
                      {execution.status}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-sm text-gray-600">
                    {formatDate(execution.started_at)}
                  </td>
                  <td className="px-4 py-3 text-sm text-gray-600">
                    {formatDuration(execution)}
                  </td>
                  <td className="px-4 py-3 text-sm text-right space-x-2">
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        setSelectedExecution(execution);
                      }}
                      className="text-blue-600 hover:text-blue-800"
                    >
                      View
                    </button>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        setDeleteConfirm(execution.id);
                      }}
                      className="text-red-600 hover:text-red-800"
                    >
                      Delete
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Execution Details Dialog */}
      {selectedExecution && (
        <ExecutionDetailsDialog
          execution={selectedExecution}
          onClose={() => setSelectedExecution(null)}
        />
      )}

      {/* Delete Confirmation */}
      {deleteConfirm && (
        <DeleteConfirmDialog
          executionName={
            executions.find((e) => e.id === deleteConfirm)?.workflow_name ||
            "this execution"
          }
          onConfirm={() => handleDelete(deleteConfirm)}
          onCancel={() => setDeleteConfirm(null)}
        />
      )}

      {/* Cleanup Dialog */}
      {showCleanup && (
        <CleanupDialog
          onCleanup={handleCleanup}
          onCancel={() => setShowCleanup(false)}
        />
      )}
    </div>
  );
}

// Execution Details Dialog
interface ExecutionDetailsDialogProps {
  execution: Execution;
  onClose: () => void;
}

function ExecutionDetailsDialog({
  execution,
  onClose,
}: ExecutionDetailsDialogProps) {
  const formatDate = (timestamp: number) => {
    return new Date(timestamp * 1000).toLocaleString();
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg shadow-xl w-full max-w-3xl mx-4 max-h-[80vh] overflow-auto">
        <div className="border-b border-gray-200 px-6 py-4 sticky top-0 bg-white">
          <div className="flex items-center justify-between">
            <h3 className="text-lg font-semibold text-gray-900">
              Execution Details
            </h3>
            <button
              onClick={onClose}
              className="text-gray-400 hover:text-gray-600"
            >
              ✕
            </button>
          </div>
        </div>

        <div className="p-6 space-y-4">
          {/* Basic Info */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Workflow
              </label>
              <p className="text-sm text-gray-900">{execution.workflow_name}</p>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Status
              </label>
              <p className="text-sm text-gray-900">{execution.status}</p>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Started At
              </label>
              <p className="text-sm text-gray-900">
                {formatDate(execution.started_at)}
              </p>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Completed At
              </label>
              <p className="text-sm text-gray-900">
                {execution.completed_at
                  ? formatDate(execution.completed_at)
                  : "-"}
              </p>
            </div>
          </div>

          {/* Output */}
          {execution.output && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Output
              </label>
              <pre className="p-3 bg-gray-50 rounded-lg text-xs overflow-auto max-h-64">
                {JSON.stringify(execution.output, null, 2)}
              </pre>
            </div>
          )}

          {/* Error */}
          {execution.error && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Error
              </label>
              <pre className="p-3 bg-red-50 rounded-lg text-xs text-red-700 overflow-auto max-h-64">
                {execution.error}
              </pre>
            </div>
          )}

          {/* IDs */}
          <div className="pt-4 border-t border-gray-200">
            <details className="text-sm">
              <summary className="cursor-pointer text-gray-600 hover:text-gray-900">
                Technical Details
              </summary>
              <div className="mt-2 space-y-2 text-xs text-gray-600">
                <p>
                  <strong>Execution ID:</strong> {execution.id}
                </p>
                <p>
                  <strong>Workflow ID:</strong> {execution.workflow_id}
                </p>
              </div>
            </details>
          </div>
        </div>

        <div className="border-t border-gray-200 px-6 py-4 flex justify-end">
          <button
            onClick={onClose}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}

// Delete Confirmation Dialog
interface DeleteConfirmDialogProps {
  executionName: string;
  onConfirm: () => void;
  onCancel: () => void;
}

function DeleteConfirmDialog({
  executionName,
  onConfirm,
  onCancel,
}: DeleteConfirmDialogProps) {
  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg shadow-xl w-full max-w-md mx-4">
        <div className="p-6">
          <h3 className="text-lg font-semibold text-gray-900 mb-2">
            Delete Execution
          </h3>
          <p className="text-gray-600 mb-6">
            Are you sure you want to delete the execution of{" "}
            <strong>{executionName}</strong>? This action cannot be undone.
          </p>
          <div className="flex justify-end space-x-3">
            <button
              onClick={onCancel}
              className="px-4 py-2 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50 transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={onConfirm}
              className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors"
            >
              Delete
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// Cleanup Dialog
interface CleanupDialogProps {
  onCleanup: (days: number) => void;
  onCancel: () => void;
}

function CleanupDialog({ onCleanup, onCancel }: CleanupDialogProps) {
  const [days, setDays] = useState(30);

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg shadow-xl w-full max-w-md mx-4">
        <div className="p-6">
          <h3 className="text-lg font-semibold text-gray-900 mb-2">
            Cleanup Old Executions
          </h3>
          <p className="text-gray-600 mb-4">
            Delete executions older than:
          </p>
          <div className="mb-6">
            <select
              value={days}
              onChange={(e) => setDays(Number(e.target.value))}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value={7}>7 days</option>
              <option value={14}>14 days</option>
              <option value={30}>30 days</option>
              <option value={60}>60 days</option>
              <option value={90}>90 days</option>
            </select>
          </div>
          <div className="flex justify-end space-x-3">
            <button
              onClick={onCancel}
              className="px-4 py-2 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50 transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={() => onCleanup(days)}
              className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors"
            >
              Delete Old Executions
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
