/**
 * SmartSpec Pro - Asset Service
 * Service for managing project assets (images, videos, audio)
 */

import { getAuthToken } from './authService';

// ============================================
// Types
// ============================================

export interface AssetMetadata {
  prompt?: string;
  model?: string;
  provider?: string;
  width?: number;
  height?: number;
  duration?: number;
  format?: string;
  generation_time_ms?: number;
  cost_credits?: number;
}

export interface Asset {
  id: string;
  user_id: string;
  project_id?: string;
  spec_id?: string;
  filename: string;
  original_filename?: string;
  relative_path: string;
  file_size?: number;
  mime_type?: string;
  asset_type: 'image' | 'video' | 'audio';
  status: 'active' | 'archived' | 'deleted';
  version: number;
  is_latest: boolean;
  parent_asset_id?: string;
  generation_task_id?: string;
  metadata?: AssetMetadata;
  tags?: string[];
  description?: string;
  alt_text?: string;
  created_at: string;
  updated_at: string;
}

export interface AssetListResponse {
  items: Asset[];
  total: number;
  page: number;
  page_size: number;
  total_pages: number;
}

export interface AssetCreateRequest {
  filename: string;
  relative_path: string;
  asset_type: 'image' | 'video' | 'audio';
  project_id?: string;
  spec_id?: string;
  generation_task_id?: string;
  metadata?: AssetMetadata;
  tags?: string[];
  description?: string;
  alt_text?: string;
}

export interface AssetUpdateRequest {
  filename?: string;
  description?: string;
  alt_text?: string;
  tags?: string[];
  metadata?: AssetMetadata;
  status?: 'active' | 'archived' | 'deleted';
}

export interface AssetSearchParams {
  query?: string;
  asset_type?: 'image' | 'video' | 'audio';
  project_id?: string;
  spec_id?: string;
  tags?: string[];
  status?: 'active' | 'archived' | 'deleted';
  is_latest?: boolean;
  page?: number;
  page_size?: number;
  sort_by?: string;
  sort_order?: 'asc' | 'desc';
}

// ============================================
// Configuration
// ============================================

const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000';

// ============================================
// Helper Functions
// ============================================

async function fetchWithAuth(url: string, options: RequestInit = {}): Promise<Response> {
  const token = await getAuthToken();
  
  const headers = new Headers(options.headers);
  if (token) {
    headers.set('Authorization', `Bearer ${token}`);
  }
  headers.set('Content-Type', 'application/json');
  
  return fetch(url, {
    ...options,
    headers,
  });
}

function buildQueryString(params: Record<string, any>): string {
  const searchParams = new URLSearchParams();
  
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== null) {
      if (Array.isArray(value)) {
        value.forEach(v => searchParams.append(key, v));
      } else {
        searchParams.append(key, String(value));
      }
    }
  }
  
  return searchParams.toString();
}

// ============================================
// Asset Service Functions
// ============================================

/**
 * Create a new asset
 */
export async function createAsset(data: AssetCreateRequest): Promise<Asset> {
  const response = await fetchWithAuth(`${API_BASE_URL}/api/v1/assets/`, {
    method: 'POST',
    body: JSON.stringify(data),
  });
  
  if (!response.ok) {
    const error = await response.json().catch(() => ({ detail: 'Failed to create asset' }));
    throw new Error(error.detail || 'Failed to create asset');
  }
  
  return response.json();
}

/**
 * Get asset by ID
 */
export async function getAsset(assetId: string): Promise<Asset> {
  const response = await fetchWithAuth(`${API_BASE_URL}/api/v1/assets/${assetId}`);
  
  if (!response.ok) {
    if (response.status === 404) {
      throw new Error('Asset not found');
    }
    throw new Error('Failed to fetch asset');
  }
  
  return response.json();
}

/**
 * Update an asset
 */
export async function updateAsset(assetId: string, data: AssetUpdateRequest): Promise<Asset> {
  const response = await fetchWithAuth(`${API_BASE_URL}/api/v1/assets/${assetId}`, {
    method: 'PUT',
    body: JSON.stringify(data),
  });
  
  if (!response.ok) {
    const error = await response.json().catch(() => ({ detail: 'Failed to update asset' }));
    throw new Error(error.detail || 'Failed to update asset');
  }
  
  return response.json();
}

