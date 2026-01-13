// Chat Sidebar Component
// Session list, knowledge panel, and memory stats

import { useState } from 'react';
import { 
  useChat, 
  ChatSession, 
  MemoryStats, 
  WorkingMemory,
  formatTokenCount,
  getCategoryIcon,
  getCategoryColor,
} from '../../services/chatService';

interface ChatSidebarProps {
  className?: string;
}

export function ChatSidebar({ className = '' }: ChatSidebarProps) {
  const {
    currentSession,
    sessions,
    createSession,
    switchSession,
    pinnedMemory,
    memoryStats,
    skills,
  } = useChat();

  const [showNewSessionModal, setShowNewSessionModal] = useState(false);
  const [newSessionTitle, setNewSessionTitle] = useState('');
  const [newSessionSkill, setNewSessionSkill] = useState<string | undefined>();

  const handleCreateSession = async () => {
    if (!newSessionTitle.trim()) return;
    await createSession(newSessionTitle.trim(), newSessionSkill);
    setNewSessionTitle('');
    setNewSessionSkill(undefined);
    setShowNewSessionModal(false);
  };

  return (
    <div className={`flex flex-col h-full bg-white dark:bg-gray-800 border-r border-gray-200 dark:border-gray-700 ${className}`}>
      {/* Header */}
      <div className="p-4 border-b border-gray-200 dark:border-gray-700">
        <button
          onClick={() => setShowNewSessionModal(true)}
          className="w-full flex items-center justify-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
          </svg>
          New Chat
        </button>
      </div>

      {/* Sessions List */}
      <div className="flex-1 overflow-y-auto">
        <div className="p-2">
          <h3 className="px-2 py-1 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">
            Sessions
          </h3>
          <div className="space-y-1 mt-2">
            {sessions.length === 0 ? (
              <p className="px-2 py-4 text-sm text-gray-500 dark:text-gray-400 text-center">
                No sessions yet
              </p>
            ) : (
              sessions.map((session) => (
                <SessionItem
                  key={session.id}
                  session={session}
                  isActive={currentSession?.id === session.id}
                  onClick={() => switchSession(session.id)}
                />
              ))
            )}
          </div>
        </div>

        {/* Pinned Memory */}
        {pinnedMemory.length > 0 && (
          <div className="p-2 border-t border-gray-200 dark:border-gray-700">
            <h3 className="px-2 py-1 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">
              Working Memory
            </h3>
            <div className="space-y-1 mt-2">
              {pinnedMemory.map((item) => (
                <PinnedItem key={item.id} item={item} />
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Memory Stats */}
      {memoryStats && (
        <div className="p-4 border-t border-gray-200 dark:border-gray-700">
          <MemoryStatsPanel stats={memoryStats} />
        </div>
      )}

      {/* New Session Modal */}
      {showNewSessionModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl w-full max-w-md mx-4">
            <div className="p-4 border-b border-gray-200 dark:border-gray-700">
              <h3 className="text-lg font-semibold text-gray-900 dark:text-white">New Chat Session</h3>
            </div>
            <div className="p-4 space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Session Title
                </label>
                <input
                  type="text"
                  value={newSessionTitle}
                  onChange={(e) => setNewSessionTitle(e.target.value)}
                  placeholder="e.g., User Authentication Spec"
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500"
                  autoFocus
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Start with Skill (optional)
                </label>
                <div className="grid grid-cols-2 gap-2">
                  {skills.map((skill) => (
                    <button
                      key={skill.name}
                      onClick={() => setNewSessionSkill(newSessionSkill === skill.name ? undefined : skill.name)}
                      className={`px-3 py-2 text-sm rounded-lg border transition-colors ${
                        newSessionSkill === skill.name
                          ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-300'
                          : 'border-gray-200 dark:border-gray-600 hover:bg-gray-50 dark:hover:bg-gray-700'
                      }`}
                    >
                      <div className="font-medium">{skill.command}</div>
                      <div className="text-xs text-gray-500 truncate">{skill.description}</div>
                    </button>
                  ))}
                </div>
              </div>
            </div>
            <div className="p-4 border-t border-gray-200 dark:border-gray-700 flex justify-end gap-2">
              <button
                onClick={() => setShowNewSessionModal(false)}
                className="px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-md"
              >
                Cancel
              </button>
              <button
                onClick={handleCreateSession}
                disabled={!newSessionTitle.trim()}
                className="px-4 py-2 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 rounded-md"
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

// Session Item Component
function SessionItem({ 
  session, 
  isActive, 
  onClick 
}: { 
  session: ChatSession; 
  isActive: boolean; 
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={`w-full flex items-start gap-3 px-3 py-2 rounded-lg text-left transition-colors ${
        isActive
          ? 'bg-blue-50 dark:bg-blue-900/20'
          : 'hover:bg-gray-100 dark:hover:bg-gray-700'
      }`}
    >
      <div className={`w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 ${
        isActive
          ? 'bg-blue-100 dark:bg-blue-800 text-blue-600 dark:text-blue-300'
          : 'bg-gray-100 dark:bg-gray-700 text-gray-500'
      }`}>
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
        </svg>
      </div>
      <div className="flex-1 min-w-0">
        <div className={`text-sm font-medium truncate ${
          isActive ? 'text-blue-700 dark:text-blue-300' : 'text-gray-900 dark:text-white'
        }`}>
          {session.title}
        </div>
        <div className="flex items-center gap-2 mt-0.5">
          {session.skill && (
            <span className="text-xs px-1.5 py-0.5 bg-gray-100 dark:bg-gray-600 rounded text-gray-600 dark:text-gray-300">
              {session.skill}
            </span>
          )}
          <span className="text-xs text-gray-500">
            {session.message_count} messages
          </span>
        </div>
      </div>
    </button>
  );
}

// Pinned Item Component
function PinnedItem({ item }: { item: WorkingMemory }) {
  return (
    <div className="px-3 py-2 bg-gray-50 dark:bg-gray-700 rounded-lg">
      <div className="flex items-center gap-2">
        <span className="text-sm">{getCategoryIcon(item.category)}</span>
        <span className="text-xs font-medium text-gray-700 dark:text-gray-300 truncate flex-1">
          {item.title}
        </span>
        <button className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200">
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>
      <p className="text-xs text-gray-500 dark:text-gray-400 mt-1 line-clamp-2">
        {item.content}
      </p>
    </div>
  );
}

// Memory Stats Panel
function MemoryStatsPanel({ stats }: { stats: MemoryStats }) {
  return (
    <div className="space-y-2">
      <h4 className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">
        Memory Usage
      </h4>
      <div className="grid grid-cols-2 gap-2 text-xs">
        <div className="flex justify-between">
          <span className="text-gray-500">Short-term:</span>
          <span className="font-medium text-gray-900 dark:text-white">{stats.short_term_count}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-gray-500">Working:</span>
          <span className="font-medium text-gray-900 dark:text-white">{stats.working_count}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-gray-500">Pinned:</span>
          <span className="font-medium text-gray-900 dark:text-white">{stats.pinned_count}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-gray-500">Long-term:</span>
          <span className="font-medium text-gray-900 dark:text-white">{stats.long_term_count}</span>
        </div>
      </div>
      <div className="pt-2 border-t border-gray-200 dark:border-gray-700">
        <div className="flex justify-between text-xs">
          <span className="text-gray-500">Total Tokens:</span>
          <span className="font-medium text-gray-900 dark:text-white">
            {formatTokenCount(stats.total_tokens)}
          </span>
        </div>
      </div>
    </div>
  );
}

export default ChatSidebar;
