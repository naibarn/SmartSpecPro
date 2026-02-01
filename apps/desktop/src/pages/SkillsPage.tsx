import { useWorkspace } from '../services/workspaceService';
import { LazySkillManager } from '../components/LazyComponents';

export default function SkillsPage() {
  const { currentWorkspace } = useWorkspace();

  if (!currentWorkspace) {
    return (
      <div className="flex flex-col items-center justify-center h-screen bg-gray-50 dark:bg-gray-950">
        <div className="text-center">
          <svg
            className="w-16 h-16 mx-auto mb-4 text-gray-400"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={1.5}
              d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z"
            />
          </svg>
          <h2 className="text-xl font-semibold text-gray-900 dark:text-white mb-2">
            No Workspace Selected
          </h2>
          <p className="text-gray-500 dark:text-gray-400">
            Please select a workspace to manage skills
          </p>
        </div>
      </div>
    );
  }

  return <LazySkillManager workspace={currentWorkspace.path} />;
}
