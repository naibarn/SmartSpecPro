// Admin Dashboard Component
// Enterprise administration panel

import { useState, useEffect } from 'react';
import {
  useEnterprise,
  AuditLog,
  queryAuditLogs,
  getSsoProviderIcon,
  getSsoProviderLabel,
  getAuditActionIcon,
  formatAuditAction,
} from '../../services/enterpriseService';

interface AdminDashboardProps {
  className?: string;
}

type Tab = 'overview' | 'sso' | 'roles' | 'audit' | 'compliance';

export function AdminDashboard({ className = '' }: AdminDashboardProps) {
  const [activeTab, setActiveTab] = useState<Tab>('overview');

  const tabs: { id: Tab; label: string; icon: string }[] = [
    { id: 'overview', label: 'Overview', icon: '📊' },
    { id: 'sso', label: 'SSO', icon: '🔐' },
    { id: 'roles', label: 'Roles', icon: '👥' },
    { id: 'audit', label: 'Audit Logs', icon: '📋' },
    { id: 'compliance', label: 'Compliance', icon: '✅' },
  ];

  return (
    <div className={`flex h-full bg-gray-50 dark:bg-gray-900 ${className}`}>
      {/* Sidebar */}
      <div className="w-56 bg-white dark:bg-gray-800 border-r border-gray-200 dark:border-gray-700 p-4">
        <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
          Admin Panel
        </h2>
        <nav className="space-y-1">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`w-full flex items-center gap-2 px-3 py-2 text-sm rounded-lg transition-colors ${
                activeTab === tab.id
                  ? 'bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300'
                  : 'text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700'
              }`}
            >
              <span>{tab.icon}</span>
              <span>{tab.label}</span>
            </button>
          ))}
        </nav>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-6">
        {activeTab === 'overview' && <OverviewTab />}
        {activeTab === 'sso' && <SsoTab />}
        {activeTab === 'roles' && <RolesTab />}
        {activeTab === 'audit' && <AuditTab />}
        {activeTab === 'compliance' && <ComplianceTab />}
      </div>
    </div>
  );
}

// ============================================
// Overview Tab
// ============================================

