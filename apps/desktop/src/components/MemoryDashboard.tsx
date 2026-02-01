import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";

// Types
interface MemoryStats {
  semantic: {
    preferences: number;
    facts: number;
    skills: number;
    rules: number;
  };
  episodic: {
    conversations: number;
    codeSnippets: number;
    workflowEpisodes: number;
    kiloCommands: number;
  };
}

interface MemoryItem {
  id: string;
  type: string;
  key: string;
  content: string;
  importance: number;
  createdAt: string;
  accessCount: number;
}

interface SearchResult {
  id: string;
  content: string;
  similarity: number;
  type: string;
  metadata: Record<string, any>;
}

// Icons
const Icons = {
  Brain: () => (
    <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} 
        d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
    </svg>
  ),
  Database: () => (
    <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} 
        d="M4 7v10c0 2.21 3.582 4 8 4s8-1.79 8-4V7M4 7c0 2.21 3.582 4 8 4s8-1.79 8-4M4 7c0-2.21 3.582-4 8-4s8 1.79 8 4m0 5c0 2.21-3.582 4-8 4s-8-1.79-8-4" />
    </svg>
  ),
  Search: () => (
    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} 
        d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
    </svg>
  ),
  Refresh: () => (
    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} 
        d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
    </svg>
  ),
  Trash: () => (
    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} 
        d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
    </svg>
  ),
  Star: () => (
    <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
      <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" />
    </svg>
  ),
};

// Memory type colors
const memoryTypeColors: Record<string, string> = {
  USER_PREFERENCE: "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400",
  PROJECT_FACT: "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400",
  SKILL: "bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-400",
  RULE: "bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-400",
  CONVERSATION: "bg-cyan-100 text-cyan-800 dark:bg-cyan-900/30 dark:text-cyan-400",
  CODE_SNIPPET: "bg-pink-100 text-pink-800 dark:bg-pink-900/30 dark:text-pink-400",
};

// Stat Card Component
function StatCard({ 
  title, 
  value, 
  icon, 
  trend 
}: { 
  title: string; 
  value: number; 
  icon: React.ReactNode;
  trend?: number;
}) {
  return (
    <div className="bg-white dark:bg-gray-800 rounded-xl p-4 border border-gray-200 dark:border-gray-700">
      <div className="flex items-center justify-between mb-2">
        <span className="text-gray-500 dark:text-gray-400 text-sm">{title}</span>
        <span className="text-gray-400">{icon}</span>
      </div>
      <div className="flex items-end gap-2">
        <span className="text-2xl font-bold text-gray-900 dark:text-white">{value}</span>
        {trend !== undefined && (
          <span className={`text-xs ${trend >= 0 ? 'text-green-500' : 'text-red-500'}`}>
            {trend >= 0 ? '+' : ''}{trend}%
          </span>
        )}
      </div>
    </div>
  );
}

