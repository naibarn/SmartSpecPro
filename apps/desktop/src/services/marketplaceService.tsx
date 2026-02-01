// Marketplace Service - Frontend service for Marketplace
//
// Provides:
// - Browse and search marketplace
// - Install and manage items
// - Reviews and ratings
// - Favorites

import { invoke } from '@tauri-apps/api/core';
import React, { createContext, useContext, useState, useCallback, useEffect, ReactNode } from 'react';

// ============================================
// Types
// ============================================

export interface MarketplaceItem {
  id: string;
  item_type: MarketplaceItemType;
  name: string;
  slug: string;
  version: string;
  description: string;
  long_description?: string;
  author: Author;
  icon_url?: string;
  screenshots: string[];
  category: string;
  tags: string[];
  downloads: number;
  rating: number;
  rating_count: number;
  price: Price;
  license: string;
  repository_url?: string;
  homepage_url?: string;
  changelog: ChangelogEntry[];
  dependencies: Dependency[];
  min_app_version: string;
  published_at: number;
  updated_at: number;
  verified: boolean;
  featured: boolean;
}

export type MarketplaceItemType = 'plugin' | 'template' | 'theme' | 'integration';

export interface Author {
  id: string;
  name: string;
  avatar_url?: string;
  verified: boolean;
}

export interface Price {
  price_type: PriceType;
  amount?: number;
  currency?: string;
}

export type PriceType = 'free' | 'paid' | 'freemium';

export interface ChangelogEntry {
  version: string;
  date: number;
  changes: string[];
}

export interface Dependency {
  id: string;
  name: string;
  version_requirement: string;
}

export interface SearchResult {
  items: MarketplaceItem[];
  total: number;
  page: number;
  per_page: number;
  total_pages: number;
}

export interface InstalledItem {
  item_id: string;
  version: string;
  installed_at: number;
  auto_update: boolean;
}

export interface Review {
  id: string;
  item_id: string;
  user_id: string;
  user_name: string;
  rating: number;
  title?: string;
  content: string;
  helpful_count: number;
  created_at: number;
  updated_at: number;
}

export interface CategoryInfo {
  name: string;
  count: number;
}

export type SortBy = 'relevance' | 'downloads' | 'rating' | 'newest' | 'updated';

// ============================================
// API Functions
// ============================================

export async function searchMarketplace(params: {
  query?: string;
  itemType?: MarketplaceItemType;
  category?: string;
  tags?: string[];
  priceType?: PriceType;
  sortBy?: SortBy;
  page?: number;
  perPage?: number;
}): Promise<SearchResult> {
  return invoke('marketplace_search', {
    query: params.query,
    itemType: params.itemType,
    category: params.category,
    tags: params.tags || [],
    priceType: params.priceType,
    sortBy: params.sortBy,
    page: params.page,
    perPage: params.perPage,
  });
}

export async function getMarketplaceItem(itemId: string): Promise<MarketplaceItem> {
  return invoke('marketplace_get_item', { itemId });
}

export async function getFeaturedItems(): Promise<MarketplaceItem[]> {
  return invoke('marketplace_get_featured');
}

export async function getCategories(): Promise<CategoryInfo[]> {
  return invoke('marketplace_get_categories');
}

export async function installItem(itemId: string): Promise<InstalledItem> {
  return invoke('marketplace_install', { itemId });
}

export async function uninstallItem(itemId: string): Promise<void> {
  return invoke('marketplace_uninstall', { itemId });
}

export async function getInstalledItems(): Promise<InstalledItem[]> {
  return invoke('marketplace_get_installed');
}

export async function isItemInstalled(itemId: string): Promise<boolean> {
  return invoke('marketplace_is_installed', { itemId });
}

export async function addToFavorites(itemId: string): Promise<void> {
  return invoke('marketplace_add_favorite', { itemId });
}

export async function removeFromFavorites(itemId: string): Promise<void> {
  return invoke('marketplace_remove_favorite', { itemId });
}

export async function getFavorites(): Promise<MarketplaceItem[]> {
  return invoke('marketplace_get_favorites');
}

export async function addReview(params: {
  itemId: string;
  userId: string;
  userName: string;
  rating: number;
  title?: string;
  content: string;
}): Promise<Review> {
  return invoke('marketplace_add_review', params);
}

export async function getReviews(itemId: string): Promise<Review[]> {
  return invoke('marketplace_get_reviews', { itemId });
}

// ============================================
// Marketplace Context
// ============================================

interface MarketplaceContextValue {
  // State
  searchResults: SearchResult | null;
  featuredItems: MarketplaceItem[];
  installedItems: InstalledItem[];
  favorites: MarketplaceItem[];
  categories: CategoryInfo[];
  isLoading: boolean;
  error: string | null;
  
  // Search
  search: (params: {
    query?: string;
    itemType?: MarketplaceItemType;
    category?: string;
    tags?: string[];
    priceType?: PriceType;
    sortBy?: SortBy;
    page?: number;
  }) => Promise<void>;
  
