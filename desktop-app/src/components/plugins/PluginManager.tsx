// Plugin Manager Component
// Manage installed plugins

import { useState } from 'react';
import {
  usePlugins,
  Plugin,
  PluginCategory,
  getCategoryIcon,
  getCategoryLabel,
  getStateLabel,
  isPluginEnabled,
} from '../../services/pluginService';

interface PluginManagerProps {
  className?: string;
}

export function PluginManager({ className = '' }: PluginManagerProps) {
  const {
    plugins,
    isLoading,
    error,
    enablePluginById,
    disablePluginById,
    uninstallPluginById,
  } = usePlugins();

  const [selectedCategory, setSelectedCategory] = useState<PluginCategory | 'all'>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedPlugin, setSelectedPlugin] = useState<Plugin | null>(null);

  const categories: (PluginCategory | 'all')[] = [
    'all', 'templates', 'integrations', 'ai', 'ui', 'analytics', 'export', 'other'
  ];

  const filteredPlugins = plugins.filter(plugin => {
    const matchesCategory = selectedCategory === 'all' || plugin.manifest.category === selectedCategory;
    const matchesSearch = plugin.manifest.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      plugin.manifest.description.toLowerCase().includes(searchQuery.toLowerCase());
    return matchesCategory && matchesSearch;
  });

  if (isLoading) {
    return (
      <div className={`flex items-center justify-center h-full ${className}`}>
        <div className="animate-spin w-8 h-8 border-4 border-blue-500 border-t-transparent rounded-full" />
      </div>
    );
  }

  return (
    <div className={`flex h-full bg-gray-50 dark:bg-gray-900 ${className}`}>
      {/* Sidebar */}
      <div className="w-64 bg-white dark:bg-gray-800 border-r border-gray-200 dark:border-gray-700 p-4">
        <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
          Plugins
        </h2>

        {/* Search */}
        <input
          type="text"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder="Search plugins..."
          className="w-full px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 mb-4"
        />

        {/* Categories */}
        <div className="space-y-1">
          {categories.map((category) => (
            <button
              key={category}
              onClick={() => setSelectedCategory(category)}
              className={`w-full flex items-center gap-2 px-3 py-2 text-sm rounded-lg transition-colors ${
                selectedCategory === category
                  ? 'bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300'
                  : 'text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700'
              }`}
            >
              <span>{category === 'all' ? '📦' : getCategoryIcon(category as PluginCategory)}</span>
              <span>{category === 'all' ? 'All Plugins' : getCategoryLabel(category as PluginCategory)}</span>
              <span className="ml-auto text-xs text-gray-500">
                {category === 'all'
                  ? plugins.length
                  : plugins.filter(p => p.manifest.category === category).length}
              </span>
            </button>
          ))}
        </div>
      </div>

      {/* Plugin List */}
      <div className="flex-1 p-6 overflow-y-auto">
        {error && (
          <div className="mb-4 p-4 bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300 rounded-lg">
            {error}
          </div>
        )}

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredPlugins.map((plugin) => (
            <PluginCard
              key={plugin.id}
              plugin={plugin}
              onSelect={() => setSelectedPlugin(plugin)}
              onEnable={() => enablePluginById(plugin.id)}
              onDisable={() => disablePluginById(plugin.id)}
              onUninstall={() => uninstallPluginById(plugin.id)}
            />
          ))}
        </div>

        {filteredPlugins.length === 0 && (
          <div className="text-center text-gray-500 py-12">
            <div className="text-4xl mb-2">📦</div>
            <p>No plugins found</p>
          </div>
        )}
      </div>

      {/* Plugin Detail Panel */}
      {selectedPlugin && (
        <PluginDetailPanel
          plugin={selectedPlugin}
          onClose={() => setSelectedPlugin(null)}
          onEnable={() => enablePluginById(selectedPlugin.id)}
          onDisable={() => disablePluginById(selectedPlugin.id)}
          onUninstall={() => {
            uninstallPluginById(selectedPlugin.id);
            setSelectedPlugin(null);
          }}
        />
      )}
    </div>
  );
}

// ============================================
// Plugin Card
// ============================================

interface PluginCardProps {
  plugin: Plugin;
  onSelect: () => void;
  onEnable: () => void;
  onDisable: () => void;
  onUninstall: () => void;
}

