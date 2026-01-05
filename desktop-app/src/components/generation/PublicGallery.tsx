/**
 * SmartSpec Pro - Public Gallery Component
 * Browse and discover AI-generated content from the community.
 */

import React, { useState, useMemo } from 'react';
import {
  Search,
  Filter,
  Grid,
  List,
  Heart,
  Eye,
  MessageCircle,
  Download,
  Share2,
  ChevronDown,
  Sparkles,
  TrendingUp,
  Clock,
  Image,
  Video,
  Music,
  X,
  BookmarkPlus,
} from 'lucide-react';

// Types
type MediaType = 'all' | 'image' | 'video' | 'audio';
type SortBy = 'recent' | 'popular' | 'trending';
type ViewMode = 'grid' | 'list';

interface GalleryItem {
  id: string;
  title: string;
  description?: string;
  mediaType: 'image' | 'video' | 'audio';
  mediaUrl: string;
  thumbnailUrl?: string;
  prompt: string;
  modelId: string;
  modelName: string;
  category: string;
  tags: string[];
  likesCount: number;
  viewsCount: number;
  commentsCount: number;
  isFeatured: boolean;
  isNsfw: boolean;
  userId: string;
  userName: string;
  userAvatar?: string;
  createdAt: string;
  slug: string;
}

interface Category {
  id: string;
  name: string;
  count: number;
}

// Mock data
const MOCK_ITEMS: GalleryItem[] = [
  {
    id: '1',
    title: 'Sunset Over Mountains',
    description: 'A breathtaking view of a sunset painting the mountains in warm colors.',
    mediaType: 'image',
    mediaUrl: 'https://picsum.photos/seed/sunset/1200/800',
    thumbnailUrl: 'https://picsum.photos/seed/sunset/400/300',
    prompt: 'A beautiful sunset over mountains with vibrant orange and purple colors, dramatic clouds',
    modelId: 'nano-banana-pro',
    modelName: 'Nano Banana Pro',
    category: 'landscape',
    tags: ['sunset', 'mountains', 'nature', 'landscape'],
    likesCount: 234,
    viewsCount: 1520,
    commentsCount: 12,
    isFeatured: true,
    isNsfw: false,
    userId: 'user1',
    userName: 'John Doe',
    createdAt: '2025-01-02T10:30:00Z',
    slug: 'sunset-over-mountains-abc12345',
  },
  {
    id: '2',
    title: 'Cyberpunk City',
    description: 'A futuristic cityscape with neon lights and flying vehicles.',
    mediaType: 'image',
    mediaUrl: 'https://picsum.photos/seed/cyber/1200/800',
    thumbnailUrl: 'https://picsum.photos/seed/cyber/400/300',
    prompt: 'Futuristic cyberpunk city with neon lights, flying cars, rain, night scene',
    modelId: 'flux-2',
    modelName: 'FLUX 2',
    category: 'sci_fi',
    tags: ['cyberpunk', 'city', 'neon', 'futuristic'],
    likesCount: 456,
    viewsCount: 2340,
    commentsCount: 28,
    isFeatured: true,
    isNsfw: false,
    userId: 'user2',
    userName: 'Jane Smith',
    createdAt: '2025-01-01T15:45:00Z',
    slug: 'cyberpunk-city-def67890',
  },
  {
    id: '3',
    title: 'Ocean Waves',
    description: 'Calming video of ocean waves at sunset.',
    mediaType: 'video',
    mediaUrl: 'https://www.w3schools.com/html/mov_bbb.mp4',
    thumbnailUrl: 'https://picsum.photos/seed/ocean/400/300',
    prompt: 'Ocean waves crashing on the beach at golden hour, cinematic',
    modelId: 'wan/2-6-text-to-video',
    modelName: 'Wan 2.6',
    category: 'nature',
    tags: ['ocean', 'waves', 'beach', 'sunset'],
    likesCount: 189,
    viewsCount: 890,
    commentsCount: 8,
    isFeatured: false,
    isNsfw: false,
    userId: 'user3',
    userName: 'Mike Wilson',
    createdAt: '2025-01-03T08:20:00Z',
    slug: 'ocean-waves-ghi11111',
  },
  {
    id: '4',
    title: 'Fantasy Dragon',
    description: 'A majestic dragon soaring through stormy skies.',
    mediaType: 'image',
    mediaUrl: 'https://picsum.photos/seed/dragon/1200/800',
    thumbnailUrl: 'https://picsum.photos/seed/dragon/400/300',
    prompt: 'Majestic dragon flying through stormy clouds, lightning, epic fantasy art',
    modelId: 'nano-banana-pro',
    modelName: 'Nano Banana Pro',
    category: 'fantasy',
    tags: ['dragon', 'fantasy', 'epic', 'storm'],
    likesCount: 567,
    viewsCount: 3210,
    commentsCount: 45,
    isFeatured: true,
    isNsfw: false,
    userId: 'user4',
    userName: 'Sarah Connor',
    createdAt: '2024-12-30T12:00:00Z',
    slug: 'fantasy-dragon-jkl22222',
  },
  {
    id: '5',
    title: 'Welcome Message',
    description: 'Professional voice-over for app introduction.',
    mediaType: 'audio',
    mediaUrl: 'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-1.mp3',
    prompt: 'Welcome to our amazing application. We are excited to have you here.',
    modelId: 'elevenlabs/text-to-speech-turbo-2-5',
    modelName: 'ElevenLabs TTS',
    category: 'voiceover',
    tags: ['voiceover', 'professional', 'welcome'],
    likesCount: 78,
    viewsCount: 450,
    commentsCount: 3,
    isFeatured: false,
    isNsfw: false,
    userId: 'user5',
    userName: 'Alex Brown',
    createdAt: '2025-01-02T18:30:00Z',
    slug: 'welcome-message-mno33333',
  },
  {
    id: '6',
    title: 'Portrait Study',
    description: 'Realistic portrait in renaissance style.',
    mediaType: 'image',
    mediaUrl: 'https://picsum.photos/seed/portrait/800/1200',
    thumbnailUrl: 'https://picsum.photos/seed/portrait/300/400',
    prompt: 'Renaissance style portrait of a noble woman, oil painting, detailed',
    modelId: 'flux-2',
    modelName: 'FLUX 2',
    category: 'portrait',
    tags: ['portrait', 'renaissance', 'art', 'painting'],
    likesCount: 321,
    viewsCount: 1890,
    commentsCount: 19,
    isFeatured: false,
    isNsfw: false,
    userId: 'user6',
    userName: 'Emily Davis',
    createdAt: '2025-01-01T09:15:00Z',
    slug: 'portrait-study-pqr44444',
  },
];