  // Actions
  install: (itemId: string) => Promise<void>;
  uninstall: (itemId: string) => Promise<void>;
  toggleFavorite: (itemId: string) => Promise<void>;
  
  // Utilities
  isInstalled: (itemId: string) => boolean;
  isFavorite: (itemId: string) => boolean;
}

const MarketplaceContext = createContext<MarketplaceContextValue | null>(null);

export function MarketplaceProvider({ children }: { children: ReactNode }) {
  const [searchResults, setSearchResults] = useState<SearchResult | null>(null);
  const [featuredItems, setFeaturedItems] = useState<MarketplaceItem[]>([]);
  const [installedItems, setInstalledItems] = useState<InstalledItem[]>([]);
  const [favorites, setFavorites] = useState<MarketplaceItem[]>([]);
  const [categories, setCategories] = useState<CategoryInfo[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadInitialData = useCallback(async () => {
    setIsLoading(true);
    try {
      const [featured, installed, favs, cats] = await Promise.all([
        getFeaturedItems(),
        getInstalledItems(),
        getFavorites(),
        getCategories(),
      ]);
      setFeaturedItems(featured);
      setInstalledItems(installed);
      setFavorites(favs);
      setCategories(cats);
    } catch (e) {
      setError(String(e));
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    loadInitialData();
  }, [loadInitialData]);

  const search = useCallback(async (params: {
    query?: string;
    itemType?: MarketplaceItemType;
    category?: string;
    tags?: string[];
    priceType?: PriceType;
    sortBy?: SortBy;
    page?: number;
  }) => {
    setIsLoading(true);
    setError(null);
    try {
      const results = await searchMarketplace(params);
      setSearchResults(results);
    } catch (e) {
      setError(String(e));
    } finally {
      setIsLoading(false);
    }
  }, []);

  const install = useCallback(async (itemId: string) => {
    try {
      await installItem(itemId);
      const installed = await getInstalledItems();
      setInstalledItems(installed);
    } catch (e) {
      setError(String(e));
      throw e;
    }
  }, []);

  const uninstall = useCallback(async (itemId: string) => {
    try {
      await uninstallItem(itemId);
      const installed = await getInstalledItems();
      setInstalledItems(installed);
    } catch (e) {
      setError(String(e));
      throw e;
    }
  }, []);

  const toggleFavorite = useCallback(async (itemId: string) => {
    try {
      const isFav = favorites.some(f => f.id === itemId);
      if (isFav) {
        await removeFromFavorites(itemId);
      } else {
        await addToFavorites(itemId);
      }
      const favs = await getFavorites();
      setFavorites(favs);
    } catch (e) {
      setError(String(e));
      throw e;
    }
  }, [favorites]);

  const isInstalled = useCallback((itemId: string) => {
    return installedItems.some(i => i.item_id === itemId);
  }, [installedItems]);

  const isFavorite = useCallback((itemId: string) => {
    return favorites.some(f => f.id === itemId);
  }, [favorites]);

  const value: MarketplaceContextValue = {
    searchResults,
    featuredItems,
    installedItems,
    favorites,
    categories,
    isLoading,
    error,
    search,
    install,
    uninstall,
    toggleFavorite,
    isInstalled,
    isFavorite,
  };

  return (
    <MarketplaceContext.Provider value={value}>
      {children}
    </MarketplaceContext.Provider>
  );
}

export function useMarketplace() {
  const context = useContext(MarketplaceContext);
  if (!context) {
    throw new Error('useMarketplace must be used within a MarketplaceProvider');
  }
  return context;
}

// ============================================
// Utility Functions
// ============================================

export function getItemTypeIcon(type: MarketplaceItemType): string {
  const icons: Record<MarketplaceItemType, string> = {
    plugin: '🔌',
    template: '📄',
    theme: '🎨',
    integration: '🔗',
  };
  return icons[type];
}

export function getItemTypeLabel(type: MarketplaceItemType): string {
  const labels: Record<MarketplaceItemType, string> = {
    plugin: 'Plugin',
    template: 'Template',
    theme: 'Theme',
    integration: 'Integration',
  };
  return labels[type];
}

export function formatDownloads(count: number): string {
  if (count >= 1000000) {
    return `${(count / 1000000).toFixed(1)}M`;
  }
  if (count >= 1000) {
    return `${(count / 1000).toFixed(1)}K`;
  }
  return count.toString();
}

export function formatRating(rating: number): string {
  return rating.toFixed(1);
}

export function renderStars(rating: number): string {
  const fullStars = Math.floor(rating);
  const hasHalfStar = rating - fullStars >= 0.5;
  const emptyStars = 5 - fullStars - (hasHalfStar ? 1 : 0);
  
  return '★'.repeat(fullStars) + (hasHalfStar ? '½' : '') + '☆'.repeat(emptyStars);
}
