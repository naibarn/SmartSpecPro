/**
 * Marketplace Service
 * Handles template marketplace operations for Desktop App
 */

import { getAuthToken } from './authService';

const API_BASE_URL = `${import.meta.env.VITE_PY_BACKEND_URL || 'http://127.0.0.1:8000'}/api/v1/marketplace`;

// ==================== Types ====================

export enum TemplateCategory {
  IMAGE_GENERATION = 'image_generation',
  VIDEO_GENERATION = 'video_generation',
  AUDIO_GENERATION = 'audio_generation',
  MEDIA_SUITE = 'media_suite',
  AI_FEATURES = 'ai_features',
  UI_COMPONENTS = 'ui_components',
  BACKEND_SERVICES = 'backend_services',
  FULL_STACK = 'full_stack',
  INTEGRATIONS = 'integrations',
  UTILITIES = 'utilities',
}

export enum TemplateStatus {
  DRAFT = 'draft',
  PENDING_REVIEW = 'pending_review',
  APPROVED = 'approved',
  REJECTED = 'rejected',
  SUSPENDED = 'suspended',
  ARCHIVED = 'archived',
}

export interface MarketplaceTemplate {
  id: string;
  creator_id: string;
  name: string;
  slug: string;
  tagline: string;
  description: string;
  category: TemplateCategory;
  tags: string[];
  tech_stack: string[];
  price_credits: number;
  status: TemplateStatus;
  is_featured: boolean;
  preview_images: string[];
  demo_video_url?: string;
  version: string;
  readme_content?: string;
  download_count: number;
  purchase_count: number;
  rating_average?: number;
  rating_count: number;
  view_count: number;
  created_at: string;
  published_at?: string;
}

export interface TemplateListResponse {
  templates: MarketplaceTemplate[];
  total: number;
  limit: number;
  offset: number;
}

export interface PurchaseResponse {
  purchase_id: string;
  template_id: string;
  template_name: string;
  price_paid_credits: number;
  download_url: string;
  buyer_balance_after: number;
  message: string;
}

export interface PurchaseHistory {
  id: string;
  template_id: string;
  price_paid_credits: number;
  template_version: string;
  download_count: number;
  last_downloaded_at?: string;
  purchased_at: string;
}

export interface CreatorAnalytics {
  total_templates: number;
  approved_templates: number;
  total_revenue_credits: number;
  total_purchases: number;
  creator_share_percentage: number;
}

export interface CreateTemplateRequest {
  name: string;
  slug: string;
  tagline: string;
  description: string;
  category: TemplateCategory;
  tags?: string[];
  tech_stack: string[];
  price_credits: number;
  template_file_url: string;
  preview_images?: string[];
  demo_video_url?: string;
  readme_content?: string;
  min_smartspec_version?: string;
  dependencies?: string[];
}

export interface TemplateFilters {
  category?: TemplateCategory;
  tech_stack?: string;
  min_price?: number;
  max_price?: number;
  search?: string;
  sort_by?: 'popular' | 'recent' | 'price_low' | 'price_high' | 'rating';
  limit?: number;
  offset?: number;
}

// ==================== API Functions ====================

async function makeRequest<T>(
  endpoint: string,
  options: RequestInit = {}
): Promise<T> {
  const token = await getAuthToken();
  const headers = new Headers(options.headers);

  if (token) {
    headers.set('Authorization', `Bearer ${token}`);
  }
  headers.set('Content-Type', 'application/json');

  const response = await fetch(`${API_BASE_URL}${endpoint}`, {
    ...options,
    headers,
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ detail: 'Unknown error' }));
    throw new Error(error.detail || `HTTP ${response.status}`);
  }

  return response.json();
}

// ==================== Public Marketplace ====================

/**
 * Browse marketplace templates
 * No authentication required
 */
export async function listMarketplaceTemplates(
  filters: TemplateFilters = {}
): Promise<TemplateListResponse> {
  const params = new URLSearchParams();

  if (filters.category) params.append('category', filters.category);
  if (filters.tech_stack) params.append('tech_stack', filters.tech_stack);
  if (filters.min_price !== undefined) params.append('min_price', String(filters.min_price));
  if (filters.max_price !== undefined) params.append('max_price', String(filters.max_price));
  if (filters.search) params.append('search', filters.search);
  if (filters.sort_by) params.append('sort_by', filters.sort_by);
  if (filters.limit) params.append('limit', String(filters.limit));
  if (filters.offset) params.append('offset', String(filters.offset));

  const queryString = params.toString();
  const endpoint = `/templates${queryString ? '?' + queryString : ''}`;

  return makeRequest<TemplateListResponse>(endpoint);
}