const CATEGORIES: Category[] = [
  { id: 'all', name: 'All', count: 1250 },
  { id: 'landscape', name: 'Landscape', count: 320 },
  { id: 'portrait', name: 'Portrait', count: 280 },
  { id: 'fantasy', name: 'Fantasy', count: 195 },
  { id: 'sci_fi', name: 'Sci-Fi', count: 175 },
  { id: 'nature', name: 'Nature', count: 150 },
  { id: 'abstract', name: 'Abstract', count: 130 },
];

// Helper functions
const formatNumber = (num: number): string => {
  if (num >= 1000000) return `${(num / 1000000).toFixed(1)}M`;
  if (num >= 1000) return `${(num / 1000).toFixed(1)}K`;
  return num.toString();
};

const formatDate = (dateString: string): string => {
  const date = new Date(dateString);
  const now = new Date();
  const diff = now.getTime() - date.getTime();
  const days = Math.floor(diff / (1000 * 60 * 60 * 24));
  
  if (days === 0) return 'Today';
  if (days === 1) return 'Yesterday';
  if (days < 7) return `${days} days ago`;
  return date.toLocaleDateString();
};

const getMediaIcon = (type: 'image' | 'video' | 'audio') => {
  switch (type) {
    case 'image': return <Image className="w-4 h-4" />;
    case 'video': return <Video className="w-4 h-4" />;
    case 'audio': return <Music className="w-4 h-4" />;
  }
};

