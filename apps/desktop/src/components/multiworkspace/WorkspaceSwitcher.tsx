// Workspace Switcher Component
// Quick workspace switching UI

import { useState } from 'react';
import {
  useMultiWorkspace,
  Workspace,
  WorkspaceType,
  getWorkspaceTypeIcon,
  getWorkspaceTypeLabel,
  formatLastAccessed,
} from '../../services/multiWorkspaceService';

interface WorkspaceSwitcherProps {
  className?: string;
}

export function WorkspaceSwitcher({ className = '' }: WorkspaceSwitcherProps) {
  const {
    workspaces,
    activeWorkspace,
    recentWorkspaces,
    templates,
    isLoading,
    switchTo,
    create,
  } = useMultiWorkspace();

  const [isOpen, setIsOpen] = useState(false);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [newWorkspaceName, setNewWorkspaceName] = useState('');
  const [newWorkspaceType, setNewWorkspaceType] = useState<WorkspaceType>('personal');
  const [selectedTemplate, setSelectedTemplate] = useState<string | undefined>();

  const handleSwitch = async (workspaceId: string) => {
    await switchTo(workspaceId);
    setIsOpen(false);
  };

  const handleCreate = async () => {
    if (!newWorkspaceName.trim()) return;
    await create(newWorkspaceName, newWorkspaceType, selectedTemplate);
    setShowCreateModal(false);
    setNewWorkspaceName('');
    setNewWorkspaceType('personal');
    setSelectedTemplate(undefined);
  };

  return (
    <div className={`relative ${className}`}>
      {/* Trigger Button */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center gap-2 px-3 py-2 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
      >
        {activeWorkspace ? (
          <>
            <span className="text-lg">
              {activeWorkspace.icon || getWorkspaceTypeIcon(activeWorkspace.workspace_type)}
            </span>
            <span className="font-medium text-gray-900 dark:text-white max-w-32 truncate">
              {activeWorkspace.name}
            </span>
          </>
        ) : (
          <span className="text-gray-500">Select Workspace</span>
        )}
        <svg className="w-4 h-4 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {/* Dropdown */}
      {isOpen && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setIsOpen(false)} />
          <div className="absolute top-full left-0 mt-2 w-80 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg shadow-lg z-20">
            {/* Recent Workspaces */}
            {recentWorkspaces.length > 0 && (
              <div className="p-2 border-b border-gray-200 dark:border-gray-700">
                <p className="px-2 py-1 text-xs font-semibold text-gray-500 uppercase">Recent</p>
                {recentWorkspaces.slice(0, 3).map((recent) => (
                  <button
                    key={recent.workspace_id}
                    onClick={() => handleSwitch(recent.workspace_id)}
                    className={`w-full flex items-center gap-3 px-2 py-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 ${
                      activeWorkspace?.id === recent.workspace_id ? 'bg-blue-50 dark:bg-blue-900/30' : ''
                    }`}
                  >
                    <span className="text-lg">
                      {recent.icon || getWorkspaceTypeIcon(recent.workspace_type)}
                    </span>
                    <div className="flex-1 text-left">
                      <p className="font-medium text-gray-900 dark:text-white text-sm">
                        {recent.name}
                      </p>
                      <p className="text-xs text-gray-500">
                        {formatLastAccessed(recent.last_accessed_at)}
                      </p>
                    </div>
                    {activeWorkspace?.id === recent.workspace_id && (
                      <span className="text-blue-500">✓</span>
                    )}
                  </button>
                ))}
              </div>
            )}

            {/* All Workspaces */}
            <div className="p-2 max-h-60 overflow-y-auto">
              <p className="px-2 py-1 text-xs font-semibold text-gray-500 uppercase">All Workspaces</p>
              {workspaces.map((workspace) => (
                <button
                  key={workspace.id}
                  onClick={() => handleSwitch(workspace.id)}
                  className={`w-full flex items-center gap-3 px-2 py-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 ${
                    activeWorkspace?.id === workspace.id ? 'bg-blue-50 dark:bg-blue-900/30' : ''
                  }`}
                >
                  <span
                    className="w-8 h-8 flex items-center justify-center rounded-lg text-lg"
                    style={{ backgroundColor: workspace.color || '#e5e7eb' }}
                  >
                    {workspace.icon || getWorkspaceTypeIcon(workspace.workspace_type)}
                  </span>
                  <div className="flex-1 text-left">
                    <p className="font-medium text-gray-900 dark:text-white text-sm">
                      {workspace.name}
                    </p>
                    <p className="text-xs text-gray-500">
                      {getWorkspaceTypeLabel(workspace.workspace_type)} • {workspace.members.length} members
                    </p>
                  </div>
                  {workspace.sync_enabled && (
                    <span className="text-green-500 text-xs">🔄</span>
                  )}
                </button>
              ))}
            </div>

            {/* Create New */}
            <div className="p-2 border-t border-gray-200 dark:border-gray-700">
              <button
                onClick={() => {
                  setIsOpen(false);
                  setShowCreateModal(true);
                }}
                className="w-full flex items-center gap-2 px-2 py-2 text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-900/30 rounded-lg"
              >
                <span>+</span>
                <span>Create New Workspace</span>
              </button>
            </div>
          </div>
        </>
      )}

      {/* Create Modal */}
      {showCreateModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white dark:bg-gray-800 rounded-xl shadow-xl w-full max-w-md p-6">
            <h2 className="text-xl font-semibold text-gray-900 dark:text-white mb-4">
              Create New Workspace
            </h2>

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Name
                </label>
                <input
                  type="text"
                  value={newWorkspaceName}
                  onChange={(e) => setNewWorkspaceName(e.target.value)}
                  placeholder="My Workspace"
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Type
                </label>
                <div className="grid grid-cols-2 gap-2">
                  {(['personal', 'team', 'organization', 'shared'] as WorkspaceType[]).map((type) => (
                    <button
                      key={type}
                      onClick={() => setNewWorkspaceType(type)}
                      className={`flex items-center gap-2 px-3 py-2 border rounded-lg ${
                        newWorkspaceType === type
                          ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/30'
                          : 'border-gray-300 dark:border-gray-600'
                      }`}
                    >
                      <span>{getWorkspaceTypeIcon(type)}</span>
                      <span className="text-sm">{getWorkspaceTypeLabel(type)}</span>
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Template (Optional)
                </label>
                <select
                  value={selectedTemplate || ''}
                  onChange={(e) => setSelectedTemplate(e.target.value || undefined)}
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700"
                >
                  <option value="">No template</option>
                  {templates.map((template) => (
                    <option key={template.id} value={template.id}>
                      {template.icon} {template.name}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="flex justify-end gap-2 mt-6">
              <button
                onClick={() => setShowCreateModal(false)}
                className="px-4 py-2 text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg"
              >
                Cancel
              </button>
              <button
                onClick={handleCreate}
                disabled={!newWorkspaceName.trim()}
                className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
              >
                Create
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default WorkspaceSwitcher;
