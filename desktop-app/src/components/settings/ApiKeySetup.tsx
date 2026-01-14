/**
 * API Key Setup Component
 * 
 * RISK-002 FIX: Shows migration notice and allows users to manage API keys
 */

import React, { useState, useEffect } from 'react';
import { 
  listStoredApiKeys, 
  setApiKey, 
  deleteApiKey, 
  hasApiKey,
  type LLMProvider 
} from '../../services/authService';

// Provider configuration
const PROVIDERS: { id: LLMProvider; name: string; description: string; docsUrl: string }[] = [
  {
    id: 'openrouter',
    name: 'OpenRouter',
    description: 'Access multiple LLM providers through a single API',
    docsUrl: 'https://openrouter.ai/keys',
  },
  {
    id: 'openai',
    name: 'OpenAI',
    description: 'GPT-4, GPT-3.5 and other OpenAI models',
    docsUrl: 'https://platform.openai.com/api-keys',
  },
  {
    id: 'anthropic',
    name: 'Anthropic',
    description: 'Claude 3 Opus, Sonnet, and Haiku models',
    docsUrl: 'https://console.anthropic.com/settings/keys',
  },
  {
    id: 'deepseek',
    name: 'Deepseek',
    description: 'Deepseek Coder and Chat models',
    docsUrl: 'https://platform.deepseek.com/api_keys',
  },
  {
    id: 'google',
    name: 'Google AI',
    description: 'Gemini Pro and other Google AI models',
    docsUrl: 'https://aistudio.google.com/app/apikey',
  },
];

interface ApiKeySetupProps {
  onComplete?: () => void;
  showMigrationNotice?: boolean;
}