// Gallery Card Component
const GalleryCard: React.FC<{
  item: GalleryItem;
  onClick: () => void;
}> = ({ item, onClick }) => {
  const [liked, setLiked] = useState(false);
  const [likesCount, setLikesCount] = useState(item.likesCount);

  const handleLike = (e: React.MouseEvent) => {
    e.stopPropagation();
    setLiked(!liked);
    setLikesCount(liked ? likesCount - 1 : likesCount + 1);
  };

  return (
    <div
      onClick={onClick}
      className="group bg-white dark:bg-gray-800 rounded-xl overflow-hidden shadow-sm hover:shadow-lg transition-all cursor-pointer"
    >
      {/* Thumbnail */}
      <div className="relative aspect-[4/3] bg-gray-100 dark:bg-gray-700 overflow-hidden">
        {item.mediaType === 'image' && (
          <img
            src={item.thumbnailUrl || item.mediaUrl}
            alt={item.title}
            className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
          />
        )}
        {item.mediaType === 'video' && (
          <>
            <img
              src={item.thumbnailUrl || 'https://picsum.photos/400/300'}
              alt={item.title}
              className="w-full h-full object-cover"
            />
            <div className="absolute inset-0 flex items-center justify-center">
              <div className="w-12 h-12 bg-black/50 rounded-full flex items-center justify-center">
                <Video className="w-6 h-6 text-white" />
              </div>
            </div>
          </>
        )}
        {item.mediaType === 'audio' && (
          <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-purple-500 to-pink-500">
            <Music className="w-16 h-16 text-white" />
          </div>
        )}

        {/* Badges */}
        <div className="absolute top-2 left-2 flex gap-2">
          {item.isFeatured && (
            <span className="px-2 py-1 bg-yellow-500 text-white text-xs font-medium rounded-full flex items-center gap-1">
              <Sparkles className="w-3 h-3" />
              Featured
            </span>
          )}
          <span className="px-2 py-1 bg-black/50 text-white text-xs rounded-full flex items-center gap-1">
            {getMediaIcon(item.mediaType)}
            {item.mediaType}
          </span>
        </div>

        {/* Quick Actions */}
        <div className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity">
          <button
            onClick={handleLike}
            className={`p-2 rounded-full ${
              liked ? 'bg-red-500 text-white' : 'bg-white/90 text-gray-700'
            }`}
          >
            <Heart className={`w-4 h-4 ${liked ? 'fill-current' : ''}`} />
          </button>
        </div>
      </div>

      {/* Content */}
      <div className="p-4">
        <h3 className="font-semibold text-gray-900 dark:text-white truncate">
          {item.title}
        </h3>
        <p className="text-sm text-gray-500 dark:text-gray-400 mt-1 line-clamp-2">
          {item.prompt}
        </p>

        {/* Tags */}
        <div className="flex flex-wrap gap-1 mt-2">
          {item.tags.slice(0, 3).map((tag) => (
            <span
              key={tag}
              className="px-2 py-0.5 bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-400 text-xs rounded"
            >
              #{tag}
            </span>
          ))}
        </div>

        {/* Stats */}
        <div className="flex items-center justify-between mt-3 pt-3 border-t border-gray-100 dark:border-gray-700">
          <div className="flex items-center gap-3 text-sm text-gray-500">
            <span className="flex items-center gap-1">
              <Heart className="w-4 h-4" />
              {formatNumber(likesCount)}
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
          <span className="text-xs text-gray-400">{formatDate(item.createdAt)}</span>
        </div>
      </div>
    </div>
  );
};

