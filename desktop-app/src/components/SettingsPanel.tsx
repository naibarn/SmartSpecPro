import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";

// Types
interface LLMSettings {
  defaultProvider: string;
  defaultModel: string;
  temperature: number;
  maxTokens: number;
  apiKeys: {
    openai?: string;
    anthropic?: string;
    google?: string;
  };
}

interface KiloSettings {
  autoApproval: boolean;
  parallelMode: boolean;
  maxParallelTasks: number;
  defaultMode: "code" | "architect" | "ask" | "debug";
  skillsDirectory: string;
}

interface MemorySettings {
  semanticEnabled: boolean;
  episodicEnabled: boolean;
  maxSemanticItems: number;
  maxEpisodicItems: number;
  autoCleanup: boolean;
  cleanupDays: number;
}

interface AppSettings {
  theme: "light" | "dark" | "system";
  language: string;
  notifications: boolean;
  telemetry: boolean;
}

// Icons
const Icons = {
  Save: () => (
    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
    </svg>
  ),
  Key: () => (
    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z" />
    </svg>
  ),
  Robot: () => (
    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
    </svg>
  ),
  Brain: () => (
    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
    </svg>
  ),
  Cog: () => (
    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
    </svg>
  ),
  Eye: () => (
    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
    </svg>
  ),
  EyeOff: () => (
    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21" />
    </svg>
  ),
};

// Toggle Component
function Toggle({ 
  enabled, 
  onChange, 
  disabled = false 
}: { 
  enabled: boolean; 
  onChange: (value: boolean) => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={() => !disabled && onChange(!enabled)}
      disabled={disabled}
      className={`
        relative inline-flex h-6 w-11 items-center rounded-full transition-colors
        ${enabled ? 'bg-blue-600' : 'bg-gray-200 dark:bg-gray-700'}
        ${disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}
      `}
    >
      <span
        className={`
          inline-block h-4 w-4 transform rounded-full bg-white transition-transform
          ${enabled ? 'translate-x-6' : 'translate-x-1'}
        `}
      />
    </button>
  );
}

// Section Component
function SettingsSection({ 
  title, 
  icon, 
  children 
}: { 
  title: string; 
  icon: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 overflow-hidden">
      <div className="px-6 py-4 border-b border-gray-200 dark:border-gray-700 flex items-center gap-3">
        <span className="text-gray-500 dark:text-gray-400">{icon}</span>
        <h3 className="text-lg font-semibold text-gray-900 dark:text-white">{title}</h3>
      </div>
      <div className="p-6 space-y-4">
        {children}
      </div>
    </section>
  );
}

// Input Field Component
function InputField({
  label,
  type = "text",
  value,
  onChange,
  placeholder,
  description,
  isSecret = false,
}: {
  label: string;
  type?: string;
  value: string | number;
  onChange: (value: string) => void;
  placeholder?: string;
  description?: string;
  isSecret?: boolean;
}) {
  const [showSecret, setShowSecret] = useState(false);

  return (
    <div>
      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">
        {label}
      </label>
      <div className="relative">
        <input
          type={isSecret && !showSecret ? "password" : type}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          className="w-full px-3 py-2 bg-gray-50 dark:bg-gray-900 border border-gray-300 dark:border-gray-600 rounded-lg text-gray-900 dark:text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
        />
        {isSecret && (
          <button
            type="button"
            onClick={() => setShowSecret(!showSecret)}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
          >
            {showSecret ? <Icons.EyeOff /> : <Icons.Eye />}
          </button>
        )}
      </div>
      {description && (
        <p className="mt-1 text-xs text-gray-500">{description}</p>
      )}
    </div>
  );
}

// Select Field Component
function SelectField({
  label,
  value,
  onChange,
  options,
  description,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: { value: string; label: string }[];
  description?: string;
}) {
  return (
    <div>
      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">
        {label}
      </label>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full px-3 py-2 bg-gray-50 dark:bg-gray-900 border border-gray-300 dark:border-gray-600 rounded-lg text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
      >
        {options.map((opt) => (
          <option key={opt.value} value={opt.value}>
            {opt.label}
          </option>
        ))}
      </select>
      {description && (
        <p className="mt-1 text-xs text-gray-500">{description}</p>
      )}
    </div>
  );
}

