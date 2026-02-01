// Knowledge Panel Component
// View and manage long-term knowledge

import { useState, useEffect } from 'react';
import { 
  LongTermMemory, 
  getLongTermMemory, 
  addLongTermMemory,
  updateLongTermMemory,
  getCategoryIcon,
  getCategoryColor,
} from '../../services/chatService';

interface KnowledgePanelProps {
  workspaceId: string;
  className?: string;
}

const CATEGORIES = [
  { id: 'decision', name: 'Decisions', icon: '🎯' },
  { id: 'constraint', name: 'Constraints', icon: '⚠️' },
  { id: 'pattern', name: 'Patterns', icon: '🔄' },
  { id: 'learning', name: 'Learnings', icon: '💡' },
  { id: 'reference', name: 'References', icon: '📚' },
  { id: 'project_info', name: 'Project Info', icon: '📁' },
  { id: 'code_context', name: 'Code Context', icon: '💻' },
];

export function KnowledgePanel({ workspaceId, className = '' }: KnowledgePanelProps) {
  const [knowledge, setKnowledge] = useState<LongTermMemory[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [showAddModal, setShowAddModal] = useState(false);
  const [editingItem, setEditingItem] = useState<LongTermMemory | null>(null);

  // Load knowledge
  useEffect(() => {
    const loadKnowledge = async () => {
      setLoading(true);
      try {
        const data = await getLongTermMemory(workspaceId, selectedCategory || undefined, 50);
        setKnowledge(data);
      } catch (error) {
        console.error('Failed to load knowledge:', error);
      } finally {
        setLoading(false);
      }
    };
    loadKnowledge();
  }, [workspaceId, selectedCategory]);

  const handleAddKnowledge = async (data: {
    category: string;
    title: string;
    content: string;
    tags?: string[];
  }) => {
    try {
      await addLongTermMemory(workspaceId, {
        ...data,
        source: 'manual',
      });
      // Reload
      const updated = await getLongTermMemory(workspaceId, selectedCategory || undefined, 50);
      setKnowledge(updated);
      setShowAddModal(false);
    } catch (error) {
      console.error('Failed to add knowledge:', error);
    }
  };

  const handleUpdateKnowledge = async (
    id: number,
    updates: { title?: string; content?: string; tags?: string[] }
  ) => {
    try {
      await updateLongTermMemory(workspaceId, id, updates);
      // Reload
      const updated = await getLongTermMemory(workspaceId, selectedCategory || undefined, 50);
      setKnowledge(updated);
      setEditingItem(null);
    } catch (error) {
      console.error('Failed to update knowledge:', error);
    }
  };

  return (
    <div className={`flex flex-col h-full bg-white dark:bg-gray-800 ${className}`}>
      {/* Header */}
      <div className="p-4 border-b border-gray-200 dark:border-gray-700">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white">Knowledge Base</h2>
          <button
            onClick={() => setShowAddModal(true)}
            className="flex items-center gap-1 px-3 py-1.5 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
            Add
          </button>
        </div>

        {/* Category Filter */}
        <div className="flex flex-wrap gap-2">
          <button
            onClick={() => setSelectedCategory(null)}
            className={`px-3 py-1 text-xs font-medium rounded-full transition-colors ${
              selectedCategory === null
                ? 'bg-blue-600 text-white'
                : 'bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600'
            }`}
          >
            All
          </button>
          {CATEGORIES.map((cat) => (
            <button
              key={cat.id}
              onClick={() => setSelectedCategory(cat.id)}
              className={`px-3 py-1 text-xs font-medium rounded-full transition-colors ${
                selectedCategory === cat.id
                  ? 'bg-blue-600 text-white'
                  : 'bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600'
              }`}
            >
              {cat.icon} {cat.name}
            </button>
          ))}
        </div>
      </div>

      {/* Knowledge List */}
      <div className="flex-1 overflow-y-auto p-4">
        {loading ? (
          <div className="space-y-3">
            {[1, 2, 3].map((i) => (
              <div key={i} className="animate-pulse">
                <div className="h-4 bg-gray-200 dark:bg-gray-700 rounded w-1/3 mb-2"></div>
                <div className="h-3 bg-gray-200 dark:bg-gray-700 rounded w-full mb-1"></div>
                <div className="h-3 bg-gray-200 dark:bg-gray-700 rounded w-2/3"></div>
              </div>
            ))}
          </div>
        ) : knowledge.length === 0 ? (
          <div className="text-center py-8">
            <div className="w-12 h-12 bg-gray-100 dark:bg-gray-700 rounded-full flex items-center justify-center mx-auto mb-3">
              <svg className="w-6 h-6 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
              </svg>
            </div>
            <p className="text-gray-500 dark:text-gray-400">No knowledge items yet</p>
            <p className="text-sm text-gray-400 dark:text-gray-500 mt-1">
              Add decisions, constraints, and learnings to build your knowledge base
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {knowledge.map((item) => (
              <KnowledgeItem
                key={item.id}
                item={item}
                onEdit={() => setEditingItem(item)}
              />
            ))}
          </div>
        )}
      </div>

      {/* Add/Edit Modal */}
      {(showAddModal || editingItem) && (
        <KnowledgeModal
          item={editingItem}
          onClose={() => { setShowAddModal(false); setEditingItem(null); }}
          onSave={editingItem 
            ? (data) => handleUpdateKnowledge(editingItem.id, data)
            : handleAddKnowledge
          }
        />
      )}
    </div>
  );
}

// Knowledge Item Component
function KnowledgeItem({ 
  item, 
  onEdit 
}: { 
  item: LongTermMemory; 
  onEdit: () => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const tags = item.tags_json ? JSON.parse(item.tags_json) : [];

  return (
    <div className="p-3 bg-gray-50 dark:bg-gray-700 rounded-lg">
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-2">
          <span className="text-lg">{getCategoryIcon(item.category)}</span>
          <div>
            <h4 className="text-sm font-medium text-gray-900 dark:text-white">{item.title}</h4>
            <div className="flex items-center gap-2 mt-0.5">
              <span className="text-xs text-gray-500">{item.category}</span>
              <span className="text-xs text-gray-400">·</span>
              <span className="text-xs text-gray-500">{item.access_count} accesses</span>
            </div>
          </div>
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={onEdit}
            className="p-1 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
            </svg>
          </button>
          <button
            onClick={() => setExpanded(!expanded)}
            className="p-1 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200"
          >
            <svg className={`w-4 h-4 transition-transform ${expanded ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
            </svg>
          </button>
        </div>
      </div>
      
      <p className={`text-sm text-gray-600 dark:text-gray-300 mt-2 ${expanded ? '' : 'line-clamp-2'}`}>
        {item.content}
      </p>

      {tags.length > 0 && (
        <div className="flex flex-wrap gap-1 mt-2">
          {tags.map((tag: string, i: number) => (
            <span key={i} className="px-2 py-0.5 text-xs bg-gray-200 dark:bg-gray-600 text-gray-600 dark:text-gray-300 rounded">
              {tag}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

// Knowledge Modal Component
function KnowledgeModal({
  item,
  onClose,
  onSave,
}: {
  item: LongTermMemory | null;
  onClose: () => void;
  onSave: (data: { category: string; title: string; content: string; tags?: string[] }) => void;
}) {
  const [category, setCategory] = useState(item?.category || 'decision');
  const [title, setTitle] = useState(item?.title || '');
  const [content, setContent] = useState(item?.content || '');
  const [tagsInput, setTagsInput] = useState(
    item?.tags_json ? JSON.parse(item.tags_json).join(', ') : ''
  );

  const handleSave = () => {
    if (!title.trim() || !content.trim()) return;
    
    const tags = tagsInput
      .split(',')
      .map((t: string) => t.trim())
      .filter((t: string) => t.length > 0);
    
    onSave({
      category,
      title: title.trim(),
      content: content.trim(),
      tags: tags.length > 0 ? tags : undefined,
    });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl w-full max-w-lg mx-4 max-h-[90vh] overflow-hidden">
        <div className="p-4 border-b border-gray-200 dark:border-gray-700">
          <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
            {item ? 'Edit Knowledge' : 'Add Knowledge'}
          </h3>
        </div>
        
        <div className="p-4 space-y-4 overflow-y-auto max-h-[60vh]">
          {/* Category */}
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              Category
            </label>
            <div className="grid grid-cols-3 gap-2">
              {CATEGORIES.map((cat) => (
                <button
                  key={cat.id}
                  onClick={() => setCategory(cat.id)}
                  className={`px-3 py-2 text-sm rounded-lg border transition-colors ${
                    category === cat.id
                      ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-300'
                      : 'border-gray-200 dark:border-gray-600 hover:bg-gray-50 dark:hover:bg-gray-700'
                  }`}
                >
                  {cat.icon} {cat.name}
                </button>
              ))}
            </div>
          </div>

          {/* Title */}
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              Title
            </label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g., Use PostgreSQL for database"
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500"
            />
          </div>

          {/* Content */}
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              Content
            </label>
            <textarea
              value={content}
              onChange={(e) => setContent(e.target.value)}
              placeholder="Describe the decision, constraint, or learning..."
              rows={4}
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 resize-none"
            />
          </div>

          {/* Tags */}
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              Tags (comma-separated)
            </label>
            <input
              type="text"
              value={tagsInput}
              onChange={(e) => setTagsInput(e.target.value)}
              placeholder="e.g., database, architecture, backend"
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500"
            />
          </div>
        </div>

        <div className="p-4 border-t border-gray-200 dark:border-gray-700 flex justify-end gap-2">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-md"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={!title.trim() || !content.trim()}
            className="px-4 py-2 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 rounded-md"
          >
            {item ? 'Update' : 'Add'}
          </button>
        </div>
      </div>
    </div>
  );
}

export default KnowledgePanel;
