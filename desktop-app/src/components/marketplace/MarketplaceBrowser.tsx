// Marketplace Browser Component
// Browse and install marketplace items

import { useState, useEffect } from 'react';
import {
  useMarketplace,
  MarketplaceItem,
  MarketplaceItemType,
  SortBy,
  getItemTypeIcon,
  getItemTypeLabel,
  formatDownloads,
  formatRating,
} from '../../services/marketplaceService';

interface MarketplaceBrowserProps {
  className?: string;
}

export function MarketplaceBrowser({ className = '' }: MarketplaceBrowserProps) {
  const {
    searchResults,
    featuredItems,
    categories,
    isLoading,
    error,
    search,
    install,
    uninstall,
    toggleFavorite,
    isInstalled,
    isFavorite,
  } = useMarketplace();

  const [searchQuery, setSearchQuery] = useState('');
  const [selectedType, setSelectedType] = useState<MarketplaceItemType | 'all'>('all');
  const [selectedCategory, setSelectedCategory] = useState<string | 'all'>('all');
  const [sortBy, setSortBy] = useState<SortBy>('downloads');
  const [selectedItem, setSelectedItem] = useState<MarketplaceItem | null>(null);

  useEffect(() => {
    search({
      query: searchQuery || undefined,
      itemType: selectedType === 'all' ? undefined : selectedType,
      category: selectedCategory === 'all' ? undefined : selectedCategory,
      sortBy,
    });
  }, [searchQuery, selectedType, selectedCategory, sortBy, search]);

  const itemTypes: (MarketplaceItemType | 'all')[] = ['all', 'plugin', 'template', 'theme', 'integration'];

  return (
    <div className={`flex h-full bg-gray-50 dark:bg-gray-900 ${className}`}>
      {/* Sidebar */}
      <div className="w-64 bg-white dark:bg-gray-800 border-r border-gray-200 dark:border-gray-700 p-4 overflow-y-auto">
        <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
          Marketplace
        </h2>

        {/* Search */}
        <input
          type="text"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder="Search marketplace..."
          className="w-full px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 mb-4"
        />

        {/* Item Types */}
        <div className="mb-4">
          <h3 className="text-xs font-semibold text-gray-500 uppercase mb-2">Type</h3>
          <div className="space-y-1">
            {itemTypes.map((type) => (
              <button
                key={type}
                onClick={() => setSelectedType(type)}
                className={`w-full flex items-center gap-2 px-3 py-2 text-sm rounded-lg transition-colors ${
                  selectedType === type
                    ? 'bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300'
                    : 'text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700'
                }`}
              >
                <span>{type === 'all' ? '📦' : getItemTypeIcon(type)}</span>
                <span>{type === 'all' ? 'All Types' : getItemTypeLabel(type)}</span>
              </button>
            ))}
          </div>
        </div>

        {/* Categories */}
        <div className="mb-4">
          <h3 className="text-xs font-semibold text-gray-500 uppercase mb-2">Category</h3>
          <div className="space-y-1">
            <button
              onClick={() => setSelectedCategory('all')}
              className={`w-full flex items-center justify-between px-3 py-2 text-sm rounded-lg transition-colors ${
                selectedCategory === 'all'
                  ? 'bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300'
                  : 'text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700'
              }`}
            >
              <span>All Categories</span>
            </button>
            {categories.map((cat) => (
              <button
                key={cat.name}
                onClick={() => setSelectedCategory(cat.name)}
                className={`w-full flex items-center justify-between px-3 py-2 text-sm rounded-lg transition-colors ${
                  selectedCategory === cat.name
                    ? 'bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300'
                    : 'text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700'
                }`}
              >
                <span className="capitalize">{cat.name}</span>
                <span className="text-xs text-gray-500">{cat.count}</span>
              </button>
            ))}
          </div>
        </div>

        {/* Sort */}
        <div>
          <h3 className="text-xs font-semibold text-gray-500 uppercase mb-2">Sort By</h3>
          <select
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value as SortBy)}
            className="w-full px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700"
          >
            <option value="downloads">Most Downloads</option>
            <option value="rating">Highest Rated</option>
            <option value="newest">Newest</option>
            <option value="updated">Recently Updated</option>
          </select>
        </div>
      </div>

      {/* Main Content */}
      <div className="flex-1 overflow-y-auto">
        {/* Featured Section */}
        {!searchQuery && selectedType === 'all' && selectedCategory === 'all' && featuredItems.length > 0 && (
          <div className="p-6 border-b border-gray-200 dark:border-gray-700">
            <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
              Featured
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {featuredItems.slice(0, 3).map((item) => (
                <FeaturedCard
                  key={item.id}
                  item={item}
                  isInstalled={isInstalled(item.id)}
                  isFavorite={isFavorite(item.id)}
                  onSelect={() => setSelectedItem(item)}
                  onInstall={() => install(item.id)}
                  onUninstall={() => uninstall(item.id)}
                  onToggleFavorite={() => toggleFavorite(item.id)}
                />
              ))}
            </div>
          </div>
        )}

        {/* Results */}
        <div className="p-6">
          {error && (
            <div className="mb-4 p-4 bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300 rounded-lg">
              {error}
            </div>
          )}

          {isLoading ? (
            <div className="flex items-center justify-center py-12">
              <div className="animate-spin w-8 h-8 border-4 border-blue-500 border-t-transparent rounded-full" />
            </div>
          ) : searchResults ? (
            <>
              <div className="flex items-center justify-between mb-4">
                <p className="text-sm text-gray-500">
                  {searchResults.total} results
                </p>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {searchResults.items.map((item) => (
                  <ItemCard
                    key={item.id}
                    item={item}
                    isInstalled={isInstalled(item.id)}
                    isFavorite={isFavorite(item.id)}
                    onSelect={() => setSelectedItem(item)}
                    onInstall={() => install(item.id)}
                    onUninstall={() => uninstall(item.id)}
                    onToggleFavorite={() => toggleFavorite(item.id)}
                  />
                ))}
              </div>

              {searchResults.items.length === 0 && (
                <div className="text-center text-gray-500 py-12">
                  <div className="text-4xl mb-2">🔍</div>
                  <p>No items found</p>
                </div>
              )}
            </>
          ) : null}
        </div>
      </div>

      {/* Item Detail Panel */}
      {selectedItem && (
        <ItemDetailPanel
          item={selectedItem}
          isInstalled={isInstalled(selectedItem.id)}
          isFavorite={isFavorite(selectedItem.id)}
          onClose={() => setSelectedItem(null)}
          onInstall={() => install(selectedItem.id)}
          onUninstall={() => uninstall(selectedItem.id)}
          onToggleFavorite={() => toggleFavorite(selectedItem.id)}
        />
      )}
    </div>
  );
}