/**
 * Delete an asset
 */
export async function deleteAsset(assetId: string, hardDelete: boolean = false): Promise<void> {
  const url = `${API_BASE_URL}/api/v1/assets/${assetId}?hard_delete=${hardDelete}`;
  const response = await fetchWithAuth(url, {
    method: 'DELETE',
  });
  
  if (!response.ok) {
    throw new Error('Failed to delete asset');
  }
}

/**
 * Search and list assets
 */
export async function searchAssets(params: AssetSearchParams = {}): Promise<AssetListResponse> {
  const queryString = buildQueryString(params);
  const url = `${API_BASE_URL}/api/v1/assets/${queryString ? `?${queryString}` : ''}`;
  
  const response = await fetchWithAuth(url);
  
  if (!response.ok) {
    throw new Error('Failed to fetch assets');
  }
  
  return response.json();
}

/**
 * Get all versions of an asset
 */
export async function getAssetVersions(assetId: string): Promise<Asset[]> {
  const response = await fetchWithAuth(`${API_BASE_URL}/api/v1/assets/${assetId}/versions`);
  
  if (!response.ok) {
    throw new Error('Failed to fetch asset versions');
  }
  
  return response.json();
}

/**
 * Create a new version of an asset
 */
export async function createAssetVersion(parentAssetId: string, data: AssetCreateRequest): Promise<Asset> {
  const response = await fetchWithAuth(`${API_BASE_URL}/api/v1/assets/${parentAssetId}/version`, {
    method: 'POST',
    body: JSON.stringify(data),
  });
  
  if (!response.ok) {
    const error = await response.json().catch(() => ({ detail: 'Failed to create asset version' }));
    throw new Error(error.detail || 'Failed to create asset version');
  }
  
  return response.json();
}

/**
 * Get asset by relative path
 */
export async function getAssetByPath(relativePath: string): Promise<Asset> {
  const response = await fetchWithAuth(`${API_BASE_URL}/api/v1/assets/by-path/${encodeURIComponent(relativePath)}`);
  
  if (!response.ok) {
    if (response.status === 404) {
      throw new Error('Asset not found at specified path');
    }
    throw new Error('Failed to fetch asset');
  }
  
  return response.json();
}

// ============================================
// Utility Functions
// ============================================

/**
 * Get file size in human-readable format
 */
export function formatFileSize(bytes?: number): string {
  if (!bytes) return 'Unknown';
  
  const units = ['B', 'KB', 'MB', 'GB'];
  let size = bytes;
  let unitIndex = 0;
  
  while (size >= 1024 && unitIndex < units.length - 1) {
    size /= 1024;
    unitIndex++;
  }
  
  return `${size.toFixed(1)} ${units[unitIndex]}`;
}

/**
 * Get asset type icon
 */
export function getAssetTypeIcon(assetType: string): string {
  switch (assetType) {
    case 'image':
      return '🖼️';
    case 'video':
      return '🎬';
    case 'audio':
      return '🎵';
    default:
      return '📁';
  }
}

/**
 * Get asset type color
 */
export function getAssetTypeColor(assetType: string): string {
  switch (assetType) {
    case 'image':
      return '#4CAF50';
    case 'video':
      return '#2196F3';
    case 'audio':
      return '#FF9800';
    default:
      return '#9E9E9E';
  }
}

/**
 * Check if asset is an image
 */
export function isImageAsset(asset: Asset): boolean {
  return asset.asset_type === 'image' || 
         (asset.mime_type?.startsWith('image/') ?? false);
}

/**
 * Check if asset is a video
 */
export function isVideoAsset(asset: Asset): boolean {
  return asset.asset_type === 'video' || 
         (asset.mime_type?.startsWith('video/') ?? false);
}

/**
 * Check if asset is audio
 */
export function isAudioAsset(asset: Asset): boolean {
  return asset.asset_type === 'audio' || 
         (asset.mime_type?.startsWith('audio/') ?? false);
}
