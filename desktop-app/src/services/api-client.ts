/**
 * SmartSpec Pro - API Client
 * Base client for backend API requests
 */

import { getAuthToken } from './authService';

const BASE_URL = import.meta.env.VITE_PY_BACKEND_URL || 'http://localhost:8000';

export interface ApiResponse<T = any> {
  data: T;
  status: number;
  message?: string;
}

async function request<T = any>(path: string, options: RequestInit = {}): Promise<ApiResponse<T>> {
  const token = await getAuthToken();
  const headers = new Headers(options.headers);
  
  if (token) {
    headers.set('Authorization', `Bearer ${token}`);
  }
  
  if (!(options.body instanceof FormData)) {
    headers.set('Content-Type', 'application/json');
  }

  const response = await fetch(`${BASE_URL}${path}`, {
    ...options,
    headers,
  });

  const data = await response.json();

  if (!response.ok) {
    throw new Error(data.message || 'API Request failed');
  }

  return {
    data,
    status: response.status,
  };
}

export const apiClient = {
  get: <T = any>(path: string, options?: any) => {
    const url = options?.params 
      ? `${path}?${new URLSearchParams(options.params).toString()}`
      : path;
    return request<T>(url, { method: 'GET' });
  },
  post: <T = any>(path: string, data?: any) => 
    request<T>(path, { method: 'POST', body: JSON.stringify(data) }),
  put: <T = any>(path: string, data?: any) => 
    request<T>(path, { method: 'PUT', body: JSON.stringify(data) }),
  patch: <T = any>(path: string, data?: any) => 
    request<T>(path, { method: 'PATCH', body: JSON.stringify(data) }),
  delete: <T = any>(path: string) => 
    request<T>(path, { method: 'DELETE' }),
};