function OverviewTab() {
  const { ssoConfigs, roles, complianceSettings } = useEnterprise();

  const stats = [
    { label: 'SSO Providers', value: ssoConfigs.filter(c => c.enabled).length, icon: '🔐' },
    { label: 'Roles', value: roles.length, icon: '👥' },
    { label: 'MFA Required', value: complianceSettings?.mfa_required ? 'Yes' : 'No', icon: '🔒' },
    { label: 'GDPR Enabled', value: complianceSettings?.gdpr_enabled ? 'Yes' : 'No', icon: '🇪🇺' },
  ];

  return (
    <div>
      <h3 className="text-xl font-semibold text-gray-900 dark:text-white mb-6">
        Enterprise Overview
      </h3>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
        {stats.map((stat) => (
          <div key={stat.label} className="p-4 bg-white dark:bg-gray-800 rounded-xl shadow-sm">
            <div className="text-2xl mb-2">{stat.icon}</div>
            <p className="text-2xl font-bold text-gray-900 dark:text-white">{stat.value}</p>
            <p className="text-sm text-gray-500">{stat.label}</p>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="p-4 bg-white dark:bg-gray-800 rounded-xl shadow-sm">
          <h4 className="font-semibold text-gray-900 dark:text-white mb-4">Quick Actions</h4>
          <div className="space-y-2">
            <button className="w-full text-left px-3 py-2 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg">
              Configure SSO Provider
            </button>
            <button className="w-full text-left px-3 py-2 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg">
              Create Custom Role
            </button>
            <button className="w-full text-left px-3 py-2 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg">
              Export Audit Logs
            </button>
            <button className="w-full text-left px-3 py-2 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg">
              Update Compliance Settings
            </button>
          </div>
        </div>

        <div className="p-4 bg-white dark:bg-gray-800 rounded-xl shadow-sm">
          <h4 className="font-semibold text-gray-900 dark:text-white mb-4">Security Status</h4>
          <div className="space-y-3">
            <SecurityItem label="Data Encryption" enabled={complianceSettings?.data_encryption_enabled} />
            <SecurityItem label="MFA Required" enabled={complianceSettings?.mfa_required} />
            <SecurityItem label="GDPR Compliance" enabled={complianceSettings?.gdpr_enabled} />
            <SecurityItem label="Audit Logging" enabled={true} />
          </div>
        </div>
      </div>
    </div>
  );
}

function SecurityItem({ label, enabled }: { label: string; enabled?: boolean }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-sm text-gray-700 dark:text-gray-300">{label}</span>
      <span className={`text-sm ${enabled ? 'text-green-600' : 'text-gray-400'}`}>
        {enabled ? '✓ Enabled' : '○ Disabled'}
      </span>
    </div>
  );
}

// ============================================
// SSO Tab
// ============================================

function SsoTab() {
  const { ssoConfigs, addSsoConfig: _addSsoConfig, removeSsoConfig: _removeSsoConfig } = useEnterprise();

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h3 className="text-xl font-semibold text-gray-900 dark:text-white">
          Single Sign-On
        </h3>
        <button className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700">
          Add Provider
        </button>
      </div>

      <div className="space-y-4">
        {ssoConfigs.length === 0 ? (
          <div className="text-center py-12 text-gray-500">
            <div className="text-4xl mb-2">🔐</div>
            <p>No SSO providers configured</p>
          </div>
        ) : (
          ssoConfigs.map((config) => (
            <div key={config.id} className="p-4 bg-white dark:bg-gray-800 rounded-xl shadow-sm">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <span className="text-2xl">{getSsoProviderIcon(config.provider)}</span>
                  <div>
                    <h4 className="font-medium text-gray-900 dark:text-white">
                      {getSsoProviderLabel(config.provider)}
                    </h4>
                    <p className="text-sm text-gray-500">Client ID: {config.client_id}</p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <span className={`px-2 py-1 text-xs rounded ${
                    config.enabled
                      ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300'
                      : 'bg-gray-100 text-gray-700 dark:bg-gray-700 dark:text-gray-300'
                  }`}>
                    {config.enabled ? 'Active' : 'Disabled'}
                  </span>
                  <button
                    onClick={() => _removeSsoConfig(config.id)}
                    className="p-2 text-gray-400 hover:text-red-500"
                  >
                    🗑️
                  </button>
                </div>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}

// ============================================
// Roles Tab
// ============================================

function RolesTab() {
  const { roles, addRole: _addRole } = useEnterprise();

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h3 className="text-xl font-semibold text-gray-900 dark:text-white">
          Roles & Permissions
        </h3>
        <button className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700">
          Create Role
        </button>
      </div>

      <div className="space-y-4">
        {roles.map((role) => (
          <div key={role.id} className="p-4 bg-white dark:bg-gray-800 rounded-xl shadow-sm">
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2">
                <h4 className="font-medium text-gray-900 dark:text-white">{role.name}</h4>
                {role.is_system && (
                  <span className="px-2 py-0.5 text-xs bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-400 rounded">
                    System
                  </span>
                )}
              </div>
            </div>
            <p className="text-sm text-gray-500 mb-3">{role.description}</p>
            <div className="flex flex-wrap gap-2">
              {role.permissions.map((perm) => (
                <span
                  key={perm.id}
                  className="px-2 py-1 text-xs bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 rounded"
                >
                  {perm.resource}:{perm.action}
                </span>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ============================================
// Audit Tab
// ============================================

function AuditTab() {
  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    async function loadLogs() {
      try {
        const result = await queryAuditLogs({ page: 1, per_page: 50 });
        setLogs(result.logs);
      } catch (e) {
        console.error(e);
      } finally {
        setIsLoading(false);
      }
    }
    loadLogs();
  }, []);

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h3 className="text-xl font-semibold text-gray-900 dark:text-white">
          Audit Logs
        </h3>
        <button className="px-4 py-2 bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-600">
          Export
        </button>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-12">
          <div className="animate-spin w-8 h-8 border-4 border-blue-500 border-t-transparent rounded-full" />
        </div>
      ) : logs.length === 0 ? (
        <div className="text-center py-12 text-gray-500">
          <div className="text-4xl mb-2">📋</div>
          <p>No audit logs yet</p>
        </div>
      ) : (
        <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm overflow-hidden">
          <table className="w-full">
            <thead className="bg-gray-50 dark:bg-gray-700">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Time</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">User</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Action</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Resource</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
              {logs.map((log) => (
                <tr key={log.id}>
                  <td className="px-4 py-3 text-sm text-gray-500">
                    {new Date(log.timestamp * 1000).toLocaleString()}
                  </td>
                  <td className="px-4 py-3 text-sm text-gray-900 dark:text-white">
                    {log.user_email}
                  </td>
                  <td className="px-4 py-3 text-sm">
                    <span className="flex items-center gap-1">
                      {getAuditActionIcon(log.action)}
                      {formatAuditAction(log.action)}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-sm text-gray-500">
                    {log.resource_type}
                  </td>
                  <td className="px-4 py-3">
                    <span className={`px-2 py-0.5 text-xs rounded ${
                      log.status === 'success'
                        ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300'
                        : 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300'
                    }`}>
                      {log.status}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ============================================
// Compliance Tab
// ============================================

function ComplianceTab() {
  const { complianceSettings, saveComplianceSettings: _saveComplianceSettings } = useEnterprise();

  if (!complianceSettings) {
    return <div>Loading...</div>;
  }

  return (
    <div>
      <h3 className="text-xl font-semibold text-gray-900 dark:text-white mb-6">
        Compliance Settings
      </h3>

      <div className="space-y-6">
        <div className="p-4 bg-white dark:bg-gray-800 rounded-xl shadow-sm">
          <h4 className="font-medium text-gray-900 dark:text-white mb-4">Data Protection</h4>
          <div className="space-y-4">
            <ToggleSetting
              label="GDPR Compliance"
              description="Enable GDPR-compliant data handling"
              enabled={complianceSettings.gdpr_enabled}
            />
            <ToggleSetting
              label="Data Encryption"
              description="Encrypt all data at rest"
              enabled={complianceSettings.data_encryption_enabled}
            />
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-900 dark:text-white">Data Retention</p>
                <p className="text-xs text-gray-500">How long to keep user data</p>
              </div>
              <span className="text-sm text-gray-700 dark:text-gray-300">
                {complianceSettings.data_retention_days} days
              </span>
            </div>
          </div>
        </div>

        <div className="p-4 bg-white dark:bg-gray-800 rounded-xl shadow-sm">
          <h4 className="font-medium text-gray-900 dark:text-white mb-4">Security</h4>
          <div className="space-y-4">
            <ToggleSetting
              label="MFA Required"
              description="Require multi-factor authentication for all users"
              enabled={complianceSettings.mfa_required}
            />
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-900 dark:text-white">Session Timeout</p>
                <p className="text-xs text-gray-500">Auto logout after inactivity</p>
              </div>
              <span className="text-sm text-gray-700 dark:text-gray-300">
                {complianceSettings.session_timeout_minutes} minutes
              </span>
            </div>
          </div>
        </div>

        <div className="p-4 bg-white dark:bg-gray-800 rounded-xl shadow-sm">
          <h4 className="font-medium text-gray-900 dark:text-white mb-4">Password Policy</h4>
          <div className="grid grid-cols-2 gap-4 text-sm">
            <div>
              <p className="text-gray-500">Minimum Length</p>
              <p className="text-gray-900 dark:text-white">{complianceSettings.password_policy.min_length} characters</p>
            </div>
            <div>
              <p className="text-gray-500">Max Age</p>
              <p className="text-gray-900 dark:text-white">{complianceSettings.password_policy.max_age_days} days</p>
            </div>
            <div>
              <p className="text-gray-500">Require Uppercase</p>
              <p className="text-gray-900 dark:text-white">{complianceSettings.password_policy.require_uppercase ? 'Yes' : 'No'}</p>
            </div>
            <div>
              <p className="text-gray-500">Require Special</p>
              <p className="text-gray-900 dark:text-white">{complianceSettings.password_policy.require_special ? 'Yes' : 'No'}</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function ToggleSetting({ label, description, enabled }: { label: string; description: string; enabled: boolean }) {
  return (
    <div className="flex items-center justify-between">
      <div>
        <p className="text-sm font-medium text-gray-900 dark:text-white">{label}</p>
        <p className="text-xs text-gray-500">{description}</p>
      </div>
      <div className={`w-10 h-6 rounded-full ${enabled ? 'bg-blue-600' : 'bg-gray-300 dark:bg-gray-600'} relative`}>
        <div className={`w-4 h-4 bg-white rounded-full absolute top-1 transition-transform ${enabled ? 'translate-x-5' : 'translate-x-1'}`} />
      </div>
    </div>
  );
}

export default AdminDashboard;
