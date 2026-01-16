/**
 * Dev Mode Panel - UI for OpenCode/OpenWork integration
 * 
 * Phase 2: Desktop App Integration
 * 
 * Features:
 * - Server status and control
 * - Session management
 * - API key management
 * - Model selection
 * - Usage statistics
 */

import React, { useState, useEffect, useCallback } from 'react';
import {
  startServer,
  stopServer,
  getServerStatus,
  getConfig,
  setConfig,
  createSession,
  listSessions,
  stopSession,
  setSessionModel,
  createApiKey,
  listApiKeys,
  revokeApiKey,
  getUsage,
  getModels,
  checkHealth,
  generateCliConfig,
  getConnectionInfo,
  formatCost,
  formatTokens,
  getModelDisplayName,
  OpenCodeConfig,
  OpenCodeSession,
  ServerStatus,
  ApiKeyInfo,
  UsageStats,
  ModelInfo,
  HealthStatus,
  ConnectionInfo,
} from '../services/openCodeService';

// ============================================
// Types
// ============================================

interface DevModePanelProps {
  workspaceId: string;
  workspacePath: string;
  authToken: string;
  onSessionChange?: (session: OpenCodeSession | null) => void;
}

type TabType = 'server' | 'sessions' | 'apikeys' | 'usage' | 'config';

// ============================================
// Sub-components
// ============================================

