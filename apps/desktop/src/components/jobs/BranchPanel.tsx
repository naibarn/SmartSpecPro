// Branch Panel Component
// Git branch management panel

import { useState } from 'react';
import { useJobs, Branch } from '../../services/jobService';

interface BranchPanelProps {
  className?: string;
}

export function BranchPanel({ className = '' }: BranchPanelProps) {
  const { branches, currentBranch, switchBranch, refreshBranches } = useJobs();
  const [isLoading, setIsLoading] = useState(false);

  const handleSwitchBranch = async (branchName: string) => {
    if (branchName === currentBranch?.name) return;
    setIsLoading(true);
    try {
      await switchBranch(branchName);
    } finally {
      setIsLoading(false);
    }
  };

  const localBranches = branches.filter(b => !b.is_remote);
  const remoteBranches = branches.filter(b => b.is_remote && !localBranches.some(l => l.name === b.name));

  return (
    <div className={`flex flex-col h-full bg-white dark:bg-gray-800 ${className}`}>
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200 dark:border-gray-700">
        <h3 className="font-semibold text-gray-900 dark:text-white">Branches</h3>
        <button
          onClick={refreshBranches}
          className="p-1 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200"
          title="Refresh"
        >
          🔄
        </button>
      </div>

      {/* Current Branch */}
      {currentBranch && (
        <div className="px-4 py-3 bg-blue-50 dark:bg-blue-900/20 border-b border-gray-200 dark:border-gray-700">
          <div className="text-xs text-gray-500 dark:text-gray-400 mb-1">Current Branch</div>
          <div className="flex items-center gap-2">
            <span className="text-green-500">●</span>
            <span className="font-mono text-sm font-medium text-gray-900 dark:text-white">
              {currentBranch.name}
            </span>
          </div>
          {currentBranch.last_commit && (
            <div className="mt-2 text-xs text-gray-500">
              <span className="font-mono">{currentBranch.last_commit.short_hash}</span>
              <span className="mx-1">-</span>
              <span className="truncate">{currentBranch.last_commit.message}</span>
            </div>
          )}
          {(currentBranch.ahead > 0 || currentBranch.behind > 0) && (
            <div className="flex items-center gap-2 mt-2 text-xs">
              {currentBranch.ahead > 0 && (
                <span className="text-green-600">↑ {currentBranch.ahead}</span>
              )}
              {currentBranch.behind > 0 && (
                <span className="text-orange-600">↓ {currentBranch.behind}</span>
              )}
            </div>
          )}
        </div>
      )}

      {/* Branch List */}
      <div className="flex-1 overflow-y-auto">
        {/* Local Branches */}
        <div className="p-2">
          <div className="px-2 py-1 text-xs font-semibold text-gray-500 uppercase tracking-wider">
            Local
          </div>
          {localBranches.map((branch) => (
            <BranchItem
              key={branch.name}
              branch={branch}
              isCurrent={branch.name === currentBranch?.name}
              onSwitch={() => handleSwitchBranch(branch.name)}
              isLoading={isLoading}
            />
          ))}
        </div>

        {/* Remote Branches */}
        {remoteBranches.length > 0 && (
          <div className="p-2 border-t border-gray-200 dark:border-gray-700">
            <div className="px-2 py-1 text-xs font-semibold text-gray-500 uppercase tracking-wider">
              Remote
            </div>
            {remoteBranches.map((branch) => (
              <BranchItem
                key={branch.name}
                branch={branch}
                isCurrent={false}
                onSwitch={() => handleSwitchBranch(branch.name)}
                isLoading={isLoading}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// Branch Item Component
function BranchItem({
  branch,
  isCurrent,
  onSwitch,
  isLoading,
}: {
  branch: Branch;
  isCurrent: boolean;
  onSwitch: () => void;
  isLoading: boolean;
}) {
  return (
    <button
      onClick={onSwitch}
      disabled={isCurrent || isLoading}
      className={`w-full flex items-center gap-2 px-3 py-2 rounded-lg text-left ${
        isCurrent
          ? 'bg-blue-100 dark:bg-blue-900/30'
          : 'hover:bg-gray-100 dark:hover:bg-gray-700'
      }`}
    >
      <span className={isCurrent ? 'text-green-500' : 'text-gray-400'}>
        {isCurrent ? '●' : '○'}
      </span>
      <div className="flex-1 min-w-0">
        <div className={`font-mono text-sm truncate ${
          isCurrent ? 'font-medium text-blue-700 dark:text-blue-300' : 'text-gray-700 dark:text-gray-300'
        }`}>
          {branch.name}
        </div>
        {branch.job_id && (
          <div className="text-xs text-gray-500 truncate">
            Linked to job
          </div>
        )}
      </div>
      {branch.is_remote && !isCurrent && (
        <span className="text-xs text-gray-400">remote</span>
      )}
    </button>
  );
}

export default BranchPanel;
