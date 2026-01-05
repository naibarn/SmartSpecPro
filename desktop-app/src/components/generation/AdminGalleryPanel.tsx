/**
 * SmartSpec Pro - Admin Gallery Panel Component
 * Admin interface for managing gallery content and moderation.
 */

import React, { useState, useMemo } from 'react';
import {
  Shield,
  Search,
  CheckCircle,
  XCircle,
  Star,
  Trash2,
  Eye,
  EyeOff,
  MoreVertical,
  AlertTriangle,
  Image,
  Video,
  Music,
  Heart,
  MessageCircle,
  Clock,
  RefreshCw,
} from 'lucide-react';

// Types
type ModerationStatus = 'all' | 'pending' | 'approved' | 'rejected' | 'featured';
type ModerationAction = 'approve' | 'reject' | 'feature' | 'unfeature' | 'hide' | 'delete';

interface AdminGalleryItem {
  id: string;
  title: string;
  description?: string;
  mediaType: 'image' | 'video' | 'audio';
  mediaUrl: string;
  thumbnailUrl?: string;
  prompt: string;
  modelName: string;
  category: string;
  tags: string[];
  likesCount: number;
  viewsCount: number;
  commentsCount: number;
  isFeatured: boolean;
  isApproved: boolean;
  isNsfw: boolean;
  userId: string;
  userName: string;
  userEmail: string;
  createdAt: string;
}

interface GalleryStats {
  totalItems: number;
  pendingReview: number;
  approvedItems: number;
  rejectedItems: number;
  featuredItems: number;
  nsfwItems: number;
  totalLikes: number;
  totalViews: number;
  totalComments: number;
}

// Mock data
const MOCK_STATS: GalleryStats = {
  totalItems: 1250,
  pendingReview: 45,
  approvedItems: 1150,
  rejectedItems: 55,
  featuredItems: 24,
  nsfwItems: 12,
  totalLikes: 45600,
  totalViews: 234500,
  totalComments: 3420,
};

const MOCK_ITEMS: AdminGalleryItem[] = [
  {
    id: '1',
    title: 'Sunset Over Mountains',
    description: 'A breathtaking view of a sunset.',
    mediaType: 'image',
    mediaUrl: 'https://picsum.photos/seed/admin1/800/600',
    thumbnailUrl: 'https://picsum.photos/seed/admin1/200/150',
    prompt: 'A beautiful sunset over mountains with vibrant colors',
    modelName: 'Nano Banana Pro',
    category: 'landscape',
    tags: ['sunset', 'mountains', 'nature'],
    likesCount: 234,
    viewsCount: 1520,
    commentsCount: 12,
    isFeatured: true,
    isApproved: true,
    isNsfw: false,
    userId: 'user1',
    userName: 'John Doe',
    userEmail: 'john@example.com',
    createdAt: '2025-01-02T10:30:00Z',
  },
  {
    id: '2',
    title: 'Pending Review Item',
    mediaType: 'image',
    mediaUrl: 'https://picsum.photos/seed/admin2/800/600',
    thumbnailUrl: 'https://picsum.photos/seed/admin2/200/150',
    prompt: 'Abstract art with geometric shapes',
    modelName: 'FLUX 2',
    category: 'abstract',
    tags: ['abstract', 'geometric'],
    likesCount: 0,
    viewsCount: 5,
    commentsCount: 0,
    isFeatured: false,
    isApproved: false,
    isNsfw: false,
    userId: 'user2',
    userName: 'Jane Smith',
    userEmail: 'jane@example.com',
    createdAt: '2025-01-03T08:15:00Z',
  },
  {
    id: '3',
    title: 'NSFW Content',
    mediaType: 'image',
    mediaUrl: 'https://picsum.photos/seed/admin3/800/600',
    thumbnailUrl: 'https://picsum.photos/seed/admin3/200/150',
    prompt: 'Artistic nude study',
    modelName: 'FLUX 2',
    category: 'art',
    tags: ['art', 'study'],
    likesCount: 45,
    viewsCount: 320,
    commentsCount: 3,
    isFeatured: false,
    isApproved: true,
    isNsfw: true,
    userId: 'user3',
    userName: 'Mike Wilson',
    userEmail: 'mike@example.com',
    createdAt: '2025-01-01T15:45:00Z',
  },
];

