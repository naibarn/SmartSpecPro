/**
 * Settings Page
 * 
 * Comprehensive settings management for SmartSpec Pro
 * Includes API Keys, Rate Limits, Preferences, and Security settings
 */

import React, { useState, useEffect } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { ApiKeySetup } from '../components/settings/ApiKeySetup';
import { RateLimitStatus } from '../components/ratelimit/RateLimitStatus';

// Tab types
type SettingsTab = 'api-keys' | 'rate-limits' | 'preferences' | 'security' | 'about';

interface TabConfig {
  id: SettingsTab;
  label: string;
  icon: React.ReactNode;
}

const TABS: TabConfig[] = [
  {
    id: 'api-keys',
    label: 'API Keys',
    icon: (
      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z" />
      </svg>
    ),
  },
  {
    id: 'rate-limits',
    label: 'Rate Limits',
    icon: (
      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
      </svg>
    ),
  },
  {
    id: 'preferences',
    label: 'Preferences',
    icon: (
      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6V4m0 2a2 2 0 100 4m0-4a2 2 0 110 4m-6 8a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4m6 6v10m6-2a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4" />
      </svg>
    ),
  },
  {
    id: 'security',
    label: 'Security',
    icon: (
      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
      </svg>
    ),
  },
  {
    id: 'about',
    label: 'About',
    icon: (
      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
      </svg>
    ),
  },
];

// Preferences Component
function PreferencesTab() {
  const [preferences, setPreferences] = useState({
    theme: 'system',
    language: 'en',
    defaultModel: 'openrouter',
    autoSave: true,
    autoSaveInterval: 30,
    showLineNumbers: true,
    fontSize: 14,
    tabSize: 2,
    wordWrap: true,
  });

  const handleChange = (key: string, value: unknown) => {
    setPreferences(prev => ({ ...prev, [key]: value }));
    // TODO: Save to backend
  };

  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-lg font-medium text-gray-900 mb-4">Appearance</h3>
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <label className="font-medium text-gray-700">Theme</label>
              <p className="text-sm text-gray-500">Choose your preferred color scheme</p>
            </div>
            <select
              value={preferences.theme}
              onChange={(e) => handleChange('theme', e.target.value)}
              className="px-3 py-2 border rounded-md"
            >
              <option value="system">System</option>
              <option value="light">Light</option>
              <option value="dark">Dark</option>
            </select>
          </div>

          <div className="flex items-center justify-between">
            <div>
              <label className="font-medium text-gray-700">Font Size</label>
              <p className="text-sm text-gray-500">Editor font size in pixels</p>
            </div>
            <input
              type="number"
              value={preferences.fontSize}
              onChange={(e) => handleChange('fontSize', parseInt(e.target.value))}
              className="w-20 px-3 py-2 border rounded-md"
              min={10}
              max={24}
            />
          </div>
        </div>
      </div>

      <div className="border-t pt-6">
        <h3 className="text-lg font-medium text-gray-900 mb-4">Editor</h3>
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <label className="font-medium text-gray-700">Auto Save</label>
              <p className="text-sm text-gray-500">Automatically save changes</p>
            </div>
            <label className="relative inline-flex items-center cursor-pointer">
              <input
                type="checkbox"
                checked={preferences.autoSave}
                onChange={(e) => handleChange('autoSave', e.target.checked)}
                className="sr-only peer"
              />
              <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-blue-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-600"></div>
            </label>
          </div>

          <div className="flex items-center justify-between">
            <div>
              <label className="font-medium text-gray-700">Show Line Numbers</label>
              <p className="text-sm text-gray-500">Display line numbers in editor</p>
            </div>
            <label className="relative inline-flex items-center cursor-pointer">
              <input
                type="checkbox"
                checked={preferences.showLineNumbers}
                onChange={(e) => handleChange('showLineNumbers', e.target.checked)}
                className="sr-only peer"
              />
              <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-blue-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-600"></div>
            </label>
          </div>

          <div className="flex items-center justify-between">
            <div>
              <label className="font-medium text-gray-700">Word Wrap</label>
              <p className="text-sm text-gray-500">Wrap long lines</p>
            </div>
            <label className="relative inline-flex items-center cursor-pointer">
              <input
                type="checkbox"
                checked={preferences.wordWrap}
                onChange={(e) => handleChange('wordWrap', e.target.checked)}
                className="sr-only peer"
              />
              <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-blue-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-600"></div>
            </label>
          </div>

          <div className="flex items-center justify-between">
            <div>
              <label className="font-medium text-gray-700">Tab Size</label>
              <p className="text-sm text-gray-500">Number of spaces per tab</p>
            </div>
            <select
              value={preferences.tabSize}
              onChange={(e) => handleChange('tabSize', parseInt(e.target.value))}
              className="px-3 py-2 border rounded-md"
            >
              <option value={2}>2 spaces</option>
              <option value={4}>4 spaces</option>
              <option value={8}>8 spaces</option>
            </select>
          </div>
        </div>
      </div>
    </div>
  );
}

