// @ts-nocheck — uses deprecated @tauri-apps/api/tauri import (v1 API)
/**
 * React Hook for Deep Link Handling
 * Listens to deep link events from Tauri
 */

import { useEffect, useCallback } from 'react';
import { listen } from '@tauri-apps/api/event';
import { useNavigate } from 'react-router-dom';
import { toast } from 'react-hot-toast';

interface DeepLinkPayload {
  type: 'marketplace' | 'template' | 'category' | 'purchase';
  templateId?: string;
  category?: string;
}

interface UseDeepLinkOptions {
  /**
   * Callback when marketplace deep link is opened
   */
  onMarketplace?: () => void;

  /**
   * Callback when template deep link is opened
   */
  onTemplate?: (templateId: string) => void;

  /**
   * Callback when category deep link is opened
   */
  onCategory?: (category: string) => void;

  /**
   * Callback when purchase deep link is opened
   */
  onPurchase?: (templateId: string) => void;

  /**
   * Show toast notifications
   */
  showToasts?: boolean;
}

/**
 * Hook to handle deep link events
 */
export function useDeepLink(options: UseDeepLinkOptions = {}) {
  const navigate = useNavigate();
  const { showToasts = true } = options;

  const handleDeepLink = useCallback(
    (payload: DeepLinkPayload) => {
      console.log('[DeepLink] Received:', payload);

      switch (payload.type) {
        case 'marketplace':
          if (showToasts) {
            toast.success('Opening Marketplace...');
          }
          if (options.onMarketplace) {
            options.onMarketplace();
          } else {
            navigate('/marketplace');
          }
          break;

        case 'template':
          if (payload.templateId) {
            if (showToasts) {
              toast.success(`Opening template: ${payload.templateId}`);
            }
            if (options.onTemplate) {
              options.onTemplate(payload.templateId);
            } else {
              navigate(`/marketplace/template/${payload.templateId}`);
            }
          }
          break;

        case 'category':
          if (payload.category) {
            if (showToasts) {
              toast.success(`Browsing ${payload.category} templates`);
            }
            if (options.onCategory) {
              options.onCategory(payload.category);
            } else {
              navigate(`/marketplace?category=${payload.category}`);
            }
          }
          break;

        case 'purchase':
          if (payload.templateId) {
            if (showToasts) {
              toast.success('Opening purchase flow...');
            }
            if (options.onPurchase) {
              options.onPurchase(payload.templateId);
            } else {
              navigate(`/marketplace/template/${payload.templateId}?action=purchase`);
            }
          }
          break;

        default:
          console.warn('[DeepLink] Unknown type:', payload.type);
      }
    },
    [navigate, options, showToasts]
  );

  useEffect(() => {
    console.log('[DeepLink] Setting up listener...');

    // Listen to deep link events from Tauri
    const unlisten = listen<DeepLinkPayload>('deep-link', event => {
      handleDeepLink(event.payload);
    });

    // Cleanup
    return () => {
      unlisten.then(fn => fn());
    };
  }, [handleDeepLink]);
}

/**
 * Hook for marketplace-specific deep link handling
 */
export function useMarketplaceDeepLink(
  onTemplateOpen?: (templateId: string) => void
) {
  useDeepLink({
    onMarketplace: () => {
      // Already on marketplace, do nothing
      console.log('[DeepLink] Already on marketplace');
    },
    onTemplate: templateId => {
      if (onTemplateOpen) {
        onTemplateOpen(templateId);
      }
    },
    onPurchase: templateId => {
      if (onTemplateOpen) {
        onTemplateOpen(templateId);
      }
    },
  });
}

/**
 * Test deep link (for development)
 */
export async function testDeepLink(url: string): Promise<void> {
  const { invoke } = await import('@tauri-apps/api/tauri');

  try {
    const result = await invoke<string>('test_deep_link', { url });
    console.log('[DeepLink] Test result:', result);
    toast.success('Deep link test successful!');
  } catch (error: any) {
    console.error('[DeepLink] Test failed:', error);
    toast.error(`Deep link test failed: ${error}`);
  }
}

/**
 * Check deep link status
 */
export async function checkDeepLinkStatus(): Promise<string> {
  const { invoke } = await import('@tauri-apps/api/tauri');

  try {
    const status = await invoke<string>('get_deep_link_status');
    return status;
  } catch (error: any) {
    throw new Error(`Failed to check deep link status: ${error}`);
  }
}