// Helper functions
const formatNumber = (num: number): string => {
  if (num >= 1000000) return `${(num / 1000000).toFixed(1)}M`;
  if (num >= 1000) return `${(num / 1000).toFixed(1)}K`;
  return num.toString();
};

const formatDate = (dateString: string): string => {
  return new Date(dateString).toLocaleString();
};

// Stats Card Component
const StatsCard: React.FC<{
  title: string;
  value: number | string;
  icon: React.ReactNode;
  color: string;
  trend?: number;
}> = ({ title, value, icon, color, trend }) => (
  <div className="bg-white dark:bg-gray-800 rounded-lg p-4 border border-gray-200 dark:border-gray-700">
    <div className="flex items-center justify-between">
      <div className={`p-2 rounded-lg ${color}`}>{icon}</div>
      {trend !== undefined && (
        <span className={`text-sm ${trend >= 0 ? 'text-green-500' : 'text-red-500'}`}>
          {trend >= 0 ? '+' : ''}{trend}%
        </span>
      )}
    </div>
    <p className="text-2xl font-bold text-gray-900 dark:text-white mt-2">
      {typeof value === 'number' ? formatNumber(value) : value}
    </p>
    <p className="text-sm text-gray-500 dark:text-gray-400">{title}</p>
  </div>
);