// Security Component
function SecurityTab() {
  const [securityInfo, setSecurityInfo] = useState({
    keyringAvailable: true,
    credentialsStored: 0,
    lastBackup: null as string | null,
  });

  useEffect(() => {
    // Fetch security info
    invoke<{ keyring_available: boolean; credentials_count: number }>('get_security_info')
      .then(info => {
        setSecurityInfo({
          keyringAvailable: info.keyring_available,
          credentialsStored: info.credentials_count,
          lastBackup: null,
        });
      })
      .catch(console.error);
  }, []);

  const handleClearAllCredentials = async () => {
    if (!confirm('Are you sure you want to clear all stored credentials? This action cannot be undone.')) {
      return;
    }
    
    try {
      await invoke('clear_all_credentials');
      setSecurityInfo(prev => ({ ...prev, credentialsStored: 0 }));
    } catch (e) {
      console.error('Failed to clear credentials:', e);
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-lg font-medium text-gray-900 mb-4">Credential Storage</h3>
        
        <div className="bg-gray-50 rounded-lg p-4 space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-gray-600">Keyring Status</span>
            <span className={`inline-flex items-center px-2 py-1 rounded text-sm ${
              securityInfo.keyringAvailable 
                ? 'bg-green-100 text-green-800' 
                : 'bg-red-100 text-red-800'
            }`}>
              {securityInfo.keyringAvailable ? 'Available' : 'Unavailable'}
            </span>
          </div>
          
          <div className="flex items-center justify-between">
            <span className="text-gray-600">Stored Credentials</span>
            <span className="font-medium">{securityInfo.credentialsStored}</span>
          </div>
        </div>
      </div>

      <div className="border-t pt-6">
        <h3 className="text-lg font-medium text-gray-900 mb-4">Security Actions</h3>
        
        <div className="space-y-3">
          <button
            onClick={handleClearAllCredentials}
            className="w-full px-4 py-2 bg-red-100 text-red-700 rounded-lg hover:bg-red-200 text-left flex items-center"
          >
            <svg className="w-5 h-5 mr-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
            </svg>
            Clear All Credentials
          </button>
        </div>
      </div>

      <div className="border-t pt-6">
        <h3 className="text-lg font-medium text-gray-900 mb-4">Security Information</h3>
        
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 text-sm text-blue-700">
          <p className="font-medium mb-2">How your data is protected:</p>
          <ul className="list-disc list-inside space-y-1">
            <li>API keys are stored in your OS credential manager</li>
            <li>Credentials are encrypted at rest</li>
            <li>No sensitive data is sent to external servers</li>
            <li>All API calls are made directly from your device</li>
          </ul>
        </div>
      </div>
    </div>
  );
}

// About Component
function AboutTab() {
  const [version, setVersion] = useState('0.1.0');

  useEffect(() => {
    invoke<string>('get_app_version')
      .then(setVersion)
      .catch(() => setVersion('0.1.0'));
  }, []);

  return (
    <div className="space-y-6">
      <div className="text-center py-8">
        <div className="w-20 h-20 bg-gradient-to-br from-blue-500 to-purple-600 rounded-2xl mx-auto mb-4 flex items-center justify-center">
          <span className="text-3xl text-white font-bold">S</span>
        </div>
        <h2 className="text-2xl font-bold text-gray-900">SmartSpec Pro</h2>
        <p className="text-gray-500">Version {version}</p>
      </div>

      <div className="border-t pt-6">
        <h3 className="text-lg font-medium text-gray-900 mb-4">About</h3>
        <p className="text-gray-600">
          SmartSpec Pro is an AI-powered specification and development tool that helps teams
          create better software faster. Built with Tauri, React, and Rust for maximum
          performance and security.
        </p>
      </div>

      <div className="border-t pt-6">
        <h3 className="text-lg font-medium text-gray-900 mb-4">Links</h3>
        <div className="space-y-2">
          <a href="https://github.com/naibarn/SmartSpecPro" target="_blank" rel="noopener noreferrer"
            className="flex items-center text-blue-600 hover:text-blue-800">
            <svg className="w-5 h-5 mr-2" fill="currentColor" viewBox="0 0 24 24">
              <path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z"/>
            </svg>
            GitHub Repository
          </a>
          <a href="#" className="flex items-center text-blue-600 hover:text-blue-800">
            <svg className="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
            </svg>
            Documentation
          </a>
        </div>
      </div>

      <div className="border-t pt-6">
        <h3 className="text-lg font-medium text-gray-900 mb-4">License</h3>
        <p className="text-gray-600 text-sm">
          MIT License - Copyright © 2024-2026 SmartSpec Pro Team
        </p>
      </div>
    </div>
  );
}

// Main Settings Page
export default function Settings() {
  const [activeTab, setActiveTab] = useState<SettingsTab>('api-keys');

  const renderTabContent = () => {
    switch (activeTab) {
      case 'api-keys':
        return <ApiKeySetup showMigrationNotice={false} />;
      case 'rate-limits':
        return <RateLimitStatus />;
      case 'preferences':
        return <PreferencesTab />;
      case 'security':
        return <SecurityTab />;
      case 'about':
        return <AboutTab />;
      default:
        return null;
    }
  };

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-6xl mx-auto py-8 px-4">
        <h1 className="text-2xl font-bold text-gray-900 mb-8">Settings</h1>

        <div className="flex gap-8">
          {/* Sidebar */}
          <nav className="w-56 flex-shrink-0">
            <ul className="space-y-1">
              {TABS.map(tab => (
                <li key={tab.id}>
                  <button
                    onClick={() => setActiveTab(tab.id)}
                    className={`w-full flex items-center px-4 py-2 rounded-lg text-left transition-colors ${
                      activeTab === tab.id
                        ? 'bg-blue-100 text-blue-700'
                        : 'text-gray-600 hover:bg-gray-100'
                    }`}
                  >
                    <span className="mr-3">{tab.icon}</span>
                    {tab.label}
                  </button>
                </li>
              ))}
            </ul>
          </nav>

          {/* Content */}
          <div className="flex-1 bg-white rounded-lg shadow-sm border border-gray-200 p-6">
            {renderTabContent()}
          </div>
        </div>
      </div>
    </div>
  );
}