// Slider Field Component
function SliderField({
  label,
  value,
  onChange,
  min,
  max,
  step = 1,
  description,
}: {
  label: string;
  value: number;
  onChange: (value: number) => void;
  min: number;
  max: number;
  step?: number;
  description?: string;
}) {
  return (
    <div>
      <div className="flex items-center justify-between mb-1.5">
        <label className="text-sm font-medium text-gray-700 dark:text-gray-300">
          {label}
        </label>
        <span className="text-sm text-gray-500">{value}</span>
      </div>
      <input
        type="range"
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        min={min}
        max={max}
        step={step}
        className="w-full h-2 bg-gray-200 dark:bg-gray-700 rounded-lg appearance-none cursor-pointer accent-blue-500"
      />
      {description && (
        <p className="mt-1 text-xs text-gray-500">{description}</p>
      )}
    </div>
  );
}

// Toggle Field Component
function ToggleField({
  label,
  description,
  enabled,
  onChange,
}: {
  label: string;
  description?: string;
  enabled: boolean;
  onChange: (value: boolean) => void;
}) {
  return (
    <div className="flex items-center justify-between">
      <div>
        <div className="text-sm font-medium text-gray-900 dark:text-white">{label}</div>
        {description && (
          <div className="text-xs text-gray-500">{description}</div>
        )}
      </div>
      <Toggle enabled={enabled} onChange={onChange} />
    </div>
  );
}

