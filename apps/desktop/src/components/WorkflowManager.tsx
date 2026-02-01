import { useState, useEffect, useRef } from "react";
import { useWorkflowDatabase } from "../hooks/useWorkflowDatabase";
import type { Workflow, CreateWorkflowRequest } from "../types/database";
import { ConfigEditor } from "./ConfigEditor";
import { TemplateSelector } from "./TemplateSelector";
import type { WorkflowTemplate } from "../data/templates";
import {
  exportWorkflowsToJSON,
  exportWorkflowsToCSV,
  downloadFile,
  importWorkflowsFromJSON,
} from "../utils/export";

export function WorkflowManager() {
  const [workflows, setWorkflows] = useState<Workflow[]>([]);
  const [selectedWorkflow, setSelectedWorkflow] = useState<Workflow | null>(null);
  const [showDialog, setShowDialog] = useState(false);
  const [dialogMode, setDialogMode] = useState<"create" | "edit">("create");
  const [searchTerm, setSearchTerm] = useState("");
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);
  const [showTemplateSelector, setShowTemplateSelector] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const {
    loading,
    error,
    listWorkflows,
    createWorkflow,
    updateWorkflow,
    deleteWorkflow,
  } = useWorkflowDatabase();

  // Load workflows
  const loadWorkflows = async () => {
    const result = await listWorkflows({
      name: searchTerm || undefined,
      limit: 50,
      offset: 0,
    });
    setWorkflows(result);
  };

  useEffect(() => {
    loadWorkflows();
  }, [searchTerm]);

  // Handle create
  const handleCreate = () => {
    setSelectedWorkflow(null);
    setDialogMode("create");
    setShowDialog(true);
  };

  // Handle create from template
  const handleCreateFromTemplate = (template: WorkflowTemplate) => {
    setSelectedWorkflow({
      id: "",
      name: template.name,
      description: template.description,
      config: template.config,
      version: "1.0.0",
      created_at: 0,
      updated_at: 0,
    } as Workflow);
    setDialogMode("create");
    setShowTemplateSelector(false);
    setShowDialog(true);
  };

  // Handle edit
  const handleEdit = (workflow: Workflow) => {
    setSelectedWorkflow(workflow);
    setDialogMode("edit");
    setShowDialog(true);
  };

  // Handle delete
  const handleDelete = async (id: string) => {
    const success = await deleteWorkflow(id);
    if (success) {
      setDeleteConfirm(null);
      loadWorkflows();
    }
  };

  // Handle save
  const handleSave = async (data: CreateWorkflowRequest) => {
    if (dialogMode === "create") {
      const result = await createWorkflow(data);
      if (result) {
        setShowDialog(false);
        loadWorkflows();
      }
    } else if (selectedWorkflow) {
      const success = await updateWorkflow(selectedWorkflow.id, data);
      if (success) {
        setShowDialog(false);
        loadWorkflows();
      }
    }
  };

  // Format date
  const formatDate = (timestamp: number) => {
    return new Date(timestamp * 1000).toLocaleString();
  };

  // Handle export
  const handleExport = (format: "json" | "csv") => {
    if (workflows.length === 0) {
      alert("No workflows to export");
      return;
    }

    const timestamp = new Date().toISOString().split("T")[0];
    if (format === "json") {
      const content = exportWorkflowsToJSON(workflows);
      downloadFile(content, `workflows-${timestamp}.json`, "application/json");
    } else {
      const content = exportWorkflowsToCSV(workflows);
      downloadFile(content, `workflows-${timestamp}.csv`, "text/csv");
    }
  };

  // Handle import
  const handleImport = () => {
    fileInputRef.current?.click();
  };

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      const text = await file.text();
      const imported = importWorkflowsFromJSON(text);
      
      // Import each workflow
      let successCount = 0;
      for (const workflow of imported) {
        const result = await createWorkflow({
          name: workflow.name,
          description: workflow.description,
          config: workflow.config,
        });
        if (result) successCount++;
      }

      alert(`Successfully imported ${successCount} workflow(s)`);
      loadWorkflows();
    } catch (err) {
      alert(`Import failed: ${(err as Error).message}`);
    }

    // Reset input
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };

  return (
    <div className="h-full flex flex-col bg-white">
      {/* Header */}
      <div className="border-b border-gray-200 p-4">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-xl font-semibold text-gray-900">
            Workflow Management
          </h2>
          <div className="flex space-x-2">
            {/* Export/Import Dropdown */}
            <div className="relative group">
              <button className="px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors">
                ⬇️ Export/Import
              </button>
              <div className="hidden group-hover:block absolute right-0 mt-1 w-48 bg-white border border-gray-200 rounded-lg shadow-lg z-10">
                <div className="py-1">
                  <div className="px-3 py-1 text-xs font-semibold text-gray-500 uppercase">Export</div>
                  <button
                    onClick={() => handleExport("json")}
                    className="w-full text-left px-3 py-2 text-sm text-gray-700 hover:bg-gray-100"
                  >
                    Export as JSON
                  </button>
                  <button
                    onClick={() => handleExport("csv")}
                    className="w-full text-left px-3 py-2 text-sm text-gray-700 hover:bg-gray-100"
                  >
                    Export as CSV
                  </button>
                  <div className="border-t border-gray-200 my-1"></div>
                  <div className="px-3 py-1 text-xs font-semibold text-gray-500 uppercase">Import</div>
                  <button
                    onClick={handleImport}
                    className="w-full text-left px-3 py-2 text-sm text-gray-700 hover:bg-gray-100"
                  >
                    Import from JSON
                  </button>
                </div>
              </div>
            </div>
            <button
              onClick={() => setShowTemplateSelector(true)}
              className="px-4 py-2 border border-blue-600 text-blue-600 rounded-lg hover:bg-blue-50 transition-colors"
            >
              📋 From Template
            </button>
            <button
              onClick={handleCreate}
              className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
            >
              + New Workflow
            </button>
          </div>
        </div>

        {/* Search */}
        <div className="relative">
          <input
            type="text"
            placeholder="Search workflows..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
          {searchTerm && (
            <button
              onClick={() => setSearchTerm("")}
              className="absolute right-3 top-2.5 text-gray-400 hover:text-gray-600"
            >
              ✕
            </button>
          )}
        </div>

        {/* Hidden file input for import */}
        <input
          ref={fileInputRef}
          type="file"
          accept=".json"
          onChange={handleFileSelect}
          className="hidden"
        />
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
          <div className="text-gray-500">Loading workflows...</div>
        </div>
      )}

      {/* Workflow List */}
      {!loading && workflows.length === 0 && (
        <div className="flex-1 flex items-center justify-center">
          <div className="text-center text-gray-500">
            <p className="text-lg mb-2">No workflows found</p>
            <p className="text-sm">Create your first workflow to get started</p>
          </div>
        </div>
      )}

      {!loading && workflows.length > 0 && (
        <div className="flex-1 overflow-auto">
          <table className="w-full">
            <thead className="bg-gray-50 border-b border-gray-200 sticky top-0">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                  Name
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                  Description
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                  Version
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                  Created
                </th>
                <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {workflows.map((workflow) => (
                <tr
                  key={workflow.id}
                  className="hover:bg-gray-50 transition-colors"
                >
                  <td className="px-4 py-3 text-sm font-medium text-gray-900">
                    {workflow.name}
                  </td>
                  <td className="px-4 py-3 text-sm text-gray-600">
                    {workflow.description || "-"}
                  </td>
                  <td className="px-4 py-3 text-sm text-gray-600">
                    {workflow.version}
                  </td>
                  <td className="px-4 py-3 text-sm text-gray-600">
                    {formatDate(workflow.created_at)}
                  </td>
                  <td className="px-4 py-3 text-sm text-right space-x-2">
                    <button
                      onClick={() => handleEdit(workflow)}
                      className="text-blue-600 hover:text-blue-800"
                    >
                      Edit
                    </button>
                    <button
                      onClick={() => setDeleteConfirm(workflow.id)}
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

      {/* Create/Edit Dialog */}
      {showDialog && (
        <WorkflowDialog
          mode={dialogMode}
          workflow={selectedWorkflow}
          onSave={handleSave}
          onCancel={() => setShowDialog(false)}
        />
      )}

      {/* Delete Confirmation */}
      {deleteConfirm && (
        <DeleteConfirmDialog
          workflowName={
            workflows.find((w) => w.id === deleteConfirm)?.name || "this workflow"
          }
          onConfirm={() => handleDelete(deleteConfirm)}
          onCancel={() => setDeleteConfirm(null)}
        />
      )}

      {/* Template Selector */}
      {showTemplateSelector && (
        <TemplateSelector
          onSelect={handleCreateFromTemplate}
          onCancel={() => setShowTemplateSelector(false)}
        />
      )}
    </div>
  );
}

// Workflow Dialog Component
interface WorkflowDialogProps {
  mode: "create" | "edit";
  workflow: Workflow | null;
  onSave: (data: CreateWorkflowRequest) => void;
  onCancel: () => void;
}

function WorkflowDialog({ mode, workflow, onSave, onCancel }: WorkflowDialogProps) {
  const [name, setName] = useState(workflow?.name || "");
  const [description, setDescription] = useState(workflow?.description || "");
  const [config, setConfig] = useState<Record<string, any>>(
    workflow?.config || {}
  );
  const [showConfigEditor, setShowConfigEditor] = useState(false);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    onSave({
      name,
      description: description || undefined,
      config: Object.keys(config).length > 0 ? config : undefined,
    });
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg shadow-xl w-full max-w-2xl mx-4">
        <div className="border-b border-gray-200 px-6 py-4">
          <h3 className="text-lg font-semibold text-gray-900">
            {mode === "create" ? "Create Workflow" : "Edit Workflow"}
          </h3>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          {/* Name */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Name *
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="My Workflow"
            />
          </div>

          {/* Description */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Description
            </label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={3}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="Workflow description..."
            />
          </div>

          {/* Config */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Configuration
            </label>
            <div className="border border-gray-300 rounded-lg p-3 bg-gray-50">
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm text-gray-600">
                  {Object.keys(config).length} field(s) configured
                </span>
                <button
                  type="button"
                  onClick={() => setShowConfigEditor(true)}
                  className="px-3 py-1 text-sm bg-blue-600 text-white rounded hover:bg-blue-700"
                >
                  ⚙️ Edit Config
                </button>
              </div>
              {Object.keys(config).length > 0 && (
                <div className="text-xs text-gray-500 font-mono bg-white p-2 rounded max-h-20 overflow-auto">
                  {JSON.stringify(config, null, 2)}
                </div>
              )}
            </div>
          </div>

          {/* Actions */}
          <div className="flex justify-end space-x-3 pt-4">
            <button
              type="button"
              onClick={onCancel}
              className="px-4 py-2 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50 transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
            >
              {mode === "create" ? "Create" : "Save"}
            </button>
          </div>
        </form>

        {/* Config Editor Modal */}
        {showConfigEditor && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
            <div className="bg-white rounded-lg shadow-xl w-full max-w-3xl mx-4 max-h-[90vh] overflow-hidden flex flex-col">
              <div className="border-b border-gray-200 px-6 py-4">
                <h3 className="text-lg font-semibold text-gray-900">
                  Edit Configuration
                </h3>
              </div>
              <div className="p-6 flex-1 overflow-auto">
                <ConfigEditor
                  initialConfig={config}
                  onSave={(newConfig) => {
                    setConfig(newConfig);
                    setShowConfigEditor(false);
                  }}
                  onCancel={() => setShowConfigEditor(false)}
                />
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// Delete Confirmation Dialog
interface DeleteConfirmDialogProps {
  workflowName: string;
  onConfirm: () => void;
  onCancel: () => void;
}

function DeleteConfirmDialog({
  workflowName,
  onConfirm,
  onCancel,
}: DeleteConfirmDialogProps) {
  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg shadow-xl w-full max-w-md mx-4">
        <div className="p-6">
          <h3 className="text-lg font-semibold text-gray-900 mb-2">
            Delete Workflow
          </h3>
          <p className="text-gray-600 mb-6">
            Are you sure you want to delete <strong>{workflowName}</strong>? This
            action cannot be undone.
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