// Detail Modal Component
const DetailModal: React.FC<{
  item: GalleryItem | null;
  onClose: () => void;
}> = ({ item, onClose }) => {
  if (!item) return null;

  return (
    <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-4">
      <div className="bg-white dark:bg-gray-900 rounded-xl max-w-5xl w-full max-h-[90vh] overflow-hidden flex flex-col md:flex-row">
        {/* Media */}
        <div className="flex-1 bg-black flex items-center justify-center min-h-[300px]">
          {item.mediaType === 'image' && (
            <img
              src={item.mediaUrl}
              alt={item.title}
              className="max-w-full max-h-[70vh] object-contain"
            />
          )}
          {item.mediaType === 'video' && (
            <video
              src={item.mediaUrl}
              controls
              autoPlay
              className="max-w-full max-h-[70vh]"
            />
          )}
          {item.mediaType === 'audio' && (
            <div className="p-8 w-full">
              <div className="flex items-center justify-center mb-8">
                <div className="w-32 h-32 bg-gradient-to-br from-purple-500 to-pink-500 rounded-full flex items-center justify-center">
                  <Music className="w-16 h-16 text-white" />
                </div>
              </div>
              <audio src={item.mediaUrl} controls className="w-full" />
            </div>
          )}
        </div>

        {/* Info */}
        <div className="w-full md:w-96 flex flex-col">
          {/* Header */}
          <div className="p-4 border-b border-gray-200 dark:border-gray-700 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-gray-200 dark:bg-gray-700 rounded-full" />
              <div>
                <p className="font-medium text-gray-900 dark:text-white">{item.userName}</p>
                <p className="text-sm text-gray-500">{formatDate(item.createdAt)}</p>
              </div>
            </div>
            <button
              onClick={onClose}
              className="p-2 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Content */}
          <div className="flex-1 overflow-y-auto p-4 space-y-4">
            <div>
              <h2 className="text-xl font-bold text-gray-900 dark:text-white">{item.title}</h2>
              {item.description && (
                <p className="text-gray-600 dark:text-gray-400 mt-2">{item.description}</p>
              )}
            </div>

            <div>
              <h3 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Prompt</h3>
              <p className="text-sm text-gray-600 dark:text-gray-400 bg-gray-50 dark:bg-gray-800 p-3 rounded-lg">
                {item.prompt}
              </p>
            </div>

            <div>
              <h3 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Model</h3>
              <p className="text-sm text-gray-600 dark:text-gray-400">{item.modelName}</p>
            </div>

            <div>
              <h3 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Tags</h3>
              <div className="flex flex-wrap gap-2">
                {item.tags.map((tag) => (
                  <span
                    key={tag}
                    className="px-2 py-1 bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 text-sm rounded"
                  >
                    #{tag}
                  </span>
                ))}
              </div>
            </div>

            {/* Stats */}
            <div className="flex items-center gap-4 text-sm text-gray-500">
              <span className="flex items-center gap-1">
                <Heart className="w-4 h-4" />
                {formatNumber(item.likesCount)} likes
              </span>
              <span className="flex items-center gap-1">
                <Eye className="w-4 h-4" />
                {formatNumber(item.viewsCount)} views
              </span>
              <span className="flex items-center gap-1">
                <MessageCircle className="w-4 h-4" />
                {item.commentsCount} comments
              </span>
            </div>
          </div>

          {/* Actions */}
          <div className="p-4 border-t border-gray-200 dark:border-gray-700 flex gap-2">
            <button className="flex-1 flex items-center justify-center gap-2 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700">
              <Heart className="w-4 h-4" />
              Like
            </button>
            <button className="flex-1 flex items-center justify-center gap-2 py-2 bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-300 dark:hover:bg-gray-600">
              <BookmarkPlus className="w-4 h-4" />
              Save
            </button>
            <button className="p-2 bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-300 dark:hover:bg-gray-600">
              <Share2 className="w-4 h-4" />
            </button>
            <button
              onClick={() => window.open(item.mediaUrl, '_blank')}
              className="p-2 bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-300 dark:hover:bg-gray-600"
            >
              <Download className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

// Main Public Gallery Component
export const PublicGallery: React.FC = () => {
  const [items] = useState<GalleryItem[]>(MOCK_ITEMS);
  const [searchQuery, setSearchQuery] = useState('');
  const [mediaType, setMediaType] = useState<MediaType>('all');
  const [category, setCategory] = useState('all');
  const [sortBy, setSortBy] = useState<SortBy>('trending');
  const [viewMode, setViewMode] = useState<ViewMode>('grid');
  const [selectedItem, setSelectedItem] = useState<GalleryItem | null>(null);
  const [showFilters, setShowFilters] = useState(false);

  // Filter items
  const filteredItems = useMemo(() => {
    return items.filter((item) => {
      if (searchQuery) {
        const query = searchQuery.toLowerCase();
        if (
          !item.title.toLowerCase().includes(query) &&
          !item.prompt.toLowerCase().includes(query) &&
          !item.tags.some((t) => t.toLowerCase().includes(query))
        ) {
          return false;
        }
      }
      if (mediaType !== 'all' && item.mediaType !== mediaType) return false;
      if (category !== 'all' && item.category !== category) return false;
      return true;
    });
  }, [items, searchQuery, mediaType, category]);

  // Sort items
  const sortedItems = useMemo(() => {
    const sorted = [...filteredItems];
    switch (sortBy) {
      case 'recent':
        return sorted.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
      case 'popular':
        return sorted.sort((a, b) => b.likesCount - a.likesCount);
      case 'trending':
        return sorted.sort((a, b) => (b.likesCount * 2 + b.viewsCount) - (a.likesCount * 2 + a.viewsCount));
    }
  }, [filteredItems, sortBy]);

  return (
    <div className="h-full flex flex-col bg-gray-50 dark:bg-gray-900">
      {/* Header */}
      <div className="bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700">
        <div className="p-4">
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white flex items-center gap-2">
            <Sparkles className="w-7 h-7 text-blue-500" />
            Community Gallery
          </h1>
          <p className="text-gray-500 dark:text-gray-400 mt-1">
            Discover amazing AI-generated content from the community
          </p>
        </div>

        {/* Search & Filters */}
        <div className="px-4 pb-4 space-y-4">
          {/* Search Bar */}
          <div className="flex gap-2">
            <div className="flex-1 relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search by title, prompt, or tags..."
                className="w-full pl-10 pr-4 py-2.5 border border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white"
              />
            </div>
            <button
              onClick={() => setShowFilters(!showFilters)}
              className={`px-4 py-2.5 border rounded-lg flex items-center gap-2 ${
                showFilters
                  ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20 text-blue-600'
                  : 'border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-400'
              }`}
            >
              <Filter className="w-5 h-5" />
              Filters
              <ChevronDown className={`w-4 h-4 transition-transform ${showFilters ? 'rotate-180' : ''}`} />
            </button>
          </div>

          {/* Filter Options */}
          {showFilters && (
            <div className="flex flex-wrap gap-4 p-4 bg-gray-50 dark:bg-gray-800/50 rounded-lg">
              {/* Media Type */}
              <div>
                <label className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2 block">
                  Media Type
                </label>
                <div className="flex gap-2">
                  {(['all', 'image', 'video', 'audio'] as MediaType[]).map((type) => (
                    <button
                      key={type}
                      onClick={() => setMediaType(type)}
                      className={`px-3 py-1.5 rounded-lg text-sm ${
                        mediaType === type
                          ? 'bg-blue-600 text-white'
                          : 'bg-white dark:bg-gray-700 text-gray-600 dark:text-gray-400'
                      }`}
                    >
                      {type === 'all' ? 'All' : type.charAt(0).toUpperCase() + type.slice(1)}
                    </button>
                  ))}
                </div>
              </div>

              {/* Category */}
              <div>
                <label className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2 block">
                  Category
                </label>
                <select
                  value={category}
                  onChange={(e) => setCategory(e.target.value)}
                  className="px-3 py-1.5 border border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                >
                  {CATEGORIES.map((cat) => (
                    <option key={cat.id} value={cat.id}>
                      {cat.name} ({cat.count})
                    </option>
                  ))}
                </select>
              </div>
            </div>
          )}

          {/* Sort & View Options */}
          <div className="flex items-center justify-between">
            <div className="flex gap-2">
              <button
                onClick={() => setSortBy('trending')}
                className={`px-3 py-1.5 rounded-lg text-sm flex items-center gap-1 ${
                  sortBy === 'trending'
                    ? 'bg-blue-600 text-white'
                    : 'bg-white dark:bg-gray-700 text-gray-600 dark:text-gray-400'
                }`}
              >
                <TrendingUp className="w-4 h-4" />
                Trending
              </button>
              <button
                onClick={() => setSortBy('popular')}
                className={`px-3 py-1.5 rounded-lg text-sm flex items-center gap-1 ${
                  sortBy === 'popular'
                    ? 'bg-blue-600 text-white'
                    : 'bg-white dark:bg-gray-700 text-gray-600 dark:text-gray-400'
                }`}
              >
                <Heart className="w-4 h-4" />
                Popular
              </button>
              <button
                onClick={() => setSortBy('recent')}
                className={`px-3 py-1.5 rounded-lg text-sm flex items-center gap-1 ${
                  sortBy === 'recent'
                    ? 'bg-blue-600 text-white'
                    : 'bg-white dark:bg-gray-700 text-gray-600 dark:text-gray-400'
                }`}
              >
                <Clock className="w-4 h-4" />
                Recent
              </button>
            </div>

            <div className="flex gap-1">
              <button
                onClick={() => setViewMode('grid')}
                className={`p-2 rounded-lg ${
                  viewMode === 'grid'
                    ? 'bg-gray-200 dark:bg-gray-700'
                    : 'hover:bg-gray-100 dark:hover:bg-gray-800'
                }`}
              >
                <Grid className="w-5 h-5" />
              </button>
              <button
                onClick={() => setViewMode('list')}
                className={`p-2 rounded-lg ${
                  viewMode === 'list'
                    ? 'bg-gray-200 dark:bg-gray-700'
                    : 'hover:bg-gray-100 dark:hover:bg-gray-800'
                }`}
              >
                <List className="w-5 h-5" />
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Gallery Grid */}
      <div className="flex-1 overflow-y-auto p-4">
        {sortedItems.length === 0 ? (
          <div className="text-center py-12">
            <Sparkles className="w-12 h-12 text-gray-300 dark:text-gray-600 mx-auto mb-4" />
            <p className="text-gray-500 dark:text-gray-400">No items found</p>
          </div>
        ) : (
          <div
            className={
              viewMode === 'grid'
                ? 'grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4'
                : 'space-y-4'
            }
          >
            {sortedItems.map((item) => (
              <GalleryCard
                key={item.id}
                item={item}
                onClick={() => setSelectedItem(item)}
              />
            ))}
          </div>
        )}
      </div>

      {/* Detail Modal */}
      <DetailModal item={selectedItem} onClose={() => setSelectedItem(null)} />
    </div>
  );
};

export default PublicGallery;