function PluginCard({ plugin, onSelect, onEnable, onDisable, onUninstall }: PluginCardProps) {
  const enabled = isPluginEnabled(plugin);

  return (
    <div
      onClick={onSelect}
      className="p-4 bg-white dark:bg-gray-800 rounded-xl shadow-sm hover:shadow-md transition-shadow cursor-pointer"
    >
      <div className="flex items-start gap-3">
        {/* Icon */}
        <div className="w-12 h-12 bg-gray-100 dark:bg-gray-700 rounded-lg flex items-center justify-center text-2xl">
          {plugin.manifest.icon || getCategoryIcon(plugin.manifest.category)}
        </div>

        {/* Info */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <h3 className="font-semibold text-gray-900 dark:text-white truncate">
              {plugin.manifest.name}
            </h3>
            <span className="text-xs text-gray-500">v{plugin.manifest.version}</span>
          </div>
          <p className="text-sm text-gray-600 dark:text-gray-400 line-clamp-2">
            {plugin.manifest.description}
          </p>
        </div>
      </div>

      {/* Footer */}
      <div className="flex items-center justify-between mt-4 pt-4 border-t border-gray-200 dark:border-gray-700">
        <span className={`text-xs px-2 py-1 rounded-full ${
          enabled
            ? 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300'
            : 'bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-400'
        }`}>
          {getStateLabel(plugin.state)}
        </span>

        <div className="flex gap-2" onClick={(e) => e.stopPropagation()}>
          {enabled ? (
            <button
              onClick={onDisable}
              className="px-3 py-1 text-xs bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded hover:bg-gray-200 dark:hover:bg-gray-600"
            >
              Disable
            </button>
          ) : (
            <button
              onClick={onEnable}
              className="px-3 py-1 text-xs bg-blue-600 text-white rounded hover:bg-blue-700"
            >
              Enable
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

// ============================================
// Plugin Detail Panel
// ============================================

interface PluginDetailPanelProps {
  plugin: Plugin;
  onClose: () => void;
  onEnable: () => void;
  onDisable: () => void;
  onUninstall: () => void;
}

function PluginDetailPanel({
  plugin,
  onClose,
  onEnable,
  onDisable,
  onUninstall,
}: PluginDetailPanelProps) {
  const enabled = isPluginEnabled(plugin);
  const [activeTab, setActiveTab] = useState<'overview' | 'settings' | 'permissions'>('overview');

  return (
    <div className="w-96 bg-white dark:bg-gray-800 border-l border-gray-200 dark:border-gray-700 flex flex-col">
      {/* Header */}
      <div className="p-4 border-b border-gray-200 dark:border-gray-700">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-gray-100 dark:bg-gray-700 rounded-lg flex items-center justify-center text-xl">
              {plugin.manifest.icon || getCategoryIcon(plugin.manifest.category)}
            </div>
            <div>
              <h3 className="font-semibold text-gray-900 dark:text-white">
                {plugin.manifest.name}
              </h3>
              <p className="text-xs text-gray-500">v{plugin.manifest.version}</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1 text-gray-500 hover:text-gray-700 dark:hover:text-gray-300"
          >
            ✕
          </button>
        </div>

        {/* Actions */}
        <div className="flex gap-2">
          {enabled ? (
            <button
              onClick={onDisable}
              className="flex-1 px-4 py-2 text-sm bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-600"
            >
              Disable
            </button>
          ) : (
            <button
              onClick={onEnable}
              className="flex-1 px-4 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700"
            >
              Enable
            </button>
          )}
          <button
            onClick={onUninstall}
            className="px-4 py-2 text-sm bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300 rounded-lg hover:bg-red-200 dark:hover:bg-red-900/50"
          >
            Uninstall
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-gray-200 dark:border-gray-700">
        {(['overview', 'settings', 'permissions'] as const).map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`flex-1 px-4 py-2 text-sm font-medium ${
              activeTab === tab
                ? 'text-blue-600 border-b-2 border-blue-600'
                : 'text-gray-500 hover:text-gray-700 dark:hover:text-gray-300'
            }`}
          >
            {tab.charAt(0).toUpperCase() + tab.slice(1)}
          </button>
        ))}
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-4">
        {activeTab === 'overview' && (
          <div className="space-y-4">
            <div>
              <h4 className="text-sm font-medium text-gray-500 mb-1">Description</h4>
              <p className="text-sm text-gray-900 dark:text-white">
                {plugin.manifest.description}
              </p>
            </div>
            <div>
              <h4 className="text-sm font-medium text-gray-500 mb-1">Author</h4>
              <p className="text-sm text-gray-900 dark:text-white">
                {plugin.manifest.author}
              </p>
            </div>
            <div>
              <h4 className="text-sm font-medium text-gray-500 mb-1">Category</h4>
              <p className="text-sm text-gray-900 dark:text-white">
                {getCategoryIcon(plugin.manifest.category)} {getCategoryLabel(plugin.manifest.category)}
              </p>
            </div>
            {plugin.manifest.tags.length > 0 && (
              <div>
                <h4 className="text-sm font-medium text-gray-500 mb-1">Tags</h4>
                <div className="flex flex-wrap gap-1">
                  {plugin.manifest.tags.map((tag) => (
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
            {plugin.manifest.homepage && (
              <div>
                <h4 className="text-sm font-medium text-gray-500 mb-1">Homepage</h4>
                <a
                  href={plugin.manifest.homepage}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-sm text-blue-600 hover:underline"
                >
                  {plugin.manifest.homepage}
                </a>
              </div>
            )}
          </div>
        )}

        {activeTab === 'settings' && (
          <div className="text-sm text-gray-500">
            {plugin.manifest.settings_schema ? (
              <p>Settings configuration coming soon...</p>
            ) : (
              <p>This plugin has no configurable settings.</p>
            )}
          </div>
        )}

        {activeTab === 'permissions' && (
          <div className="space-y-2">
            {plugin.permissions.length === 0 ? (
              <p className="text-sm text-gray-500">This plugin requires no special permissions.</p>
            ) : (
              plugin.permissions.map((permission) => (
                <div
                  key={permission}
                  className="flex items-center gap-2 p-2 bg-gray-50 dark:bg-gray-700 rounded"
                >
                  <span className="text-green-500">✓</span>
                  <span className="text-sm text-gray-700 dark:text-gray-300 capitalize">
                    {permission.replace(/_/g, ' ')}
                  </span>
                </div>
              ))
            )}
          </div>
        )}
      </div>
    </div>
  );
}

export default PluginManager;
