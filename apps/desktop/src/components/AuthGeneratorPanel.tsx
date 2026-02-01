/**
 * Auth Generator Panel Component
 * UI for configuring and generating authentication systems
 */

import React, { useState, useEffect } from 'react';
import {
  AuthGeneratorConfig,
  TemplateInfo,
  GenerationResult,
  PreviewResponse,
  ValidationResult,
  OAuthProvider,
  TwoFactorMethod,
  DatabaseType,
  TokenExpiry,
  RBACRole,
  DEFAULT_AUTH_CONFIG,
  OAUTH_PROVIDERS,
  ACCESS_TOKEN_OPTIONS,
  REFRESH_TOKEN_OPTIONS,
  AUTH_GENERATOR_STEPS,
  PreviewFileType,
} from '../types/authGenerator';
import { authGeneratorService } from '../services/authGeneratorService';

// ============================================================================
// Sub-Components
// ============================================================================

interface StepIndicatorProps {
  steps: typeof AUTH_GENERATOR_STEPS;
  currentStep: number;
  onStepClick: (index: number) => void;
}

const StepIndicator: React.FC<StepIndicatorProps> = ({ steps, currentStep, onStepClick }) => (
  <div className="flex items-center justify-between mb-8 px-4">
    {steps.map((step, index) => (
      <React.Fragment key={step.id}>
        <button
          onClick={() => onStepClick(index)}
          className={`flex flex-col items-center ${index <= currentStep ? 'cursor-pointer' : 'cursor-not-allowed opacity-50'}`}
          disabled={index > currentStep + 1}
        >
          <div
            className={`w-10 h-10 rounded-full flex items-center justify-center text-sm font-medium transition-colors ${
              index < currentStep
                ? 'bg-green-500 text-white'
                : index === currentStep
                ? 'bg-blue-500 text-white'
                : 'bg-gray-200 text-gray-600'
            }`}
          >
            {index < currentStep ? '✓' : index + 1}
          </div>
          <span className={`mt-2 text-xs ${index === currentStep ? 'text-blue-600 font-medium' : 'text-gray-500'}`}>
            {step.title}
          </span>
        </button>
        {index < steps.length - 1 && (
          <div className={`flex-1 h-1 mx-2 ${index < currentStep ? 'bg-green-500' : 'bg-gray-200'}`} />
        )}
      </React.Fragment>
    ))}
  </div>
);

interface TemplateCardProps {
  template: TemplateInfo;
  selected: boolean;
  onSelect: () => void;
}

const TemplateCard: React.FC<TemplateCardProps> = ({ template, selected, onSelect }) => (
  <div
    onClick={onSelect}
    className={`p-4 border-2 rounded-lg cursor-pointer transition-all ${
      selected ? 'border-blue-500 bg-blue-50' : 'border-gray-200 hover:border-blue-300'
    }`}
  >
    <h4 className="font-semibold text-lg">{template.name}</h4>
    <p className="text-sm text-gray-600 mt-1">{template.description}</p>
    <div className="flex flex-wrap gap-1 mt-3">
      {template.features.map((feature) => (
        <span key={feature} className="px-2 py-1 bg-gray-100 text-xs rounded-full">
          {feature}
        </span>
      ))}
    </div>
  </div>
);

interface ToggleSwitchProps {
  enabled: boolean;
  onChange: (enabled: boolean) => void;
  label: string;
  description?: string;
}

const ToggleSwitch: React.FC<ToggleSwitchProps> = ({ enabled, onChange, label, description }) => (
  <div className="flex items-center justify-between py-3">
    <div>
      <span className="font-medium">{label}</span>
      {description && <p className="text-sm text-gray-500">{description}</p>}
    </div>
    <button
      onClick={() => onChange(!enabled)}
      className={`relative w-12 h-6 rounded-full transition-colors ${enabled ? 'bg-blue-500' : 'bg-gray-300'}`}
    >
      <div
        className={`absolute top-1 w-4 h-4 bg-white rounded-full transition-transform ${
          enabled ? 'translate-x-7' : 'translate-x-1'
        }`}
      />
    </button>
  </div>
);

interface CodePreviewProps {
  preview: PreviewResponse | null;
  loading: boolean;
}