const StatusBadge: React.FC<{ status: 'online' | 'offline' | 'error' }> = ({ status }) => {
  const colors = {
    online: 'bg-green-500',
    offline: 'bg-gray-500',
    error: 'bg-red-500',
  };
  
  return (
    <span className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-medium text-white ${colors[status]}`}>
      <span className={`w-2 h-2 mr-1 rounded-full ${status === 'online' ? 'animate-pulse' : ''} bg-white/50`} />
      {status.charAt(0).toUpperCase() + status.slice(1)}
    </span>
  );
};

const LoadingSpinner: React.FC = () => (
  <svg className="animate-spin h-5 w-5 text-blue-500" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
  </svg>
);

// ============================================
// Server Tab
// ============================================

const ServerTab: React.FC<{
  serverStatus: ServerStatus | null;
  health: HealthStatus | null;
  connectionInfo: ConnectionInfo | null;
  onStart: () => void;
  onStop: () => void;
  loading: boolean;
}> = ({ serverStatus, health, connectionInfo, onStart, onStop, loading }) => {
  const isRunning = serverStatus?.running || false;
  
  return (
    <div className="space-y-6">
      {/* Server Status Card */}
      <div className="bg-gray-800 rounded-lg p-4">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold text-white">Server Status</h3>
          <StatusBadge status={isRunning ? 'online' : 'offline'} />
        </div>
        
        <div className="grid grid-cols-2 gap-4 mb-4">
          <div>
            <p className="text-sm text-gray-400">Port</p>
            <p className="text-white font-mono">{serverStatus?.port || 3795}</p>
          </div>
          <div>
            <p className="text-sm text-gray-400">Uptime</p>
            <p className="text-white">
              {serverStatus?.uptime_seconds 
                ? `${Math.floor(serverStatus.uptime_seconds / 60)}m ${serverStatus.uptime_seconds % 60}s`
                : '-'}
            </p>
          </div>
          <div>
            <p className="text-sm text-gray-400">Active Sessions</p>
            <p className="text-white">{serverStatus?.active_sessions || 0}</p>
          </div>
          <div>
            <p className="text-sm text-gray-400">Total Requests</p>
            <p className="text-white">{serverStatus?.total_requests || 0}</p>
          </div>
        </div>
        
        <div className="flex gap-2">
          {!isRunning ? (
            <button
              onClick={onStart}
              disabled={loading}
              className="flex-1 bg-green-600 hover:bg-green-700 disabled:bg-gray-600 text-white px-4 py-2 rounded-lg flex items-center justify-center gap-2"
            >
              {loading ? <LoadingSpinner /> : '▶'} Start Server
            </button>
          ) : (
            <button
              onClick={onStop}
              disabled={loading}
              className="flex-1 bg-red-600 hover:bg-red-700 disabled:bg-gray-600 text-white px-4 py-2 rounded-lg flex items-center justify-center gap-2"
            >
              {loading ? <LoadingSpinner /> : '■'} Stop Server
            </button>
          )}
        </div>
      </div>
      
      {/* Gateway Health */}
      <div className="bg-gray-800 rounded-lg p-4">
        <h3 className="text-lg font-semibold text-white mb-4">Gateway Health</h3>
        <div className="flex items-center gap-2 mb-2">
          <StatusBadge status={health?.status === 'ok' ? 'online' : health?.status === 'offline' ? 'offline' : 'error'} />
          <span className="text-gray-300">{health?.service || 'Unknown'}</span>
        </div>
        {health?.version && (
          <p className="text-sm text-gray-400">Version: {health.version}</p>
        )}
        {health?.error && (
          <p className="text-sm text-red-400 mt-2">{health.error}</p>
        )}
      </div>
      
      {/* Connection Info */}
      {connectionInfo && (
        <div className="bg-gray-800 rounded-lg p-4">
          <h3 className="text-lg font-semibold text-white mb-4">Connection Info</h3>
          <div className="space-y-2">
            <div>
              <p className="text-sm text-gray-400">Endpoint</p>
              <p className="text-white font-mono text-sm break-all">{connectionInfo.endpoint}</p>
            </div>
            <div>
              <p className="text-sm text-gray-400">Default Model</p>
              <p className="text-white">{getModelDisplayName(connectionInfo.default_model)}</p>
            </div>
            <div className="flex items-center gap-2">
              <span className={`w-2 h-2 rounded-full ${connectionInfo.has_api_key ? 'bg-green-500' : 'bg-yellow-500'}`} />
              <span className="text-sm text-gray-300">
                {connectionInfo.has_api_key ? 'API Key configured' : 'No API Key'}
              </span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

// ============================================
// Sessions Tab
// ============================================

const SessionsTab: React.FC<{
  sessions: OpenCodeSession[];
  currentSession: OpenCodeSession | null;
  models: ModelInfo[];
  workspaceId: string;
  workspacePath: string;
  onCreateSession: () => void;
  onStopSession: (id: string) => void;
  onSelectSession: (session: OpenCodeSession) => void;
  onChangeModel: (sessionId: string, model: string) => void;
  loading: boolean;
}> = ({
  sessions,
  currentSession,
  models,
  workspaceId,
  workspacePath,
  onCreateSession,
  onStopSession,
  onSelectSession,
  onChangeModel,
  loading,
}) => {
  return (
    <div className="space-y-4">
      {/* Create Session Button */}
      <button
        onClick={onCreateSession}
        disabled={loading || sessions.some(s => s.status === 'Active' && s.workspace_id === workspaceId)}
        className="w-full bg-blue-600 hover:bg-blue-700 disabled:bg-gray-600 text-white px-4 py-2 rounded-lg flex items-center justify-center gap-2"
      >
        {loading ? <LoadingSpinner /> : '+'} New Session
      </button>
      
      {/* Sessions List */}
      <div className="space-y-3">
        {sessions.length === 0 ? (
          <div className="text-center py-8 text-gray-400">
            No sessions yet. Create one to get started.
          </div>
        ) : (
          sessions.map((session) => (
            <div
              key={session.id}
              className={`bg-gray-800 rounded-lg p-4 border-2 transition-colors cursor-pointer ${
                currentSession?.id === session.id
                  ? 'border-blue-500'
                  : 'border-transparent hover:border-gray-600'
              }`}
              onClick={() => onSelectSession(session)}
            >
              <div className="flex items-center justify-between mb-2">
                <span className="text-white font-medium">
                  Session {session.id.slice(0, 8)}
                </span>
                <StatusBadge
                  status={session.status === 'Active' ? 'online' : session.status === 'Error' ? 'error' : 'offline'}
                />
              </div>
              
              <div className="grid grid-cols-2 gap-2 text-sm mb-3">
                <div>
                  <span className="text-gray-400">Model:</span>
                  <span className="text-white ml-1">{getModelDisplayName(session.model)}</span>
                </div>
                <div>
                  <span className="text-gray-400">Tokens:</span>
                  <span className="text-white ml-1">{formatTokens(session.tokens_used)}</span>
                </div>
                <div>
                  <span className="text-gray-400">Cost:</span>
                  <span className="text-white ml-1">{formatCost(session.cost)}</span>
                </div>
                <div>
                  <span className="text-gray-400">Started:</span>
                  <span className="text-white ml-1">
                    {new Date(session.started_at).toLocaleTimeString()}
                  </span>
                </div>
              </div>
              
              <div className="flex gap-2">
                {session.status === 'Active' && (
                  <>
                    <select
                      value={session.model}
                      onChange={(e) => {
                        e.stopPropagation();
                        onChangeModel(session.id, e.target.value);
                      }}
                      onClick={(e) => e.stopPropagation()}
                      className="flex-1 bg-gray-700 text-white text-sm rounded px-2 py-1"
                    >
                      {models.map((model) => (
                        <option key={model.id} value={model.id}>
                          {getModelDisplayName(model.id)}
                        </option>
                      ))}
                    </select>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        onStopSession(session.id);
                      }}
                      className="bg-red-600 hover:bg-red-700 text-white px-3 py-1 rounded text-sm"
                    >
                      Stop
                    </button>
                  </>
                )}
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
};

// ============================================
// API Keys Tab
// ============================================

const ApiKeysTab: React.FC<{
  apiKeys: ApiKeyInfo[];
  onCreateKey: (name: string) => void;
  onRevokeKey: (id: string) => void;
  loading: boolean;
}> = ({ apiKeys, onCreateKey, onRevokeKey, loading }) => {
  const [newKeyName, setNewKeyName] = useState('');
  const [showCreateForm, setShowCreateForm] = useState(false);
  
  const handleCreate = () => {
    if (newKeyName.trim()) {
      onCreateKey(newKeyName.trim());
      setNewKeyName('');
      setShowCreateForm(false);
    }
  };
  
  return (
    <div className="space-y-4">
      {/* Create Key Button/Form */}
      {!showCreateForm ? (
        <button
          onClick={() => setShowCreateForm(true)}
          className="w-full bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg flex items-center justify-center gap-2"
        >
          + Create API Key
        </button>
      ) : (
        <div className="bg-gray-800 rounded-lg p-4">
          <h4 className="text-white font-medium mb-3">Create New API Key</h4>
          <input
            type="text"
            value={newKeyName}
            onChange={(e) => setNewKeyName(e.target.value)}
            placeholder="Key name (e.g., OpenCode CLI)"
            className="w-full bg-gray-700 text-white rounded px-3 py-2 mb-3"
          />
          <div className="flex gap-2">
            <button
              onClick={handleCreate}
              disabled={loading || !newKeyName.trim()}
              className="flex-1 bg-green-600 hover:bg-green-700 disabled:bg-gray-600 text-white px-4 py-2 rounded"
            >
              {loading ? <LoadingSpinner /> : 'Create'}
            </button>
            <button
              onClick={() => setShowCreateForm(false)}
              className="bg-gray-600 hover:bg-gray-700 text-white px-4 py-2 rounded"
            >
              Cancel
            </button>
          </div>
        </div>
      )}
      
      {/* API Keys List */}
      <div className="space-y-3">
        {apiKeys.length === 0 ? (
          <div className="text-center py-8 text-gray-400">
            No API keys yet. Create one for OpenCode CLI access.
          </div>
        ) : (
          apiKeys.map((key) => (
            <div key={key.id} className="bg-gray-800 rounded-lg p-4">
              <div className="flex items-center justify-between mb-2">
                <span className="text-white font-medium">{key.name}</span>
                <StatusBadge status={key.is_active ? 'online' : 'offline'} />
              </div>
              
              <div className="text-sm space-y-1 mb-3">
                <div>
                  <span className="text-gray-400">Key:</span>
                  <span className="text-white ml-1 font-mono">{key.key_prefix}</span>
                </div>
                <div>
                  <span className="text-gray-400">Created:</span>
                  <span className="text-white ml-1">
                    {new Date(key.created_at).toLocaleDateString()}
                  </span>
                </div>
                {key.expires_at && (
                  <div>
                    <span className="text-gray-400">Expires:</span>
                    <span className="text-white ml-1">
                      {new Date(key.expires_at).toLocaleDateString()}
                    </span>
                  </div>
                )}
                {key.last_used_at && (
                  <div>
                    <span className="text-gray-400">Last used:</span>
                    <span className="text-white ml-1">
                      {new Date(key.last_used_at).toLocaleString()}
                    </span>
                  </div>
                )}
              </div>
              
              {key.is_active && (
                <button
                  onClick={() => onRevokeKey(key.id)}
                  disabled={loading}
                  className="bg-red-600 hover:bg-red-700 disabled:bg-gray-600 text-white px-3 py-1 rounded text-sm"
                >
                  Revoke
                </button>
              )}
            </div>
          ))
        )}
      </div>
    </div>
  );
};

// ============================================
// Usage Tab
// ============================================

const UsageTab: React.FC<{ usage: UsageStats | null }> = ({ usage }) => {
  if (!usage) {
    return (
      <div className="text-center py-8 text-gray-400">
        Loading usage data...
      </div>
    );
  }
  
  return (
    <div className="space-y-4">
      {/* Overview */}
      <div className="bg-gray-800 rounded-lg p-4">
        <h3 className="text-lg font-semibold text-white mb-4">This Month</h3>
        <div className="grid grid-cols-3 gap-4">
          <div className="text-center">
            <p className="text-2xl font-bold text-white">{formatTokens(usage.total_tokens)}</p>
            <p className="text-sm text-gray-400">Tokens</p>
          </div>
          <div className="text-center">
            <p className="text-2xl font-bold text-green-400">{formatCost(usage.total_cost)}</p>
            <p className="text-sm text-gray-400">Cost</p>
          </div>
          <div className="text-center">
            <p className="text-2xl font-bold text-blue-400">{usage.requests_count}</p>
            <p className="text-sm text-gray-400">Requests</p>
          </div>
        </div>
      </div>
      
      {/* By Model */}
      <div className="bg-gray-800 rounded-lg p-4">
        <h3 className="text-lg font-semibold text-white mb-4">By Model</h3>
        {Object.keys(usage.by_model).length === 0 ? (
          <p className="text-gray-400 text-center py-4">No usage data yet</p>
        ) : (
          <div className="space-y-3">
            {Object.entries(usage.by_model).map(([modelId, data]) => (
              <div key={modelId} className="flex items-center justify-between">
                <div>
                  <p className="text-white">{getModelDisplayName(modelId)}</p>
                  <p className="text-sm text-gray-400">{data.requests} requests</p>
                </div>
                <div className="text-right">
                  <p className="text-white">{formatTokens(data.tokens)}</p>
                  <p className="text-sm text-green-400">{formatCost(data.cost)}</p>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

// ============================================
// Config Tab
// ============================================

const ConfigTab: React.FC<{
  config: OpenCodeConfig | null;
  cliConfig: string | null;
  onSaveConfig: (config: OpenCodeConfig) => void;
  loading: boolean;
}> = ({ config, cliConfig, onSaveConfig, loading }) => {
  const [editedConfig, setEditedConfig] = useState<OpenCodeConfig | null>(null);
  const [copied, setCopied] = useState(false);
  
  useEffect(() => {
    if (config) {
      setEditedConfig(config);
    }
  }, [config]);
  
  const handleSave = () => {
    if (editedConfig) {
      onSaveConfig(editedConfig);
    }
  };
  
  const copyCliConfig = () => {
    if (cliConfig) {
      navigator.clipboard.writeText(cliConfig);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };
  
  if (!editedConfig) {
    return <LoadingSpinner />;
  }
  
  return (
    <div className="space-y-4">
      {/* Configuration Form */}
      <div className="bg-gray-800 rounded-lg p-4">
        <h3 className="text-lg font-semibold text-white mb-4">Configuration</h3>
        
        <div className="space-y-4">
          <div>
            <label className="block text-sm text-gray-400 mb-1">Backend URL</label>
            <input
              type="text"
              value={editedConfig.backend_url}
              onChange={(e) => setEditedConfig({ ...editedConfig, backend_url: e.target.value })}
              className="w-full bg-gray-700 text-white rounded px-3 py-2"
            />
          </div>
          
          <div>
            <label className="block text-sm text-gray-400 mb-1">Server Port</label>
            <input
              type="number"
              value={editedConfig.server_port}
              onChange={(e) => setEditedConfig({ ...editedConfig, server_port: parseInt(e.target.value) })}
              className="w-full bg-gray-700 text-white rounded px-3 py-2"
            />
          </div>
          
          <div>
            <label className="block text-sm text-gray-400 mb-1">Default Model</label>
            <input
              type="text"
              value={editedConfig.default_model}
              onChange={(e) => setEditedConfig({ ...editedConfig, default_model: e.target.value })}
              className="w-full bg-gray-700 text-white rounded px-3 py-2"
            />
          </div>
          
          <div className="flex items-center gap-2">
            <input
              type="checkbox"
              id="autoStart"
              checked={editedConfig.auto_start}
              onChange={(e) => setEditedConfig({ ...editedConfig, auto_start: e.target.checked })}
              className="rounded"
            />
            <label htmlFor="autoStart" className="text-gray-300">Auto-start server</label>
          </div>
          
          <button
            onClick={handleSave}
            disabled={loading}
            className="w-full bg-blue-600 hover:bg-blue-700 disabled:bg-gray-600 text-white px-4 py-2 rounded"
          >
            {loading ? <LoadingSpinner /> : 'Save Configuration'}
          </button>
        </div>
      </div>
      
      {/* CLI Config */}
      {cliConfig && (
        <div className="bg-gray-800 rounded-lg p-4">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-semibold text-white">OpenCode CLI Config</h3>
            <button
              onClick={copyCliConfig}
              className="text-sm text-blue-400 hover:text-blue-300"
            >
              {copied ? '✓ Copied!' : 'Copy'}
            </button>
          </div>
          <pre className="bg-gray-900 rounded p-3 text-sm text-gray-300 overflow-x-auto">
            {cliConfig}
          </pre>
        </div>
      )}
    </div>
  );
};

// ============================================
// Main Component
// ============================================

export const DevModePanel: React.FC<DevModePanelProps> = ({
  workspaceId,
  workspacePath,
  authToken,
  onSessionChange,
}) => {
  // State
  const [activeTab, setActiveTab] = useState<TabType>('server');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  
  // Data state
  const [serverStatus, setServerStatus] = useState<ServerStatus | null>(null);
  const [health, setHealth] = useState<HealthStatus | null>(null);
  const [connectionInfo, setConnectionInfo] = useState<ConnectionInfo | null>(null);
  const [sessions, setSessions] = useState<OpenCodeSession[]>([]);
  const [currentSession, setCurrentSession] = useState<OpenCodeSession | null>(null);
  const [models, setModels] = useState<ModelInfo[]>([]);
  const [apiKeys, setApiKeys] = useState<ApiKeyInfo[]>([]);
  const [usage, setUsage] = useState<UsageStats | null>(null);
  const [config, setConfigState] = useState<OpenCodeConfig | null>(null);
  const [cliConfig, setCliConfig] = useState<string | null>(null);
  
  // Load initial data
  const loadData = useCallback(async () => {
    try {
      setLoading(true);
      
      const [
        statusResult,
        healthResult,
        connResult,
        sessionsResult,
        modelsResult,
        configResult,
        cliConfigResult,
      ] = await Promise.all([
        getServerStatus(),
        checkHealth(),
        getConnectionInfo(),
        listSessions(workspaceId),
        getModels(),
        getConfig(),
        generateCliConfig(),
      ]);
      
      setServerStatus(statusResult);
      setHealth(healthResult);
      setConnectionInfo(connResult);
      setSessions(sessionsResult);
      setModels(modelsResult);
      setConfigState(configResult);
      setCliConfig(cliConfigResult);
      
      // Set current session if exists
      const activeSession = sessionsResult.find(s => s.status === 'Active' && s.workspace_id === workspaceId);
      if (activeSession) {
        setCurrentSession(activeSession);
        onSessionChange?.(activeSession);
      }
      
      // Load API keys and usage if authenticated
      if (authToken) {
        const [keysResult, usageResult] = await Promise.all([
          listApiKeys(authToken),
          getUsage(authToken),
        ]);
        setApiKeys(keysResult);
        setUsage(usageResult);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load data');
    } finally {
      setLoading(false);
    }
  }, [workspaceId, authToken, onSessionChange]);
  
  useEffect(() => {
    loadData();
  }, [loadData]);
  
  // Handlers
  const handleStartServer = async () => {
    try {
      setLoading(true);
      const status = await startServer();
      setServerStatus(status);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to start server');
    } finally {
      setLoading(false);
    }
  };
  
  const handleStopServer = async () => {
    try {
      setLoading(true);
      await stopServer();
      setServerStatus(await getServerStatus());
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to stop server');
    } finally {
      setLoading(false);
    }
  };
  
  const handleCreateSession = async () => {
    try {
      setLoading(true);
      const session = await createSession(workspaceId, workspacePath);
      setSessions([...sessions, session]);
      setCurrentSession(session);
      onSessionChange?.(session);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create session');
    } finally {
      setLoading(false);
    }
  };
  
  const handleStopSession = async (sessionId: string) => {
    try {
      setLoading(true);
      await stopSession(sessionId);
      setSessions(sessions.map(s => 
        s.id === sessionId ? { ...s, status: 'Stopped' as const } : s
      ));
      if (currentSession?.id === sessionId) {
        setCurrentSession(null);
        onSessionChange?.(null);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to stop session');
    } finally {
      setLoading(false);
    }
  };
  
  const handleSelectSession = (session: OpenCodeSession) => {
    setCurrentSession(session);
    onSessionChange?.(session);
  };
  
  const handleChangeModel = async (sessionId: string, model: string) => {
    try {
      await setSessionModel(sessionId, model);
      setSessions(sessions.map(s => 
        s.id === sessionId ? { ...s, model } : s
      ));
      if (currentSession?.id === sessionId) {
        setCurrentSession({ ...currentSession, model });
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to change model');
    }
  };
  
  const handleCreateApiKey = async (name: string) => {
    try {
      setLoading(true);
      const result = await createApiKey(name, authToken);
      // Show the key to user (only shown once!)
      alert(`API Key created!\n\nKey: ${result.key}\n\nSave this key - it won't be shown again!`);
      setApiKeys(await listApiKeys(authToken));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create API key');
    } finally {
      setLoading(false);
    }
  };
  
  const handleRevokeApiKey = async (keyId: string) => {
    if (!confirm('Are you sure you want to revoke this API key?')) return;
    
    try {
      setLoading(true);
      await revokeApiKey(keyId, authToken);
      setApiKeys(await listApiKeys(authToken));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to revoke API key');
    } finally {
      setLoading(false);
    }
  };
  
  const handleSaveConfig = async (newConfig: OpenCodeConfig) => {
    try {
      setLoading(true);
      await setConfig(newConfig);
      setConfigState(newConfig);
      setCliConfig(await generateCliConfig());
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save config');
    } finally {
      setLoading(false);
    }
  };
  
  // Tab definitions
  const tabs: { id: TabType; label: string }[] = [
    { id: 'server', label: 'Server' },
    { id: 'sessions', label: 'Sessions' },
    { id: 'apikeys', label: 'API Keys' },
    { id: 'usage', label: 'Usage' },
    { id: 'config', label: 'Config' },
  ];
  
  return (
    <div className="h-full flex flex-col bg-gray-900 text-white">
      {/* Header */}
      <div className="px-4 py-3 border-b border-gray-700">
        <h2 className="text-lg font-semibold">Dev Mode</h2>
        <p className="text-sm text-gray-400">OpenCode / OpenWork Integration</p>
      </div>
      
      {/* Error Banner */}
      {error && (
        <div className="mx-4 mt-2 p-3 bg-red-900/50 border border-red-700 rounded-lg text-red-200 text-sm">
          {error}
          <button 
            onClick={() => setError(null)}
            className="float-right text-red-400 hover:text-red-300"
          >
            ✕
          </button>
        </div>
      )}
      
      {/* Tabs */}
      <div className="flex border-b border-gray-700">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`flex-1 px-4 py-2 text-sm font-medium transition-colors ${
              activeTab === tab.id
                ? 'text-blue-400 border-b-2 border-blue-400'
                : 'text-gray-400 hover:text-gray-300'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>
      
      {/* Tab Content */}
      <div className="flex-1 overflow-y-auto p-4">
        {activeTab === 'server' && (
          <ServerTab
            serverStatus={serverStatus}
            health={health}
            connectionInfo={connectionInfo}
            onStart={handleStartServer}
            onStop={handleStopServer}
            loading={loading}
          />
        )}
        
        {activeTab === 'sessions' && (
          <SessionsTab
            sessions={sessions}
            currentSession={currentSession}
            models={models}
            workspaceId={workspaceId}
            workspacePath={workspacePath}
            onCreateSession={handleCreateSession}
            onStopSession={handleStopSession}
            onSelectSession={handleSelectSession}
            onChangeModel={handleChangeModel}
            loading={loading}
          />
        )}
        
        {activeTab === 'apikeys' && (
          <ApiKeysTab
            apiKeys={apiKeys}
            onCreateKey={handleCreateApiKey}
            onRevokeKey={handleRevokeApiKey}
            loading={loading}
          />
        )}
        
        {activeTab === 'usage' && (
          <UsageTab usage={usage} />
        )}
        
        {activeTab === 'config' && (
          <ConfigTab
            config={config}
            cliConfig={cliConfig}
            onSaveConfig={handleSaveConfig}
            loading={loading}
          />
        )}
      </div>
    </div>
  );
};

export default DevModePanel;