// Item Row Component
const ItemRow: React.FC<{
  item: AdminGalleryItem;
  selected: boolean;
  onSelect: (id: string) => void;
  onAction: (id: string, action: ModerationAction) => void;
}> = ({ item, selected, onSelect, onAction }) => {
  const [showMenu, setShowMenu] = useState(false);

  const getMediaIcon = () => {
    switch (item.mediaType) {
      case 'image': return <Image className="w-4 h-4" />;
      case 'video': return <Video className="w-4 h-4" />;
      case 'audio': return <Music className="w-4 h-4" />;
    }
  };

  return (
    <tr className="hover:bg-gray-50 dark:hover:bg-gray-800/50">
      <td className="px-4 py-3">
        <input
          type="checkbox"
          checked={selected}
          onChange={() => onSelect(item.id)}
          className="rounded border-gray-300"
        />
      </td>
      <td className="px-4 py-3">
        <div className="flex items-center gap-3">
          <div className="w-16 h-12 bg-gray-100 dark:bg-gray-700 rounded overflow-hidden flex-shrink-0">
            {item.thumbnailUrl ? (
              <img src={item.thumbnailUrl} alt="" className="w-full h-full object-cover" />
            ) : (
              <div className="w-full h-full flex items-center justify-center text-gray-400">
                {getMediaIcon()}
              </div>
            )}
          </div>
          <div className="min-w-0">
            <p className="font-medium text-gray-900 dark:text-white truncate">{item.title}</p>
            <p className="text-sm text-gray-500 truncate">{item.prompt.slice(0, 50)}...</p>
          </div>
        </div>
      </td>
      <td className="px-4 py-3">
        <div className="flex items-center gap-2">
          {getMediaIcon()}
          <span className="text-sm text-gray-600 dark:text-gray-400 capitalize">
            {item.mediaType}
          </span>
        </div>
      </td>
      <td className="px-4 py-3">
        <div>
          <p className="text-sm text-gray-900 dark:text-white">{item.userName}</p>
          <p className="text-xs text-gray-500">{item.userEmail}</p>
        </div>
      </td>
      <td className="px-4 py-3">
        <div className="flex items-center gap-2">
          {item.isApproved ? (
            <span className="px-2 py-1 bg-green-100 text-green-700 text-xs rounded-full flex items-center gap-1">
              <CheckCircle className="w-3 h-3" />
              Approved
            </span>
          ) : (
            <span className="px-2 py-1 bg-yellow-100 text-yellow-700 text-xs rounded-full flex items-center gap-1">
              <Clock className="w-3 h-3" />
              Pending
            </span>
          )}
          {item.isFeatured && (
            <span className="px-2 py-1 bg-purple-100 text-purple-700 text-xs rounded-full flex items-center gap-1">
              <Star className="w-3 h-3" />
              Featured
            </span>
          )}
          {item.isNsfw && (
            <span className="px-2 py-1 bg-red-100 text-red-700 text-xs rounded-full flex items-center gap-1">
              <AlertTriangle className="w-3 h-3" />
              NSFW
            </span>
          )}
        </div>
      </td>
      <td className="px-4 py-3">
        <div className="flex items-center gap-3 text-sm text-gray-500">
          <span className="flex items-center gap-1">
            <Heart className="w-4 h-4" />
            {formatNumber(item.likesCount)}
          </span>
          <span className="flex items-center gap-1">
            <Eye className="w-4 h-4" />
            {formatNumber(item.viewsCount)}
          </span>
          <span className="flex items-center gap-1">
            <MessageCircle className="w-4 h-4" />
            {item.commentsCount}
          </span>
        </div>
      </td>
      <td className="px-4 py-3 text-sm text-gray-500">
        {formatDate(item.createdAt)}
      </td>
      <td className="px-4 py-3">
        <div className="relative">
          <button
            onClick={() => setShowMenu(!showMenu)}
            className="p-1 hover:bg-gray-100 dark:hover:bg-gray-700 rounded"
          >
            <MoreVertical className="w-4 h-4" />
          </button>
          {showMenu && (
            <div className="absolute right-0 mt-1 w-48 bg-white dark:bg-gray-800 rounded-lg shadow-lg border border-gray-200 dark:border-gray-700 py-1 z-10">
              {!item.isApproved && (
                <button
                  onClick={() => { onAction(item.id, 'approve'); setShowMenu(false); }}
                  className="w-full px-4 py-2 text-left text-sm hover:bg-gray-100 dark:hover:bg-gray-700 flex items-center gap-2 text-green-600"
                >
                  <CheckCircle className="w-4 h-4" />
                  Approve
                </button>
              )}
              {item.isApproved && (
                <button
                  onClick={() => { onAction(item.id, 'reject'); setShowMenu(false); }}
                  className="w-full px-4 py-2 text-left text-sm hover:bg-gray-100 dark:hover:bg-gray-700 flex items-center gap-2 text-yellow-600"
                >
                  <XCircle className="w-4 h-4" />
                  Reject
                </button>
              )}
              {!item.isFeatured ? (
                <button
                  onClick={() => { onAction(item.id, 'feature'); setShowMenu(false); }}
                  className="w-full px-4 py-2 text-left text-sm hover:bg-gray-100 dark:hover:bg-gray-700 flex items-center gap-2 text-purple-600"
                >
                  <Star className="w-4 h-4" />
                  Feature
                </button>
              ) : (
                <button
                  onClick={() => { onAction(item.id, 'unfeature'); setShowMenu(false); }}
                  className="w-full px-4 py-2 text-left text-sm hover:bg-gray-100 dark:hover:bg-gray-700 flex items-center gap-2"
                >
                  <Star className="w-4 h-4" />
                  Unfeature
                </button>
              )}
              <button
                onClick={() => { onAction(item.id, 'hide'); setShowMenu(false); }}
                className="w-full px-4 py-2 text-left text-sm hover:bg-gray-100 dark:hover:bg-gray-700 flex items-center gap-2"
              >
                <EyeOff className="w-4 h-4" />
                Hide
              </button>
              <hr className="my-1 border-gray-200 dark:border-gray-700" />
              <button
                onClick={() => { onAction(item.id, 'delete'); setShowMenu(false); }}
                className="w-full px-4 py-2 text-left text-sm hover:bg-red-50 dark:hover:bg-red-900/20 flex items-center gap-2 text-red-600"
              >
                <Trash2 className="w-4 h-4" />
                Delete
              </button>
            </div>
          )}
        </div>
      </td>
    </tr>
  );
};