export function ApiKeySetup({ onComplete, showMigrationNotice = true }: ApiKeySetupProps) {
  const [storedProviders, setStoredProviders] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [apiKeys, setApiKeys] = useState<Record<string, string>>({});
  const [showKeys, setShowKeys] = useState<Record<string, boolean>>({});

  // Load stored API keys on mount
  useEffect(() => {
    loadStoredKeys();
  }, []);

  const loadStoredKeys = async () => {
    setLoading(true);
    try {
      const stored = await listStoredApiKeys();
      setStoredProviders(stored);
    } catch (e) {
      console.error('Failed to load stored keys:', e);
    } finally {
      setLoading(false);
    }
  };

  const handleSaveKey = async (provider: LLMProvider) => {
    const key = apiKeys[provider];
    if (!key || key.trim() === '') {
      setError(`Please enter an API key for ${provider}`);
      return;
    }

    setSaving(provider);
    setError(null);
    setSuccess(null);

    try {
      await setApiKey(provider, key.trim());
      setStoredProviders(prev => [...new Set([...prev, provider])]);
      setApiKeys(prev => ({ ...prev, [provider]: '' }));
      setSuccess(`${provider} API key saved successfully`);
      
      // Clear success message after 3 seconds
      setTimeout(() => setSuccess(null), 3000);
    } catch (e) {
      setError(`Failed to save ${provider} API key: ${e}`);
    } finally {
      setSaving(null);
    }
  };

  const handleDeleteKey = async (provider: LLMProvider) => {
    if (!confirm(`Are you sure you want to delete the ${provider} API key?`)) {
      return;
    }

    setSaving(provider);
    setError(null);

    try {
      await deleteApiKey(provider);
      setStoredProviders(prev => prev.filter(p => p !== provider));
      setSuccess(`${provider} API key deleted`);
      setTimeout(() => setSuccess(null), 3000);
    } catch (e) {
      setError(`Failed to delete ${provider} API key: ${e}`);
    } finally {
      setSaving(null);
    }
  };

  const toggleShowKey = (provider: string) => {
    setShowKeys(prev => ({ ...prev, [provider]: !prev[provider] }));
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center p-8">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  const hasAnyKey = storedProviders.length > 0;

  return (
    <div className="space-y-6">
      {/* Migration Notice */}
      {showMigrationNotice && !hasAnyKey && (
        <div className="bg-amber-50 border border-amber-200 rounded-lg p-4">
          <div className="flex items-start">
            <svg className="w-5 h-5 text-amber-600 mt-0.5 mr-3 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
            <div>
              <h3 className="text-amber-800 font-semibold">API Keys Required</h3>
              <p className="text-amber-700 text-sm mt-1">
                Due to a security update, API keys are now stored securely in your system's credential manager.
                Please re-enter your API keys to continue using AI features.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Success Message */}
      {success && (
        <div className="bg-green-50 border border-green-200 rounded-lg p-4">
          <div className="flex items-center">
            <svg className="w-5 h-5 text-green-600 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
            <span className="text-green-700">{success}</span>
          </div>
        </div>
      )}

      {/* Error Message */}
      {error && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4">
          <div className="flex items-center">
            <svg className="w-5 h-5 text-red-600 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
            <span className="text-red-700">{error}</span>
          </div>
        </div>
      )}

      {/* Provider List */}
      <div className="space-y-4">
        {PROVIDERS.map(provider => {
          const isStored = storedProviders.includes(provider.id);
          const isSaving = saving === provider.id;

          return (
            <div 
              key={provider.id}
              className={`border rounded-lg p-4 ${isStored ? 'border-green-200 bg-green-50' : 'border-gray-200'}`}
            >
              <div className="flex items-start justify-between">
                <div className="flex-1">
                  <div className="flex items-center">
                    <h4 className="font-medium text-gray-900">{provider.name}</h4>
                    {isStored && (
                      <span className="ml-2 inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-green-100 text-green-800">
                        <svg className="w-3 h-3 mr-1" fill="currentColor" viewBox="0 0 20 20">
                          <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                        </svg>
                        Configured
                      </span>
                    )}
                  </div>
                  <p className="text-sm text-gray-500 mt-1">{provider.description}</p>
                  <a 
                    href={provider.docsUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-sm text-blue-600 hover:text-blue-800 mt-1 inline-flex items-center"
                  >
                    Get API Key
                    <svg className="w-3 h-3 ml-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                    </svg>
                  </a>
                </div>
              </div>

              {/* Input for new/update key */}
              <div className="mt-3 flex gap-2">
                <div className="relative flex-1">
                  <input
                    type={showKeys[provider.id] ? 'text' : 'password'}
                    value={apiKeys[provider.id] || ''}
                    onChange={(e) => setApiKeys(prev => ({ ...prev, [provider.id]: e.target.value }))}
                    placeholder={isStored ? 'Enter new key to update...' : 'Enter API key...'}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent pr-10"
                    disabled={isSaving}
                  />
                  <button
                    type="button"
                    onClick={() => toggleShowKey(provider.id)}
                    className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                  >
                    {showKeys[provider.id] ? (
                      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21" />
                      </svg>
                    ) : (
                      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                      </svg>
                    )}
                  </button>
                </div>
                <button
                  onClick={() => handleSaveKey(provider.id)}
                  disabled={isSaving || !apiKeys[provider.id]}
                  className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center"
                >
                  {isSaving ? (
                    <svg className="animate-spin h-4 w-4" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                    </svg>
                  ) : (
                    'Save'
                  )}
                </button>
                {isStored && (
                  <button
                    onClick={() => handleDeleteKey(provider.id)}
                    disabled={isSaving}
                    className="px-4 py-2 bg-red-100 text-red-700 rounded-md hover:bg-red-200 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    Delete
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Complete Button */}
      {onComplete && hasAnyKey && (
        <div className="flex justify-end pt-4 border-t">
          <button
            onClick={onComplete}
            className="px-6 py-2 bg-green-600 text-white rounded-md hover:bg-green-700"
          >
            Continue to App
          </button>
        </div>
      )}

      {/* Info Box */}
      <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
        <div className="flex items-start">
          <svg className="w-5 h-5 text-blue-600 mt-0.5 mr-3 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          <div className="text-sm text-blue-700">
            <p className="font-medium">Security Information</p>
            <p className="mt-1">
              Your API keys are stored securely in your operating system's credential manager 
              (Windows Credential Manager, macOS Keychain, or Linux Secret Service). 
              They are never sent to our servers or stored in plain text.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

/**
 * Compact API Key Status Badge
 * Shows whether API keys are configured
 */
export function ApiKeyStatusBadge() {
  const [hasKeys, setHasKeys] = useState<boolean | null>(null);

  useEffect(() => {
    listStoredApiKeys().then(keys => setHasKeys(keys.length > 0));
  }, []);

  if (hasKeys === null) return null;

  return (
    <span className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-medium ${
      hasKeys 
        ? 'bg-green-100 text-green-800' 
        : 'bg-amber-100 text-amber-800'
    }`}>
      {hasKeys ? (
        <>
          <svg className="w-3 h-3 mr-1" fill="currentColor" viewBox="0 0 20 20">
            <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
          </svg>
          API Keys Configured
        </>
      ) : (
        <>
          <svg className="w-3 h-3 mr-1" fill="currentColor" viewBox="0 0 20 20">
            <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
          </svg>
          API Keys Required
        </>
      )}
    </span>
  );
}

export default ApiKeySetup;