/**
 * Get template details
 * Increments view count
 */
export async function getTemplateDetails(templateId: string): Promise<MarketplaceTemplate> {
  return makeRequest<MarketplaceTemplate>(`/templates/${templateId}`);
}

// ==================== Template Creation ====================

/**
 * Create a new template
 * Requires authentication
 */
export async function createTemplate(
  request: CreateTemplateRequest
): Promise<MarketplaceTemplate> {
  return makeRequest<MarketplaceTemplate>('/templates', {
    method: 'POST',
    body: JSON.stringify(request),
  });
}

/**
 * Submit template for admin review
 */
export async function submitTemplateForReview(templateId: string): Promise<MarketplaceTemplate> {
  return makeRequest<MarketplaceTemplate>(`/templates/${templateId}/submit`, {
    method: 'POST',
  });
}

/**
 * List templates created by current user
 */
export async function listMyTemplates(
  statusFilter?: TemplateStatus
): Promise<MarketplaceTemplate[]> {
  const params = statusFilter ? `?status_filter=${statusFilter}` : '';
  return makeRequest<MarketplaceTemplate[]>(`/my-templates${params}`);
}

/**
 * Get analytics for current user's templates
 */
export async function getMyAnalytics(): Promise<CreatorAnalytics> {
  return makeRequest<CreatorAnalytics>('/my-analytics');
}

// ==================== Purchasing ====================

/**
 * Purchase a template with credits
 * Deducts credits and enables download
 */
export async function purchaseTemplate(templateId: string): Promise<PurchaseResponse> {
  return makeRequest<PurchaseResponse>(`/templates/${templateId}/purchase`, {
    method: 'POST',
  });
}

/**
 * Check if user has already purchased a template
 */
export async function hasUserPurchased(templateId: string): Promise<boolean> {
  try {
    const purchases = await listMyPurchases();
    return purchases.some(p => p.template_id === templateId);
  } catch {
    return false;
  }
}

/**
 * Download purchased template ZIP file
 * Returns download URL and metadata
 */
export async function downloadPurchasedTemplate(
  purchaseId: string
): Promise<{ download_url: string; filename: string; version: string }> {
  return makeRequest<{ download_url: string; filename: string; version: string }>(
    `/purchases/${purchaseId}/download`
  );
}

/**
 * List templates purchased by current user
 */
export async function listMyPurchases(
  limit: number = 50,
  offset: number = 0
): Promise<PurchaseHistory[]> {
  return makeRequest<PurchaseHistory[]>(`/my-purchases?limit=${limit}&offset=${offset}`);
}

// ==================== Template Import ====================

/**
 * Download and save template ZIP to local project
 * Uses Tauri filesystem APIs
 */
export async function downloadTemplateToProject(
  purchaseId: string,
  projectPath: string
): Promise<string> {
  // Get download URL
  const { download_url, filename } = await downloadPurchasedTemplate(purchaseId);

  // Download file
  const response = await fetch(download_url);
  if (!response.ok) {
    throw new Error('Failed to download template file');
  }

  const blob = await response.blob();
  const arrayBuffer = await blob.arrayBuffer();
  const uint8Array = new Uint8Array(arrayBuffer);

  // Save to project using Tauri
  const { writeFile, BaseDirectory } = await import('@tauri-apps/api/fs');
  const { join } = await import('@tauri-apps/api/path');

  const savePath = await join(projectPath, 'templates', filename);
  await writeFile(savePath, uint8Array, { dir: BaseDirectory.Home });

  return savePath;
}

/**
 * Extract template ZIP and merge with existing project
 * This will be implemented with file system operations
 */
export async function extractAndMergeTemplate(
  zipPath: string,
  projectPath: string,
  options: {
    overwrite?: boolean;
    createBackup?: boolean;
    mergeStrategy?: 'replace' | 'merge' | 'skip-existing';
  } = {}
): Promise<{
  success: boolean;
  extractedFiles: string[];
  conflicts: string[];
  backupPath?: string;
}> {
  // This would use a ZIP library like jszip or adm-zip
  // and Tauri filesystem APIs to extract and merge files

  // TODO: Implement extraction and merging logic
  // For now, return a placeholder
  return {
    success: true,
    extractedFiles: [],
    conflicts: [],
  };
}

// ==================== Helper Functions ====================

/**
 * Format price in credits with comma separator
 */
export function formatCredits(credits: number): string {
  return credits.toLocaleString();
}