// ============================================
// Featured Card
// ============================================

interface FeaturedCardProps {
  item: MarketplaceItem;
  isInstalled: boolean;
  isFavorite: boolean;
  onSelect: () => void;
  onInstall: () => void;
  onUninstall: () => void;
  onToggleFavorite: () => void;
}

function FeaturedCard({
  item,
  isInstalled,
  isFavorite,
  onSelect,
  onInstall,
  onUninstall,
  onToggleFavorite,
}: FeaturedCardProps) {
  return (
    <div
      onClick={onSelect}
      className="relative p-4 bg-gradient-to-br from-blue-500 to-purple-600 rounded-xl text-white cursor-pointer hover:shadow-lg transition-shadow"
    >
      <div className="flex items-start gap-3">
        <div className="w-12 h-12 bg-white/20 rounded-lg flex items-center justify-center text-2xl">
          {getItemTypeIcon(item.item_type)}
        </div>
        <div className="flex-1">
          <div className="flex items-center gap-2">
            <h3 className="font-semibold">{item.name}</h3>
            {item.verified && <span className="text-xs">✓</span>}
          </div>
          <p className="text-sm text-white/80 line-clamp-2">{item.description}</p>
        </div>
      </div>
      <div className="flex items-center justify-between mt-4">
        <div className="flex items-center gap-3 text-sm text-white/80">
          <span>⬇ {formatDownloads(item.downloads)}</span>
          <span>★ {formatRating(item.rating)}</span>
        </div>
        <div className="flex gap-2" onClick={(e) => e.stopPropagation()}>
          <button
            onClick={onToggleFavorite}
            className="p-1.5 bg-white/20 rounded hover:bg-white/30"
          >
            {isFavorite ? '❤️' : '🤍'}
          </button>
          {isInstalled ? (
            <button
              onClick={onUninstall}
              className="px-3 py-1 text-xs bg-white/20 rounded hover:bg-white/30"
            >
              Installed
            </button>
          ) : (
            <button
              onClick={onInstall}
              className="px-3 py-1 text-xs bg-white rounded text-blue-600 hover:bg-white/90"
            >
              Install
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

// ============================================
// Item Card
// ============================================

interface ItemCardProps {
  item: MarketplaceItem;
  isInstalled: boolean;
  isFavorite: boolean;
  onSelect: () => void;
  onInstall: () => void;
  onUninstall: () => void;
  onToggleFavorite: () => void;
}

function ItemCard({
  item,
  isInstalled,
  isFavorite,
  onSelect,
  onInstall,
  onUninstall,
  onToggleFavorite,
}: ItemCardProps) {
  return (
    <div
      onClick={onSelect}
      className="p-4 bg-white dark:bg-gray-800 rounded-xl shadow-sm hover:shadow-md transition-shadow cursor-pointer"
    >
      <div className="flex items-start gap-3">
        <div className="w-12 h-12 bg-gray-100 dark:bg-gray-700 rounded-lg flex items-center justify-center text-2xl">
          {getItemTypeIcon(item.item_type)}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <h3 className="font-semibold text-gray-900 dark:text-white truncate">
              {item.name}
            </h3>
            {item.verified && (
              <span className="text-blue-500 text-xs">✓</span>
            )}
          </div>
          <p className="text-xs text-gray-500">{item.author.name}</p>
          <p className="text-sm text-gray-600 dark:text-gray-400 line-clamp-2 mt-1">
            {item.description}
          </p>
        </div>
      </div>

      <div className="flex items-center justify-between mt-4 pt-4 border-t border-gray-200 dark:border-gray-700">
        <div className="flex items-center gap-3 text-xs text-gray-500">
          <span>⬇ {formatDownloads(item.downloads)}</span>
          <span>★ {formatRating(item.rating)} ({item.rating_count})</span>
        </div>
        <div className="flex gap-2" onClick={(e) => e.stopPropagation()}>
          <button
            onClick={onToggleFavorite}
            className="p-1.5 text-gray-400 hover:text-red-500"
          >
            {isFavorite ? '❤️' : '🤍'}
          </button>
          {isInstalled ? (
            <button
              onClick={onUninstall}
              className="px-3 py-1 text-xs bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded hover:bg-gray-200 dark:hover:bg-gray-600"
            >
              Installed
            </button>
          ) : (
            <button
              onClick={onInstall}
              className="px-3 py-1 text-xs bg-blue-600 text-white rounded hover:bg-blue-700"
            >
              Install
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

// ============================================
// Item Detail Panel
// ============================================

interface ItemDetailPanelProps {
  item: MarketplaceItem;
  isInstalled: boolean;
  isFavorite: boolean;
  onClose: () => void;
  onInstall: () => void;
  onUninstall: () => void;
  onToggleFavorite: () => void;
}

function ItemDetailPanel({
  item,
  isInstalled,
  isFavorite,
  onClose,
  onInstall,
  onUninstall,
  onToggleFavorite,
}: ItemDetailPanelProps) {
  return (
    <div className="w-96 bg-white dark:bg-gray-800 border-l border-gray-200 dark:border-gray-700 flex flex-col">
      {/* Header */}
      <div className="p-4 border-b border-gray-200 dark:border-gray-700">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 bg-gray-100 dark:bg-gray-700 rounded-lg flex items-center justify-center text-2xl">
              {getItemTypeIcon(item.item_type)}
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="font-semibold text-gray-900 dark:text-white">
                  {item.name}
                </h3>
                {item.verified && <span className="text-blue-500">✓</span>}
              </div>
              <p className="text-xs text-gray-500">v{item.version} by {item.author.name}</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1 text-gray-500 hover:text-gray-700 dark:hover:text-gray-300"
          >
            ✕
          </button>
        </div>

        {/* Stats */}
        <div className="flex items-center gap-4 text-sm text-gray-500 mb-4">
          <span>⬇ {formatDownloads(item.downloads)} downloads</span>
          <span>★ {formatRating(item.rating)} ({item.rating_count})</span>
        </div>

        {/* Actions */}
        <div className="flex gap-2">
          {isInstalled ? (
            <button
              onClick={onUninstall}
              className="flex-1 px-4 py-2 text-sm bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-600"
            >
              Uninstall
            </button>
          ) : (
            <button
              onClick={onInstall}
              className="flex-1 px-4 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700"
            >
              Install
            </button>
          )}
          <button
            onClick={onToggleFavorite}
            className="px-4 py-2 text-sm bg-gray-100 dark:bg-gray-700 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-600"
          >
            {isFavorite ? '❤️' : '🤍'}
          </button>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        <div>
          <h4 className="text-sm font-medium text-gray-500 mb-1">Description</h4>
          <p className="text-sm text-gray-900 dark:text-white">
            {item.long_description || item.description}
          </p>
        </div>

        <div>
          <h4 className="text-sm font-medium text-gray-500 mb-1">Category</h4>
          <p className="text-sm text-gray-900 dark:text-white capitalize">{item.category}</p>
        </div>

        {item.tags.length > 0 && (
          <div>
            <h4 className="text-sm font-medium text-gray-500 mb-1">Tags</h4>
            <div className="flex flex-wrap gap-1">
              {item.tags.map((tag) => (
                <span
                  key={tag}
                  className="px-2 py-0.5 text-xs bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-400 rounded"
                >
                  {tag}
                </span>
              ))}
            </div>
          </div>
        )}

        <div>
          <h4 className="text-sm font-medium text-gray-500 mb-1">License</h4>
          <p className="text-sm text-gray-900 dark:text-white">{item.license}</p>
        </div>

        {item.repository_url && (
          <div>
            <h4 className="text-sm font-medium text-gray-500 mb-1">Repository</h4>
            <a
              href={item.repository_url}
              target="_blank"
              rel="noopener noreferrer"
              className="text-sm text-blue-600 hover:underline"
            >
              {item.repository_url}
            </a>
          </div>
        )}
      </div>
    </div>
  );
}

export default MarketplaceBrowser;