// Main Component
export function SettingsPanel() {
  const [activeTab, setActiveTab] = useState<"llm" | "kilo" | "memory" | "app">("llm");
  const [saved, setSaved] = useState(false);

  // Settings state
  const [llmSettings, setLlmSettings] = useState<LLMSettings>({
    defaultProvider: "openai",
    defaultModel: "gpt-4o",
    temperature: 0.7,
    maxTokens: 4096,
    apiKeys: {
      openai: "",
      anthropic: "",
      google: "",
    },
  });

  const [kiloSettings, setKiloSettings] = useState<KiloSettings>({
    autoApproval: true,
    parallelMode: false,
    maxParallelTasks: 3,
    defaultMode: "code",
    skillsDirectory: ".kilocode/skills",
  });

  const [memorySettings, setMemorySettings] = useState<MemorySettings>({
    semanticEnabled: true,
    episodicEnabled: true,
    maxSemanticItems: 1000,
    maxEpisodicItems: 5000,
    autoCleanup: true,
    cleanupDays: 30,
  });

  const [appSettings, setAppSettings] = useState<AppSettings>({
    theme: "system",
    language: "en",
    notifications: true,
    telemetry: false,
  });

  const handleSave = () => {
    // Save settings
    console.log("Saving settings:", { llmSettings, kiloSettings, memorySettings, appSettings });
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  const tabs = [
    { id: "llm", label: "LLM", icon: <Icons.Robot /> },
    { id: "kilo", label: "Kilo Code", icon: <Icons.Key /> },
    { id: "memory", label: "Memory", icon: <Icons.Brain /> },
    { id: "app", label: "Application", icon: <Icons.Cog /> },
  ];

  return (
    <div className="p-6 max-w-3xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-2xl font-bold text-gray-900 dark:text-white">Settings</h2>
          <p className="text-gray-600 dark:text-gray-400 mt-1">
            Configure SmartSpec Pro preferences
          </p>
        </div>
        <button
          onClick={handleSave}
          className="flex items-center gap-2 px-4 py-2 bg-blue-500 hover:bg-blue-600 text-white rounded-lg transition-colors"
        >
          <Icons.Save />
          {saved ? "Saved!" : "Save Changes"}
        </button>
      </div>

      {/* Tabs */}
      <div className="flex gap-2 mb-6 border-b border-gray-200 dark:border-gray-700 pb-2">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id as any)}
            className={`
              flex items-center gap-2 px-4 py-2 rounded-lg font-medium transition-colors
              ${activeTab === tab.id
                ? "bg-blue-50 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400"
                : "text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800"
              }
            `}
          >
            {tab.icon}
            {tab.label}
          </button>
        ))}
      </div>

      {/* Content */}
      <AnimatePresence mode="wait">
        <motion.div
          key={activeTab}
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -10 }}
          transition={{ duration: 0.2 }}
          className="space-y-6"
        >
          {activeTab === "llm" && (
            <>
              <SettingsSection title="Default Configuration" icon={<Icons.Robot />}>
                <SelectField
                  label="Default Provider"
                  value={llmSettings.defaultProvider}
                  onChange={(v) => setLlmSettings({ ...llmSettings, defaultProvider: v })}
                  options={[
                    { value: "openai", label: "OpenAI" },
                    { value: "anthropic", label: "Anthropic" },
                    { value: "google", label: "Google AI" },
                    { value: "ollama", label: "Ollama (Local)" },
                  ]}
                />
                <SelectField
                  label="Default Model"
                  value={llmSettings.defaultModel}
                  onChange={(v) => setLlmSettings({ ...llmSettings, defaultModel: v })}
                  options={[
                    { value: "gpt-4o", label: "GPT-4o" },
                    { value: "gpt-4o-mini", label: "GPT-4o Mini" },
                    { value: "claude-3-5-sonnet", label: "Claude 3.5 Sonnet" },
                    { value: "gemini-pro", label: "Gemini Pro" },
                  ]}
                />
                <SliderField
                  label="Temperature"
                  value={llmSettings.temperature}
                  onChange={(v) => setLlmSettings({ ...llmSettings, temperature: v })}
                  min={0}
                  max={2}
                  step={0.1}
                  description="Higher values make output more random"
                />
                <SliderField
                  label="Max Tokens"
                  value={llmSettings.maxTokens}
                  onChange={(v) => setLlmSettings({ ...llmSettings, maxTokens: v })}
                  min={256}
                  max={16384}
                  step={256}
                />
              </SettingsSection>

              <SettingsSection title="API Keys" icon={<Icons.Key />}>
                <InputField
                  label="OpenAI API Key"
                  value={llmSettings.apiKeys.openai || ""}
                  onChange={(v) => setLlmSettings({ ...llmSettings, apiKeys: { ...llmSettings.apiKeys, openai: v } })}
                  placeholder="sk-..."
                  isSecret
                />
                <InputField
                  label="Anthropic API Key"
                  value={llmSettings.apiKeys.anthropic || ""}
                  onChange={(v) => setLlmSettings({ ...llmSettings, apiKeys: { ...llmSettings.apiKeys, anthropic: v } })}
                  placeholder="sk-ant-..."
                  isSecret
                />
                <InputField
                  label="Google AI API Key"
                  value={llmSettings.apiKeys.google || ""}
                  onChange={(v) => setLlmSettings({ ...llmSettings, apiKeys: { ...llmSettings.apiKeys, google: v } })}
                  placeholder="AIza..."
                  isSecret
                />
              </SettingsSection>
            </>
          )}

          {activeTab === "kilo" && (
            <SettingsSection title="Kilo Code CLI" icon={<Icons.Robot />}>
              <ToggleField
                label="Auto Approval"
                description="Automatically approve safe operations"
                enabled={kiloSettings.autoApproval}
                onChange={(v) => setKiloSettings({ ...kiloSettings, autoApproval: v })}
              />
              <ToggleField
                label="Parallel Mode"
                description="Enable parallel task execution"
                enabled={kiloSettings.parallelMode}
                onChange={(v) => setKiloSettings({ ...kiloSettings, parallelMode: v })}
              />
              {kiloSettings.parallelMode && (
                <SliderField
                  label="Max Parallel Tasks"
                  value={kiloSettings.maxParallelTasks}
                  onChange={(v) => setKiloSettings({ ...kiloSettings, maxParallelTasks: v })}
                  min={1}
                  max={10}
                />
              )}
              <SelectField
                label="Default Mode"
                value={kiloSettings.defaultMode}
                onChange={(v) => setKiloSettings({ ...kiloSettings, defaultMode: v as any })}
                options={[
                  { value: "code", label: "Code" },
                  { value: "architect", label: "Architect" },
                  { value: "ask", label: "Ask" },
                  { value: "debug", label: "Debug" },
                ]}
              />
              <InputField
                label="Skills Directory"
                value={kiloSettings.skillsDirectory}
                onChange={(v) => setKiloSettings({ ...kiloSettings, skillsDirectory: v })}
                description="Relative path to skills directory"
              />
            </SettingsSection>
          )}

          {activeTab === "memory" && (
            <SettingsSection title="Memory System" icon={<Icons.Brain />}>
              <ToggleField
                label="Semantic Memory"
                description="Store long-term facts and preferences"
                enabled={memorySettings.semanticEnabled}
                onChange={(v) => setMemorySettings({ ...memorySettings, semanticEnabled: v })}
              />
              <ToggleField
                label="Episodic Memory"
                description="Store conversations and code snippets"
                enabled={memorySettings.episodicEnabled}
                onChange={(v) => setMemorySettings({ ...memorySettings, episodicEnabled: v })}
              />
              <SliderField
                label="Max Semantic Items"
                value={memorySettings.maxSemanticItems}
                onChange={(v) => setMemorySettings({ ...memorySettings, maxSemanticItems: v })}
                min={100}
                max={10000}
                step={100}
              />
              <SliderField
                label="Max Episodic Items"
                value={memorySettings.maxEpisodicItems}
                onChange={(v) => setMemorySettings({ ...memorySettings, maxEpisodicItems: v })}
                min={100}
                max={50000}
                step={100}
              />
              <ToggleField
                label="Auto Cleanup"
                description="Automatically remove old memories"
                enabled={memorySettings.autoCleanup}
                onChange={(v) => setMemorySettings({ ...memorySettings, autoCleanup: v })}
              />
              {memorySettings.autoCleanup && (
                <SliderField
                  label="Cleanup After (Days)"
                  value={memorySettings.cleanupDays}
                  onChange={(v) => setMemorySettings({ ...memorySettings, cleanupDays: v })}
                  min={7}
                  max={365}
                />
              )}
            </SettingsSection>
          )}

          {activeTab === "app" && (
            <>
              <SettingsSection title="Appearance" icon={<Icons.Cog />}>
                <SelectField
                  label="Theme"
                  value={appSettings.theme}
                  onChange={(v) => setAppSettings({ ...appSettings, theme: v as any })}
                  options={[
                    { value: "light", label: "Light" },
                    { value: "dark", label: "Dark" },
                    { value: "system", label: "System" },
                  ]}
                />
                <SelectField
                  label="Language"
                  value={appSettings.language}
                  onChange={(v) => setAppSettings({ ...appSettings, language: v })}
                  options={[
                    { value: "en", label: "English" },
                    { value: "th", label: "ไทย" },
                    { value: "ja", label: "日本語" },
                    { value: "zh", label: "中文" },
                  ]}
                />
              </SettingsSection>

              <SettingsSection title="Privacy" icon={<Icons.Key />}>
                <ToggleField
                  label="Notifications"
                  description="Show desktop notifications"
                  enabled={appSettings.notifications}
                  onChange={(v) => setAppSettings({ ...appSettings, notifications: v })}
                />
                <ToggleField
                  label="Telemetry"
                  description="Send anonymous usage data to improve the app"
                  enabled={appSettings.telemetry}
                  onChange={(v) => setAppSettings({ ...appSettings, telemetry: v })}
                />
              </SettingsSection>

              <SettingsSection title="About" icon={<Icons.Cog />}>
                <div className="space-y-2 text-sm text-gray-600 dark:text-gray-400">
                  <p><strong className="text-gray-900 dark:text-white">SmartSpec Pro</strong> v1.0.0</p>
                  <p>Built with Tauri + React + TypeScript</p>
                  <p>Kilo Code CLI Integration</p>
                  <p className="pt-2">
                    <a href="#" className="text-blue-500 hover:underline">Documentation</a>
                    {" · "}
                    <a href="#" className="text-blue-500 hover:underline">GitHub</a>
                    {" · "}
                    <a href="#" className="text-blue-500 hover:underline">Report Issue</a>
                  </p>
                </div>
              </SettingsSection>
            </>
          )}
        </motion.div>
      </AnimatePresence>
    </div>
  );
}