// Main Admin Gallery Panel Component
export const AdminGalleryPanel: React.FC = () => {
  const [stats] = useState<GalleryStats>(MOCK_STATS);
  const [items, setItems] = useState<AdminGalleryItem[]>(MOCK_ITEMS);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<ModerationStatus>('all');
  const [selectedItems, setSelectedItems] = useState<Set<string>>(new Set());
  // const [showBulkActions, setShowBulkActions] = useState(false);

  // Filter items
  const filteredItems = useMemo(() => {
    return items.filter((item) => {
      if (searchQuery) {
        const query = searchQuery.toLowerCase();
        if (
          !item.title.toLowerCase().includes(query) &&
          !item.prompt.toLowerCase().includes(query) &&
          !item.userName.toLowerCase().includes(query) &&
          !item.userEmail.toLowerCase().includes(query)
        ) {
          return false;
        }
      }
      
      switch (statusFilter) {
        case 'pending':
          return !item.isApproved;
        case 'approved':
          return item.isApproved && !item.isFeatured;
        case 'featured':
          return item.isFeatured;
        case 'rejected':
          return false; // Would need a rejected flag
        default:
          return true;
      }
    });
  }, [items, searchQuery, statusFilter]);

  // Handle selection
  const handleSelectAll = () => {
    if (selectedItems.size === filteredItems.length) {
      setSelectedItems(new Set());
    } else {
      setSelectedItems(new Set(filteredItems.map((i) => i.id)));
    }
  };

  const handleSelect = (id: string) => {
    const newSelected = new Set(selectedItems);
    if (newSelected.has(id)) {
      newSelected.delete(id);
    } else {
      newSelected.add(id);
    }
    setSelectedItems(newSelected);
  };

  // Handle moderation action
  const handleAction = (id: string, action: ModerationAction) => {
    setItems((prev) =>
      prev.map((item) => {
        if (item.id !== id) return item;
        
        switch (action) {
          case 'approve':
            return { ...item, isApproved: true };
          case 'reject':
            return { ...item, isApproved: false };
          case 'feature':
            return { ...item, isFeatured: true };
          case 'unfeature':
            return { ...item, isFeatured: false };
          case 'hide':
            return { ...item, isApproved: false };
          case 'delete':
            return item; // Would remove from list
          default:
            return item;
        }
      }).filter((item) => !(action === 'delete' && item.id === id))
    );
  };

  // Handle bulk action
  const handleBulkAction = (action: ModerationAction) => {
    selectedItems.forEach((id) => handleAction(id, action));
    setSelectedItems(new Set());
  };

  return (
    <div className="h-full flex flex-col bg-gray-50 dark:bg-gray-900">
      {/* Header */}
      <div className="bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 p-4">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold text-gray-900 dark:text-white flex items-center gap-2">
              <Shield className="w-6 h-6 text-blue-500" />
              Gallery Administration
            </h1>
            <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
              Manage and moderate gallery content
            </p>
          </div>
          <button className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700">
            <RefreshCw className="w-4 h-4" />
            Refresh
          </button>
        </div>
      </div>

      {/* Stats */}
      <div className="p-4 grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-4">
        <StatsCard
          title="Total Items"
          value={stats.totalItems}
          icon={<Image className="w-5 h-5 text-blue-600" />}
          color="bg-blue-100"
        />
        <StatsCard
          title="Pending Review"
          value={stats.pendingReview}
          icon={<Clock className="w-5 h-5 text-yellow-600" />}
          color="bg-yellow-100"
        />
        <StatsCard
          title="Featured"
          value={stats.featuredItems}
          icon={<Star className="w-5 h-5 text-purple-600" />}
          color="bg-purple-100"
        />
        <StatsCard
          title="Total Likes"
          value={stats.totalLikes}
          icon={<Heart className="w-5 h-5 text-red-600" />}
          color="bg-red-100"
        />
        <StatsCard
          title="Total Views"
          value={stats.totalViews}
          icon={<Eye className="w-5 h-5 text-green-600" />}
          color="bg-green-100"
        />
        <StatsCard
          title="NSFW Items"
          value={stats.nsfwItems}
          icon={<AlertTriangle className="w-5 h-5 text-orange-600" />}
          color="bg-orange-100"
        />
      </div>

      {/* Filters */}
      <div className="px-4 pb-4 flex flex-wrap gap-4">
        {/* Search */}
        <div className="flex-1 min-w-[200px]">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search by title, prompt, user..."
              className="w-full pl-10 pr-4 py-2 border border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white"
            />
          </div>
        </div>

        {/* Status Filter */}
        <div className="flex gap-2">
          {(['all', 'pending', 'approved', 'featured'] as ModerationStatus[]).map((status) => (
            <button
              key={status}
              onClick={() => setStatusFilter(status)}
              className={`px-3 py-2 rounded-lg text-sm capitalize ${
                statusFilter === status
                  ? 'bg-blue-600 text-white'
                  : 'bg-white dark:bg-gray-800 text-gray-600 dark:text-gray-400 border border-gray-200 dark:border-gray-700'
              }`}
            >
              {status}
              {status === 'pending' && stats.pendingReview > 0 && (
                <span className="ml-1 px-1.5 py-0.5 bg-red-500 text-white text-xs rounded-full">
                  {stats.pendingReview}
                </span>
              )}
            </button>
          ))}
        </div>
      </div>

      {/* Bulk Actions */}
      {selectedItems.size > 0 && (
        <div className="px-4 pb-4">
          <div className="flex items-center gap-4 p-3 bg-blue-50 dark:bg-blue-900/20 rounded-lg">
            <span className="text-sm text-blue-700 dark:text-blue-300">
              {selectedItems.size} item(s) selected
            </span>
            <div className="flex gap-2">
              <button
                onClick={() => handleBulkAction('approve')}
                className="px-3 py-1 bg-green-600 text-white text-sm rounded hover:bg-green-700"
              >
                Approve All
              </button>
              <button
                onClick={() => handleBulkAction('reject')}
                className="px-3 py-1 bg-yellow-600 text-white text-sm rounded hover:bg-yellow-700"
              >
                Reject All
              </button>
              <button
                onClick={() => handleBulkAction('delete')}
                className="px-3 py-1 bg-red-600 text-white text-sm rounded hover:bg-red-700"
              >
                Delete All
              </button>
              <button
                onClick={() => setSelectedItems(new Set())}
                className="px-3 py-1 bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 text-sm rounded"
              >
                Clear Selection
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Table */}
      <div className="flex-1 overflow-auto px-4 pb-4">
        <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 overflow-hidden">
          <table className="w-full">
            <thead className="bg-gray-50 dark:bg-gray-700/50">
              <tr>
                <th className="px-4 py-3 text-left">
                  <input
                    type="checkbox"
                    checked={selectedItems.size === filteredItems.length && filteredItems.length > 0}
                    onChange={handleSelectAll}
                    className="rounded border-gray-300"
                  />
                </th>
                <th className="px-4 py-3 text-left text-sm font-medium text-gray-700 dark:text-gray-300">
                  Item
                </th>
                <th className="px-4 py-3 text-left text-sm font-medium text-gray-700 dark:text-gray-300">
                  Type
                </th>
                <th className="px-4 py-3 text-left text-sm font-medium text-gray-700 dark:text-gray-300">
                  Creator
                </th>
                <th className="px-4 py-3 text-left text-sm font-medium text-gray-700 dark:text-gray-300">
                  Status
                </th>
                <th className="px-4 py-3 text-left text-sm font-medium text-gray-700 dark:text-gray-300">
                  Engagement
                </th>
                <th className="px-4 py-3 text-left text-sm font-medium text-gray-700 dark:text-gray-300">
                  Created
                </th>
                <th className="px-4 py-3 text-left text-sm font-medium text-gray-700 dark:text-gray-300">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
              {filteredItems.map((item) => (
                <ItemRow
                  key={item.id}
                  item={item}
                  selected={selectedItems.has(item.id)}
                  onSelect={handleSelect}
                  onAction={handleAction}
                />
              ))}
            </tbody>
          </table>

          {filteredItems.length === 0 && (
            <div className="text-center py-12">
              <Shield className="w-12 h-12 text-gray-300 dark:text-gray-600 mx-auto mb-4" />
              <p className="text-gray-500 dark:text-gray-400">No items found</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default AdminGalleryPanel;
