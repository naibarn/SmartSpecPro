// Workspace Selector Component
// Dropdown for selecting and managing workspaces

import { useState } from 'react';
import { 
  useWorkspace, 
  WorkspaceMetadata, 
  formatDate,
  getWorkspaceStats
} from '../../services/workspaceService';

interface WorkspaceSelectorProps {
  className?: string;
}

export function WorkspaceSelector({ className = '' }: WorkspaceSelectorProps) {
  const { 
    currentWorkspace, 
    workspaces, 
    loading, 
    setCurrentWorkspace,
    createNewWorkspace,
    refreshWorkspaces 
  } = useWorkspace();
  
  const [isOpen, setIsOpen] = useState(false);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [newWorkspaceName, setNewWorkspaceName] = useState('');
  const [newWorkspaceGitRemote, setNewWorkspaceGitRemote] = useState('');
  const [creating, setCreating] = useState(false);

  const handleSelectWorkspace = async (workspace: WorkspaceMetadata) => {
    setCurrentWorkspace(workspace);
    setIsOpen(false);
  };

  const handleCreateWorkspace = async () => {
    if (!newWorkspaceName.trim()) return;
    
    setCreating(true);
    try {
      await createNewWorkspace(
        newWorkspaceName.trim(),
        newWorkspaceGitRemote.trim() || undefined
      );
      setNewWorkspaceName('');
      setNewWorkspaceGitRemote('');
      setShowCreateModal(false);
    } catch (error) {
      console.error('Failed to create workspace:', error);
    } finally {
      setCreating(false);
    }
  };

  if (loading) {
    return (
      <div className={`flex items-center gap-2 ${className}`}>
        <div className="animate-pulse bg-gray-200 dark:bg-gray-700 h-8 w-40 rounded"></div>
      </div>
    );
  }

  return (
    <div className={`relative ${className}`}>
      {/* Selector Button */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center gap-2 px-3 py-2 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-750 transition-colors"
      >
        <svg className="w-5 h-5 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" />
        </svg>
        <span className="text-sm font-medium text-gray-700 dark:text-gray-200 max-w-[150px] truncate">
          {currentWorkspace?.name || 'Select Workspace'}
        </span>
        <svg className={`w-4 h-4 text-gray-400 transition-transform ${isOpen ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {/* Dropdown */}
      {isOpen && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setIsOpen(false)} />
          <div className="absolute top-full left-0 mt-1 w-72 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg shadow-lg z-20 overflow-hidden">
            <div className="max-h-64 overflow-y-auto">
              {workspaces.length === 0 ? (
                <div className="p-4 text-center text-gray-500 dark:text-gray-400 text-sm">
                  No workspaces yet
                </div>
              ) : (
                workspaces.map((workspace) => (
                  <WorkspaceItem
                    key={workspace.id}
                    workspace={workspace}
                    isSelected={currentWorkspace?.id === workspace.id}
                    onSelect={() => handleSelectWorkspace(workspace)}
                  />
                ))
              )}
            </div>
            <div className="border-t border-gray-200 dark:border-gray-700 p-2">
              <button
                onClick={() => { setShowCreateModal(true); setIsOpen(false); }}
                className="w-full flex items-center gap-2 px-3 py-2 text-sm text-blue-600 dark:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-900/20 rounded-md transition-colors"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                </svg>
                Create New Workspace
              </button>
            </div>
          </div>
        </>
      )}

      {/* Create Workspace Modal */}
      {showCreateModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl w-full max-w-md mx-4">
            <div className="p-4 border-b border-gray-200 dark:border-gray-700">
              <h3 className="text-lg font-semibold text-gray-900 dark:text-white">Create New Workspace</h3>
            </div>
            <div className="p-4 space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Workspace Name *</label>
                <input
                  type="text"
                  value={newWorkspaceName}
                  onChange={(e) => setNewWorkspaceName(e.target.value)}
                  placeholder="My Project"
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500"
                  autoFocus
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Git Remote URL (optional)</label>
                <input
                  type="text"
                  value={newWorkspaceGitRemote}
                  onChange={(e) => setNewWorkspaceGitRemote(e.target.value)}
                  placeholder="https://github.com/user/repo.git"
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500"
                />
              </div>
            </div>
            <div className="p-4 border-t border-gray-200 dark:border-gray-700 flex justify-end gap-2">
              <button onClick={() => setShowCreateModal(false)} className="px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-md">Cancel</button>
              <button onClick={handleCreateWorkspace} disabled={!newWorkspaceName.trim() || creating} className="px-4 py-2 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 rounded-md">
                {creating ? 'Creating...' : 'Create'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function WorkspaceItem({ workspace, isSelected, onSelect }: { workspace: WorkspaceMetadata; isSelected: boolean; onSelect: () => void }) {
  return (
    <button
      onClick={onSelect}
      className={`w-full flex items-start gap-3 p-3 text-left hover:bg-gray-50 dark:hover:bg-gray-750 transition-colors ${isSelected ? 'bg-blue-50 dark:bg-blue-900/20' : ''}`}
    >
      <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${isSelected ? 'bg-blue-100 text-blue-600' : 'bg-gray-100 dark:bg-gray-700 text-gray-500'}`}>
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" />
        </svg>
      </div>
      <div className="flex-1 min-w-0">
        <span className={`text-sm font-medium truncate block ${isSelected ? 'text-blue-600 dark:text-blue-400' : 'text-gray-900 dark:text-white'}`}>{workspace.name}</span>
        <span className="text-xs text-gray-500 dark:text-gray-400">{formatDate(workspace.last_accessed_at)}</span>
      </div>
    </button>
  );
}

export default WorkspaceSelector;