const CodePreview: React.FC<CodePreviewProps> = ({ preview, loading }) => (
  <div className="bg-gray-900 rounded-lg overflow-hidden">
    <div className="flex items-center justify-between px-4 py-2 bg-gray-800">
      <span className="text-gray-300 text-sm">{preview?.fileName || 'Preview'}</span>
      <span className="text-gray-500 text-xs">{preview?.language || ''}</span>
    </div>
    <div className="p-4 overflow-auto max-h-96">
      {loading ? (
        <div className="text-gray-400 animate-pulse">Loading preview...</div>
      ) : preview ? (
        <pre className="text-green-400 text-sm font-mono whitespace-pre-wrap">{preview.content}</pre>
      ) : (
        <div className="text-gray-500">Select options to preview generated code</div>
      )}
    </div>
  </div>
);

// ============================================================================
// Main Component
// ============================================================================

const AuthGeneratorPanel: React.FC = () => {
  // State
  const [currentStep, setCurrentStep] = useState(0);
  const [config, setConfig] = useState<AuthGeneratorConfig>(DEFAULT_AUTH_CONFIG);
  const [templates, setTemplates] = useState<TemplateInfo[]>([]);
  const [selectedTemplate, setSelectedTemplate] = useState<string | null>(null);
  const [preview, setPreview] = useState<PreviewResponse | null>(null);
  const [previewType, setPreviewType] = useState<PreviewFileType>('controller');
  const [validation, setValidation] = useState<ValidationResult | null>(null);
  const [result, setResult] = useState<GenerationResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Load templates on mount
  useEffect(() => {
    loadTemplates();
  }, []);

  // Update preview when config changes
  useEffect(() => {
    if (currentStep === 5) {
      loadPreview();
    }
  }, [config, previewType, currentStep]);

  const loadTemplates = async () => {
    try {
      const data = await authGeneratorService.listTemplates();
      setTemplates(data);
    } catch (err) {
      setError('Failed to load templates');
    }
  };

  const loadPreview = async () => {
    setPreviewLoading(true);
    try {
      const data = await authGeneratorService.previewCode(config, previewType);
      setPreview(data);
    } catch (err) {
      console.error('Preview error:', err);
    } finally {
      setPreviewLoading(false);
    }
  };

  const validateConfig = async () => {
    try {
      const result = await authGeneratorService.validate(config);
      setValidation(result);
      return result.valid;
    } catch (err) {
      setError('Validation failed');
      return false;
    }
  };

  const handleGenerate = async () => {
    setLoading(true);
    setError(null);
    try {
      const isValid = await validateConfig();
      if (!isValid) {
        setError('Please fix validation errors before generating');
        return;
      }
      const result = await authGeneratorService.generate(config);
      setResult(result);
    } catch (err: any) {
      setError(err.message || 'Generation failed');
    } finally {
      setLoading(false);
    }
  };

  const handleTemplateSelect = (template: TemplateInfo) => {
    setSelectedTemplate(template.id);
    setConfig(authGeneratorService.applyTemplate(template, config.projectName, config.outputDir));
  };

  const updateConfig = (updates: Partial<AuthGeneratorConfig>) => {
    setConfig((prev) => ({ ...prev, ...updates }));
  };

  const nextStep = () => {
    if (currentStep < AUTH_GENERATOR_STEPS.length - 1) {
      setCurrentStep(currentStep + 1);
    }
  };

  const prevStep = () => {
    if (currentStep > 0) {
      setCurrentStep(currentStep - 1);
    }
  };

  // ============================================================================
  // Step Renderers
  // ============================================================================

  const renderProjectStep = () => (
    <div className="space-y-6">
      <h3 className="text-xl font-semibold">Project Setup</h3>
      
      {/* Templates */}
      <div>
        <label className="block text-sm font-medium mb-3">Choose a Template (Optional)</label>
        <div className="grid grid-cols-2 gap-4">
          {templates.map((template) => (
            <TemplateCard
              key={template.id}
              template={template}
              selected={selectedTemplate === template.id}
              onSelect={() => handleTemplateSelect(template)}
            />
          ))}
        </div>
      </div>

      {/* Project Name */}
      <div>
        <label className="block text-sm font-medium mb-2">Project Name</label>
        <input
          type="text"
          value={config.projectName}
          onChange={(e) => updateConfig({ projectName: e.target.value })}
          className="w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          placeholder="my-app"
        />
      </div>

      {/* Output Directory */}
      <div>
        <label className="block text-sm font-medium mb-2">Output Directory</label>
        <input
          type="text"
          value={config.outputDir}
          onChange={(e) => updateConfig({ outputDir: e.target.value })}
          className="w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          placeholder="./src/auth"
        />
      </div>

      {/* Database */}
      <div>
        <label className="block text-sm font-medium mb-2">Database ORM</label>
        <select
          value={config.database}
          onChange={(e) => updateConfig({ database: e.target.value as DatabaseType })}
          className="w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500"
        >
          <option value="prisma">Prisma</option>
          <option value="typeorm">TypeORM</option>
          <option value="mongoose">Mongoose</option>
        </select>
      </div>
    </div>
  );

  const renderJWTStep = () => (
    <div className="space-y-6">
      <h3 className="text-xl font-semibold">JWT Settings</h3>

      {/* Access Token Expiry */}
      <div>
        <label className="block text-sm font-medium mb-2">Access Token Expiry</label>
        <div className="grid grid-cols-4 gap-2">
          {ACCESS_TOKEN_OPTIONS.map((option) => (
            <button
              key={option.value}
              onClick={() => updateConfig({ jwt: { ...config.jwt, accessTokenExpiry: option.value } })}
              className={`p-3 border rounded-lg text-center transition-colors ${
                config.jwt.accessTokenExpiry === option.value
                  ? 'border-blue-500 bg-blue-50 text-blue-700'
                  : 'border-gray-200 hover:border-blue-300'
              }`}
            >
              <div className="font-medium">{option.label}</div>
              <div className="text-xs text-gray-500">{option.description}</div>
            </button>
          ))}
        </div>
      </div>

      {/* Refresh Token Expiry */}
      <div>
        <label className="block text-sm font-medium mb-2">Refresh Token Expiry</label>
        <div className="grid grid-cols-3 gap-2">
          {REFRESH_TOKEN_OPTIONS.map((option) => (
            <button
              key={option.value}
              onClick={() => updateConfig({ jwt: { ...config.jwt, refreshTokenExpiry: option.value } })}
              className={`p-3 border rounded-lg text-center transition-colors ${
                config.jwt.refreshTokenExpiry === option.value
                  ? 'border-blue-500 bg-blue-50 text-blue-700'
                  : 'border-gray-200 hover:border-blue-300'
              }`}
            >
              <div className="font-medium">{option.label}</div>
              <div className="text-xs text-gray-500">{option.description}</div>
            </button>
          ))}
        </div>
      </div>

      {/* Algorithm */}
      <div>
        <label className="block text-sm font-medium mb-2">Algorithm</label>
        <select
          value={config.jwt.algorithm}
          onChange={(e) => updateConfig({ jwt: { ...config.jwt, algorithm: e.target.value } })}
          className="w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500"
        >
          <option value="HS256">HS256 (HMAC SHA-256)</option>
          <option value="HS384">HS384 (HMAC SHA-384)</option>
          <option value="HS512">HS512 (HMAC SHA-512)</option>
          <option value="RS256">RS256 (RSA SHA-256)</option>
        </select>
      </div>

      {/* Issuer */}
      <div>
        <label className="block text-sm font-medium mb-2">Issuer (Optional)</label>
        <input
          type="text"
          value={config.jwt.issuer || ''}
          onChange={(e) => updateConfig({ jwt: { ...config.jwt, issuer: e.target.value || undefined } })}
          className="w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500"
          placeholder="https://your-app.com"
        />
      </div>
    </div>
  );

  const renderOAuthStep = () => (
    <div className="space-y-6">
      <h3 className="text-xl font-semibold">OAuth Providers</h3>

      <ToggleSwitch
        enabled={config.oauth.enabled}
        onChange={(enabled) => updateConfig({ oauth: { ...config.oauth, enabled } })}
        label="Enable OAuth"
        description="Allow users to sign in with social accounts"
      />

      {config.oauth.enabled && (
        <>
          <div>
            <label className="block text-sm font-medium mb-3">Select Providers</label>
            <div className="grid grid-cols-3 gap-3">
              {OAUTH_PROVIDERS.map((provider) => {
                const isSelected = config.oauth.providers.includes(provider.id);
                return (
                  <button
                    key={provider.id}
                    onClick={() => {
                      const providers = isSelected
                        ? config.oauth.providers.filter((p) => p !== provider.id)
                        : [...config.oauth.providers, provider.id];
                      updateConfig({ oauth: { ...config.oauth, providers } });
                    }}
                    className={`p-4 border-2 rounded-lg flex flex-col items-center transition-colors ${
                      isSelected ? 'border-blue-500 bg-blue-50' : 'border-gray-200 hover:border-blue-300'
                    }`}
                  >
                    <span className="text-2xl mb-2">{provider.icon}</span>
                    <span className="font-medium">{provider.name}</span>
                  </button>
                );
              })}
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium mb-2">Callback URL (Optional)</label>
            <input
              type="text"
              value={config.oauth.callbackUrl || ''}
              onChange={(e) => updateConfig({ oauth: { ...config.oauth, callbackUrl: e.target.value || undefined } })}
              className="w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500"
              placeholder="https://your-app.com/auth/callback"
            />
          </div>
        </>
      )}
    </div>
  );

  const renderSecurityStep = () => (
    <div className="space-y-6">
      <h3 className="text-xl font-semibold">Security Features</h3>

      {/* 2FA */}
      <div className="border rounded-lg p-4">
        <ToggleSwitch
          enabled={config.twoFactor.enabled}
          onChange={(enabled) => updateConfig({ twoFactor: { ...config.twoFactor, enabled } })}
          label="Two-Factor Authentication"
          description="Add an extra layer of security"
        />
        {config.twoFactor.enabled && (
          <div className="mt-4 space-y-3">
            <label className="block text-sm font-medium">Methods</label>
            <div className="flex gap-3">
              {(['totp', 'email', 'sms'] as TwoFactorMethod[]).map((method) => {
                const isSelected = config.twoFactor.methods.includes(method);
                return (
                  <button
                    key={method}
                    onClick={() => {
                      const methods = isSelected
                        ? config.twoFactor.methods.filter((m) => m !== method)
                        : [...config.twoFactor.methods, method];
                      updateConfig({ twoFactor: { ...config.twoFactor, methods } });
                    }}
                    className={`px-4 py-2 border rounded-lg ${
                      isSelected ? 'border-blue-500 bg-blue-50' : 'border-gray-200'
                    }`}
                  >
                    {method.toUpperCase()}
                  </button>
                );
              })}
            </div>
          </div>
        )}
      </div>

      {/* RBAC */}
      <div className="border rounded-lg p-4">
        <ToggleSwitch
          enabled={config.rbac.enabled}
          onChange={(enabled) => updateConfig({ rbac: { ...config.rbac, enabled } })}
          label="Role-Based Access Control"
          description="Define roles and permissions"
        />
        {config.rbac.enabled && (
          <div className="mt-4 space-y-3">
            <label className="block text-sm font-medium">Roles</label>
            <div className="space-y-2">
              {config.rbac.roles.map((role, index) => (
                <div key={index} className="flex items-center gap-2 p-2 bg-gray-50 rounded">
                  <input
                    type="text"
                    value={role.name}
                    onChange={(e) => {
                      const roles = [...config.rbac.roles];
                      roles[index] = { ...role, name: e.target.value };
                      updateConfig({ rbac: { ...config.rbac, roles } });
                    }}
                    className="flex-1 px-2 py-1 border rounded"
                    placeholder="Role name"
                  />
                  <input
                    type="text"
                    value={role.permissions.join(', ')}
                    onChange={(e) => {
                      const roles = [...config.rbac.roles];
                      roles[index] = { ...role, permissions: e.target.value.split(',').map((p) => p.trim()) };
                      updateConfig({ rbac: { ...config.rbac, roles } });
                    }}
                    className="flex-1 px-2 py-1 border rounded"
                    placeholder="Permissions (comma-separated)"
                  />
                  <button
                    onClick={() => {
                      const roles = config.rbac.roles.filter((_, i) => i !== index);
                      updateConfig({ rbac: { ...config.rbac, roles } });
                    }}
                    className="text-red-500 hover:text-red-700"
                  >
                    ✕
                  </button>
                </div>
              ))}
              <button
                onClick={() => {
                  const roles = [...config.rbac.roles, { name: '', permissions: [], description: '' }];
                  updateConfig({ rbac: { ...config.rbac, roles } });
                }}
                className="text-blue-500 hover:text-blue-700 text-sm"
              >
                + Add Role
              </button>
            </div>
          </div>
        )}
      </div>

      {/* API Keys */}
      <div className="border rounded-lg p-4">
        <ToggleSwitch
          enabled={config.apiKeys.enabled}
          onChange={(enabled) => updateConfig({ apiKeys: { ...config.apiKeys, enabled } })}
          label="API Keys"
          description="Allow developers to access your API"
        />
        {config.apiKeys.enabled && (
          <div className="mt-4 grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium mb-1">Prefix</label>
              <input
                type="text"
                value={config.apiKeys.prefix}
                onChange={(e) => updateConfig({ apiKeys: { ...config.apiKeys, prefix: e.target.value } })}
                className="w-full px-3 py-2 border rounded"
                placeholder="sk_"
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Expiry (days)</label>
              <input
                type="number"
                value={config.apiKeys.expiryDays || ''}
                onChange={(e) => updateConfig({ apiKeys: { ...config.apiKeys, expiryDays: parseInt(e.target.value) || undefined } })}
                className="w-full px-3 py-2 border rounded"
                placeholder="365"
              />
            </div>
          </div>
        )}
      </div>
    </div>
  );

  const renderAdvancedStep = () => (
    <div className="space-y-6">
      <h3 className="text-xl font-semibold">Advanced Options</h3>

      {/* Rate Limiting */}
      <div className="border rounded-lg p-4">
        <ToggleSwitch
          enabled={config.rateLimit.enabled}
          onChange={(enabled) => updateConfig({ rateLimit: { ...config.rateLimit, enabled } })}
          label="Rate Limiting"
          description="Prevent abuse by limiting requests"
        />
        {config.rateLimit.enabled && (
          <div className="mt-4 grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium mb-1">Max Requests</label>
              <input
                type="number"
                value={config.rateLimit.maxRequests}
                onChange={(e) => updateConfig({ rateLimit: { ...config.rateLimit, maxRequests: parseInt(e.target.value) } })}
                className="w-full px-3 py-2 border rounded"
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Window (ms)</label>
              <input
                type="number"
                value={config.rateLimit.windowMs}
                onChange={(e) => updateConfig({ rateLimit: { ...config.rateLimit, windowMs: parseInt(e.target.value) } })}
                className="w-full px-3 py-2 border rounded"
              />
            </div>
          </div>
        )}
      </div>

      {/* Audit Logging */}
      <div className="border rounded-lg p-4">
        <ToggleSwitch
          enabled={config.auditLog.enabled}
          onChange={(enabled) => updateConfig({ auditLog: { ...config.auditLog, enabled } })}
          label="Audit Logging"
          description="Track authentication events"
        />
        {config.auditLog.enabled && (
          <div className="mt-4 space-y-2">
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={config.auditLog.logSuccessful}
                onChange={(e) => updateConfig({ auditLog: { ...config.auditLog, logSuccessful: e.target.checked } })}
              />
              <span className="text-sm">Log successful attempts</span>
            </label>
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={config.auditLog.logFailed}
                onChange={(e) => updateConfig({ auditLog: { ...config.auditLog, logFailed: e.target.checked } })}
              />
              <span className="text-sm">Log failed attempts</span>
            </label>
            <div className="mt-2">
              <label className="block text-sm font-medium mb-1">Retention (days)</label>
              <input
                type="number"
                value={config.auditLog.retentionDays}
                onChange={(e) => updateConfig({ auditLog: { ...config.auditLog, retentionDays: parseInt(e.target.value) } })}
                className="w-32 px-3 py-2 border rounded"
              />
            </div>
          </div>
        )}
      </div>

      {/* Password Policy */}
      <div className="border rounded-lg p-4">
        <h4 className="font-medium mb-4">Password Policy</h4>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium mb-1">Minimum Length</label>
            <input
              type="number"
              value={config.passwordPolicy.minLength}
              onChange={(e) => updateConfig({ passwordPolicy: { ...config.passwordPolicy, minLength: parseInt(e.target.value) } })}
              className="w-full px-3 py-2 border rounded"
              min={6}
              max={32}
            />
          </div>
          <div className="space-y-2">
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={config.passwordPolicy.requireUppercase}
                onChange={(e) => updateConfig({ passwordPolicy: { ...config.passwordPolicy, requireUppercase: e.target.checked } })}
              />
              <span className="text-sm">Require uppercase</span>
            </label>
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={config.passwordPolicy.requireLowercase}
                onChange={(e) => updateConfig({ passwordPolicy: { ...config.passwordPolicy, requireLowercase: e.target.checked } })}
              />
              <span className="text-sm">Require lowercase</span>
            </label>
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={config.passwordPolicy.requireNumbers}
                onChange={(e) => updateConfig({ passwordPolicy: { ...config.passwordPolicy, requireNumbers: e.target.checked } })}
              />
              <span className="text-sm">Require numbers</span>
            </label>
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={config.passwordPolicy.requireSpecial}
                onChange={(e) => updateConfig({ passwordPolicy: { ...config.passwordPolicy, requireSpecial: e.target.checked } })}
              />
              <span className="text-sm">Require special characters</span>
            </label>
          </div>
        </div>
      </div>

      {/* Generation Options */}
      <div className="border rounded-lg p-4">
        <h4 className="font-medium mb-4">Generation Options</h4>
        <div className="space-y-2">
          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={config.generateTests}
              onChange={(e) => updateConfig({ generateTests: e.target.checked })}
            />
            <span className="text-sm">Generate unit tests</span>
          </label>
          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={config.generateSwagger}
              onChange={(e) => updateConfig({ generateSwagger: e.target.checked })}
            />
            <span className="text-sm">Generate Swagger documentation</span>
          </label>
          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={config.typescript}
              onChange={(e) => updateConfig({ typescript: e.target.checked })}
            />
            <span className="text-sm">Use TypeScript</span>
          </label>
        </div>
      </div>
    </div>
  );

  const renderReviewStep = () => (
    <div className="space-y-6">
      <h3 className="text-xl font-semibold">Review & Generate</h3>

      {/* Validation Messages */}
      {validation && (
        <div className={`p-4 rounded-lg ${validation.valid ? 'bg-green-50' : 'bg-red-50'}`}>
          {validation.errors.length > 0 && (
            <div className="text-red-600 mb-2">
              <strong>Errors:</strong>
              <ul className="list-disc ml-5">
                {validation.errors.map((err, i) => (
                  <li key={i}>{err}</li>
                ))}
              </ul>
            </div>
          )}
          {validation.warnings.length > 0 && (
            <div className="text-yellow-600">
              <strong>Warnings:</strong>
              <ul className="list-disc ml-5">
                {validation.warnings.map((warn, i) => (
                  <li key={i}>{warn}</li>
                ))}
              </ul>
            </div>
          )}
          {validation.valid && validation.errors.length === 0 && (
            <div className="text-green-600">✓ Configuration is valid</div>
          )}
        </div>
      )}

      {/* Configuration Summary */}
      <div className="bg-gray-50 rounded-lg p-4">
        <h4 className="font-medium mb-3">Configuration Summary</h4>
        <div className="grid grid-cols-2 gap-4 text-sm">
          <div>
            <span className="text-gray-500">Project:</span> {config.projectName}
          </div>
          <div>
            <span className="text-gray-500">Output:</span> {config.outputDir}
          </div>
          <div>
            <span className="text-gray-500">Database:</span> {config.database}
          </div>
          <div>
            <span className="text-gray-500">JWT Expiry:</span> {config.jwt.accessTokenExpiry} / {config.jwt.refreshTokenExpiry}
          </div>
          <div>
            <span className="text-gray-500">OAuth:</span> {config.oauth.enabled ? config.oauth.providers.join(', ') : 'Disabled'}
          </div>
          <div>
            <span className="text-gray-500">2FA:</span> {config.twoFactor.enabled ? config.twoFactor.methods.join(', ') : 'Disabled'}
          </div>
          <div>
            <span className="text-gray-500">RBAC:</span> {config.rbac.enabled ? `${config.rbac.roles.length} roles` : 'Disabled'}
          </div>
          <div>
            <span className="text-gray-500">API Keys:</span> {config.apiKeys.enabled ? 'Enabled' : 'Disabled'}
          </div>
        </div>
      </div>

      {/* Code Preview */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <h4 className="font-medium">Code Preview</h4>
          <select
            value={previewType}
            onChange={(e) => setPreviewType(e.target.value as PreviewFileType)}
            className="px-3 py-1 border rounded"
          >
            <option value="spec">Spec File</option>
            <option value="controller">Controller</option>
            <option value="service">Service</option>
            <option value="middleware">Middleware</option>
            <option value="routes">Routes</option>
          </select>
        </div>
        <CodePreview preview={preview} loading={previewLoading} />
      </div>

      {/* Generate Button */}
      <button
        onClick={handleGenerate}
        disabled={loading}
        className={`w-full py-3 rounded-lg font-medium text-white transition-colors ${
          loading ? 'bg-gray-400 cursor-not-allowed' : 'bg-blue-500 hover:bg-blue-600'
        }`}
      >
        {loading ? 'Generating...' : 'Generate Auth System'}
      </button>

      {/* Result */}
      {result && (
        <div className={`p-4 rounded-lg ${result.success ? 'bg-green-50' : 'bg-red-50'}`}>
          <h4 className={`font-medium ${result.success ? 'text-green-700' : 'text-red-700'}`}>
            {result.success ? '✓ Generation Successful' : '✕ Generation Failed'}
          </h4>
          <p className="text-sm mt-1">{result.message}</p>
          {result.files.length > 0 && (
            <div className="mt-3">
              <span className="text-sm font-medium">Generated Files ({result.files.length}):</span>
              <ul className="mt-1 text-sm text-gray-600 max-h-40 overflow-auto">
                {result.files.map((file, i) => (
                  <li key={i} className="flex justify-between py-1 border-b border-gray-100">
                    <span>{file.path}</span>
                    <span className="text-gray-400">{(file.size / 1024).toFixed(1)} KB</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </div>
  );

  const renderCurrentStep = () => {
    switch (currentStep) {
      case 0:
        return renderProjectStep();
      case 1:
        return renderJWTStep();
      case 2:
        return renderOAuthStep();
      case 3:
        return renderSecurityStep();
      case 4:
        return renderAdvancedStep();
      case 5:
        return renderReviewStep();
      default:
        return null;
    }
  };

  // ============================================================================
  // Main Render
  // ============================================================================

  return (
    <div className="max-w-4xl mx-auto p-6">
      <div className="mb-8">
        <h2 className="text-2xl font-bold">Auth Generator</h2>
        <p className="text-gray-600">Generate a complete authentication system for your project</p>
      </div>

      {error && (
        <div className="mb-6 p-4 bg-red-50 text-red-700 rounded-lg flex justify-between items-center">
          <span>{error}</span>
          <button onClick={() => setError(null)} className="text-red-500 hover:text-red-700">
            ✕
          </button>
        </div>
      )}

      <StepIndicator steps={AUTH_GENERATOR_STEPS} currentStep={currentStep} onStepClick={setCurrentStep} />

      <div className="bg-white rounded-lg shadow-sm border p-6">{renderCurrentStep()}</div>

      {/* Navigation */}
      <div className="flex justify-between mt-6">
        <button
          onClick={prevStep}
          disabled={currentStep === 0}
          className={`px-6 py-2 rounded-lg ${
            currentStep === 0 ? 'bg-gray-100 text-gray-400 cursor-not-allowed' : 'bg-gray-200 hover:bg-gray-300'
          }`}
        >
          Previous
        </button>
        {currentStep < AUTH_GENERATOR_STEPS.length - 1 && (
          <button onClick={nextStep} className="px-6 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600">
            Next
          </button>
        )}
      </div>
    </div>
  );
};

export default AuthGeneratorPanel;