// Memory Item Component
function MemoryItemCard({ 
  item, 
  onDelete 
}: { 
  item: MemoryItem; 
  onDelete?: (id: string) => void;
}) {
  const [expanded, setExpanded] = useState(false);

  return (
    <motion.div
      layout
      className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 overflow-hidden"
    >
      <div 
        className="p-4 cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-750"
        onClick={() => setExpanded(!expanded)}
      >
        <div className="flex items-start justify-between gap-3">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1">
              <span className={`px-2 py-0.5 rounded text-xs font-medium ${memoryTypeColors[item.type] || 'bg-gray-100 text-gray-800'}`}>
                {item.type.replace('_', ' ')}
              </span>
              <span className="text-xs text-gray-500">{item.key}</span>
            </div>
            <p className="text-sm text-gray-900 dark:text-white line-clamp-2">
              {item.content}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <div className="flex items-center gap-1 text-yellow-500">
              <Icons.Star />
              <span className="text-xs">{item.importance}</span>
            </div>
            {onDelete && (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onDelete(item.id);
                }}
                className="p-1 text-gray-400 hover:text-red-500 transition-colors"
              >
                <Icons.Trash />
              </button>
            )}
          </div>
        </div>
      </div>
      
      <AnimatePresence>
        {expanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="border-t border-gray-200 dark:border-gray-700"
          >
            <div className="p-4 bg-gray-50 dark:bg-gray-900/50">
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <span className="text-gray-500">Created</span>
                  <p className="text-gray-900 dark:text-white">{new Date(item.createdAt).toLocaleString()}</p>
                </div>
                <div>
                  <span className="text-gray-500">Access Count</span>
                  <p className="text-gray-900 dark:text-white">{item.accessCount}</p>
                </div>
              </div>
              <div className="mt-3">
                <span className="text-gray-500 text-sm">Full Content</span>
                <p className="text-gray-900 dark:text-white text-sm mt-1 whitespace-pre-wrap">
                  {item.content}
                </p>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

// Search Results Component
function SearchResults({ 
  results, 
  query 
}: { 
  results: SearchResult[]; 
  query: string;
}) {
  if (!query) return null;
  
  if (results.length === 0) {
    return (
      <div className="text-center py-8 text-gray-500">
        No results found for "{query}"
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <h3 className="text-sm font-medium text-gray-700 dark:text-gray-300">
        Search Results ({results.length})
      </h3>
      {results.map((result) => (
        <div
          key={result.id}
          className="bg-white dark:bg-gray-800 rounded-lg p-4 border border-gray-200 dark:border-gray-700"
        >
          <div className="flex items-center justify-between mb-2">
            <span className={`px-2 py-0.5 rounded text-xs font-medium ${memoryTypeColors[result.type] || 'bg-gray-100 text-gray-800'}`}>
              {result.type}
            </span>
            <span className="text-xs text-gray-500">
              {(result.similarity * 100).toFixed(1)}% match
            </span>
          </div>
          <p className="text-sm text-gray-900 dark:text-white">{result.content}</p>
        </div>
      ))}
    </div>
  );
}

// Main Component
export function MemoryDashboard() {
  const [activeTab, setActiveTab] = useState<"semantic" | "episodic">("semantic");
  const [searchQuery, setSearchQuery] = useState("");
  const [isSearching, setIsSearching] = useState(false);
  const [searchResults, setSearchResults] = useState<SearchResult[]>([]);
  const [stats, setStats] = useState<MemoryStats>({
    semantic: { preferences: 12, facts: 28, skills: 8, rules: 5 },
    episodic: { conversations: 156, codeSnippets: 89, workflowEpisodes: 34, kiloCommands: 23 },
  });
  const [memories, setMemories] = useState<MemoryItem[]>([
    {
      id: "1",
      type: "USER_PREFERENCE",
      key: "coding_style",
      content: "Prefers TypeScript with strict mode enabled. Uses functional programming patterns.",
      importance: 8,
      createdAt: "2026-01-02T08:30:00Z",
      accessCount: 15,
    },
    {
      id: "2",
      type: "PROJECT_FACT",
      key: "tech_stack",
      content: "Project uses Next.js 14 with App Router, PostgreSQL with Prisma ORM, and TailwindCSS.",
      importance: 9,
      createdAt: "2026-01-01T14:20:00Z",
      accessCount: 28,
    },
    {
      id: "3",
      type: "SKILL",
      key: "react_hooks",
      content: "Proficient in React hooks including useState, useEffect, useCallback, useMemo, and custom hooks.",
      importance: 7,
      createdAt: "2026-01-01T10:00:00Z",
      accessCount: 12,
    },
    {
      id: "4",
      type: "RULE",
      key: "api_validation",
      content: "All API routes must validate input using Zod schemas before processing.",
      importance: 10,
      createdAt: "2025-12-28T09:15:00Z",
      accessCount: 45,
    },
  ]);

  const handleSearch = async () => {
    if (!searchQuery.trim()) return;
    
    setIsSearching(true);
    // Simulate API call
    await new Promise(resolve => setTimeout(resolve, 500));
    
    // Mock search results
    setSearchResults([
      {
        id: "sr1",
        content: "User prefers TypeScript with strict mode",
        similarity: 0.92,
        type: "USER_PREFERENCE",
        metadata: {},
      },
      {
        id: "sr2",
        content: "Project uses Next.js 14 with TypeScript",
        similarity: 0.85,
        type: "PROJECT_FACT",
        metadata: {},
      },
    ]);
    setIsSearching(false);
  };

  const handleDelete = (id: string) => {
    setMemories(memories.filter(m => m.id !== id));
  };

  return (
    <div className="p-6 max-w-6xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-2xl font-bold text-gray-900 dark:text-white">Memory Dashboard</h2>
          <p className="text-gray-600 dark:text-gray-400 mt-1">
            View and manage semantic and episodic memory
          </p>
        </div>
        <button className="flex items-center gap-2 px-4 py-2 bg-blue-500 hover:bg-blue-600 text-white rounded-lg transition-colors">
          <Icons.Refresh />
          Refresh
        </button>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        <StatCard 
          title="User Preferences" 
          value={stats.semantic.preferences} 
          icon={<Icons.Brain />}
          trend={5}
        />
        <StatCard 
          title="Project Facts" 
          value={stats.semantic.facts} 
          icon={<Icons.Database />}
          trend={12}
        />
        <StatCard 
          title="Conversations" 
          value={stats.episodic.conversations} 
          icon={<Icons.Brain />}
          trend={8}
        />
        <StatCard 
          title="Code Snippets" 
          value={stats.episodic.codeSnippets} 
          icon={<Icons.Database />}
          trend={-2}
        />
      </div>

      {/* Search */}
      <div className="mb-6">
        <div className="relative">
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
            placeholder="Search memories..."
            className="w-full px-4 py-3 pl-12 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl text-gray-900 dark:text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
          <Icons.Search />
          <button
            onClick={handleSearch}
            disabled={isSearching}
            className="absolute right-2 top-1/2 -translate-y-1/2 px-4 py-1.5 bg-blue-500 hover:bg-blue-600 disabled:bg-blue-400 text-white text-sm rounded-lg transition-colors"
          >
            {isSearching ? "Searching..." : "Search"}
          </button>
        </div>
      </div>

      {/* Search Results */}
      {searchQuery && (
        <div className="mb-6">
          <SearchResults results={searchResults} query={searchQuery} />
        </div>
      )}

      {/* Tabs */}
      <div className="flex gap-2 mb-4">
        <button
          onClick={() => setActiveTab("semantic")}
          className={`px-4 py-2 rounded-lg font-medium transition-colors ${
            activeTab === "semantic"
              ? "bg-blue-500 text-white"
              : "bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700"
          }`}
        >
          Semantic Memory
        </button>
        <button
          onClick={() => setActiveTab("episodic")}
          className={`px-4 py-2 rounded-lg font-medium transition-colors ${
            activeTab === "episodic"
              ? "bg-blue-500 text-white"
              : "bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700"
          }`}
        >
          Episodic Memory
        </button>
      </div>

      {/* Memory List */}
      <div className="space-y-3">
        {memories
          .filter(m => {
            if (activeTab === "semantic") {
              return ["USER_PREFERENCE", "PROJECT_FACT", "SKILL", "RULE"].includes(m.type);
            }
            return ["CONVERSATION", "CODE_SNIPPET", "WORKFLOW_EPISODE", "KILO_COMMAND"].includes(m.type);
          })
          .map((item) => (
            <MemoryItemCard key={item.id} item={item} onDelete={handleDelete} />
          ))}
      </div>
    </div>
  );
}