/**
 * Get category display name
 */
export function getCategoryName(category: TemplateCategory): string {
  const names: Record<TemplateCategory, string> = {
    [TemplateCategory.IMAGE_GENERATION]: 'Image Generation',
    [TemplateCategory.VIDEO_GENERATION]: 'Video Generation',
    [TemplateCategory.AUDIO_GENERATION]: 'Audio Generation',
    [TemplateCategory.MEDIA_SUITE]: 'Media Suite',
    [TemplateCategory.AI_FEATURES]: 'AI Features',
    [TemplateCategory.UI_COMPONENTS]: 'UI Components',
    [TemplateCategory.BACKEND_SERVICES]: 'Backend Services',
    [TemplateCategory.FULL_STACK]: 'Full Stack',
    [TemplateCategory.INTEGRATIONS]: 'Integrations',
    [TemplateCategory.UTILITIES]: 'Utilities',
  };
  return names[category] || category;
}

/**
 * Get category icon
 */
export function getCategoryIcon(category: TemplateCategory): string {
  const icons: Record<TemplateCategory, string> = {
    [TemplateCategory.IMAGE_GENERATION]: '🖼️',
    [TemplateCategory.VIDEO_GENERATION]: '🎬',
    [TemplateCategory.AUDIO_GENERATION]: '🎵',
    [TemplateCategory.MEDIA_SUITE]: '🎨',
    [TemplateCategory.AI_FEATURES]: '🤖',
    [TemplateCategory.UI_COMPONENTS]: '🧩',
    [TemplateCategory.BACKEND_SERVICES]: '⚙️',
    [TemplateCategory.FULL_STACK]: '🚀',
    [TemplateCategory.INTEGRATIONS]: '🔌',
    [TemplateCategory.UTILITIES]: '🔧',
  };
  return icons[category] || '📦';
}

/**
 * Calculate creator and platform revenue split
 */
export function calculateRevenueSplit(priceCredits: number): {
  total: number;
  creator: number;
  platform: number;
} {
  const creator = Math.floor(priceCredits * 0.85);
  const platform = priceCredits - creator;

  return {
    total: priceCredits,
    creator,
    platform,
  };
}

// ==================== Stubs for MarketplaceBrowser ====================
// These will be fully implemented when the marketplace feature is complete.

export type MarketplaceItemType = 'template' | 'plugin' | 'theme' | 'integration';
export type SortBy = 'popular' | 'newest' | 'price_asc' | 'price_desc' | 'rating' | 'downloads';

export interface MarketplaceItem {
  id: string;
  name: string;
  description: string;
  long_description?: string;
  type: MarketplaceItemType;
  item_type?: string;
  category: TemplateCategory;
  author: string;
  price: number;
  downloads: number;
  rating: number;
  rating_count?: number;
  tags: string[];
  thumbnailUrl?: string;
  createdAt: string;
  verified?: boolean;
  version?: string;
  license?: string;
  repository_url?: string;
}

export function getItemTypeIcon(type: MarketplaceItemType): string {
  const icons: Record<MarketplaceItemType, string> = { template: '📄', plugin: '🧩', theme: '🎨', integration: '🔌' };
  return icons[type] || '📦';
}

export function getItemTypeLabel(type: MarketplaceItemType): string {
  const labels: Record<MarketplaceItemType, string> = { template: 'Template', plugin: 'Plugin', theme: 'Theme', integration: 'Integration' };
  return labels[type] || type;
}

export function formatDownloads(count: number): string {
  if (count >= 1000) return `${(count / 1000).toFixed(1)}k`;
  return String(count);
}

export function formatRating(rating: number): string {
  return rating.toFixed(1);
}

export function useMarketplace() {
  return {
    items: [] as MarketplaceItem[],
    searchResults: [] as MarketplaceItem[],
    featuredItems: [] as MarketplaceItem[],
    categories: Object.values(TemplateCategory),
    loading: false,
    isLoading: false,
    error: null as string | null,
    search: '',
    setSearch: (_s: string) => {},
    category: null as TemplateCategory | null,
    setCategory: (_c: TemplateCategory | null) => {},
    sortBy: 'popular' as SortBy,
    setSortBy: (_s: SortBy) => {},
    itemType: null as MarketplaceItemType | null,
    setItemType: (_t: MarketplaceItemType | null) => {},
    refresh: () => {},
    install: async (_id: string) => {},
    uninstall: async (_id: string) => {},
    toggleFavorite: (_id: string) => {},
    isInstalled: (_id: string) => false,
    isFavorite: (_id: string) => false,
  };
}
