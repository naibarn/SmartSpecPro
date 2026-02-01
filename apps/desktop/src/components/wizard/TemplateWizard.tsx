// Template Wizard Component
// Step-by-step wizard for creating projects from templates

import { useState } from 'react';
import {
  useTemplates,
  WizardStep,
  getCategoryIcon,
  getComplexityColor,
  getComplexityLabel,
} from '../../services/templateService';

interface TemplateWizardProps {
  className?: string;
  onComplete?: (projectPath: string) => void;
}

export function TemplateWizard({ className = '', onComplete }: TemplateWizardProps) {
  const {
    wizard,
    isLoading,
    error,
    nextStep,
    prevStep,
    goToStep,
    resetWizard,
  } = useTemplates();

  const steps: { id: WizardStep; label: string; icon: string }[] = [
    { id: 'category', label: 'Category', icon: '📁' },
    { id: 'template', label: 'Template', icon: '📋' },
    { id: 'features', label: 'Features', icon: '✨' },
    { id: 'config', label: 'Configure', icon: '⚙️' },
    { id: 'generate', label: 'Generate', icon: '🚀' },
    { id: 'complete', label: 'Complete', icon: '✅' },
  ];

  const currentStepIndex = steps.findIndex(s => s.id === wizard.currentStep);

  return (
    <div className={`flex flex-col h-full bg-gray-50 dark:bg-gray-900 ${className}`}>
      {/* Progress Bar */}
      <div className="px-6 py-4 bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-xl font-bold text-gray-900 dark:text-white">
            Create New Project
          </h2>
          <button
            onClick={resetWizard}
            className="text-sm text-gray-500 hover:text-gray-700 dark:hover:text-gray-300"
          >
            Start Over
          </button>
        </div>
        
        {/* Steps */}
        <div className="flex items-center">
          {steps.map((step, index) => (
            <div key={step.id} className="flex items-center flex-1">
              <button
                onClick={() => index < currentStepIndex && goToStep(step.id)}
                disabled={index > currentStepIndex}
                className={`flex items-center gap-2 px-3 py-2 rounded-lg transition-colors ${
                  index === currentStepIndex
                    ? 'bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300'
                    : index < currentStepIndex
                    ? 'text-green-600 dark:text-green-400 hover:bg-gray-100 dark:hover:bg-gray-700'
                    : 'text-gray-400'
                }`}
              >
                <span>{index < currentStepIndex ? '✓' : step.icon}</span>
                <span className="text-sm font-medium hidden md:inline">{step.label}</span>
              </button>
              {index < steps.length - 1 && (
                <div className={`flex-1 h-0.5 mx-2 ${
                  index < currentStepIndex ? 'bg-green-500' : 'bg-gray-200 dark:bg-gray-700'
                }`} />
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Error Message */}
      {error && (
        <div className="mx-6 mt-4 p-4 bg-red-100 dark:bg-red-900/20 text-red-700 dark:text-red-300 rounded-lg">
          {error}
        </div>
      )}

      {/* Step Content */}
      <div className="flex-1 overflow-y-auto p-6">
        {wizard.currentStep === 'category' && <CategoryStep />}
        {wizard.currentStep === 'template' && <TemplateStep />}
        {wizard.currentStep === 'features' && <FeaturesStep />}
        {wizard.currentStep === 'config' && <ConfigStep />}
        {wizard.currentStep === 'generate' && <GenerateStep />}
        {wizard.currentStep === 'complete' && <CompleteStep onComplete={onComplete} />}
      </div>

      {/* Navigation */}
      {wizard.currentStep !== 'complete' && (
        <div className="px-6 py-4 bg-white dark:bg-gray-800 border-t border-gray-200 dark:border-gray-700">
          <div className="flex items-center justify-between">
            <button
              onClick={prevStep}
              disabled={currentStepIndex === 0 || isLoading}
              className="px-4 py-2 text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg disabled:opacity-50"
            >
              ← Back
            </button>
            <button
              onClick={nextStep}
              disabled={isLoading || !canProceed(wizard)}
              className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:bg-blue-400"
            >
              {isLoading ? 'Loading...' : wizard.currentStep === 'generate' ? 'Generate Project' : 'Continue →'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function canProceed(wizard: ReturnType<typeof useTemplates>['wizard']): boolean {
  switch (wizard.currentStep) {
    case 'category':
      return !!wizard.selectedCategory;
    case 'template':
      return !!wizard.selectedTemplate;
    case 'features':
      return true;
    case 'config':
      return !!wizard.config.project_name && !!wizard.config.output_path;
    case 'generate':
      return true;
    default:
      return false;
  }
}

// ============================================
// Step Components
// ============================================

function CategoryStep() {
  const { categories, selectCategory, wizard } = useTemplates();

  return (
    <div>
      <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-2">
        What are you building?
      </h3>
      <p className="text-gray-600 dark:text-gray-400 mb-6">
        Select a category to see available templates
      </p>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {categories.map((category) => (
          <button
            key={category.id}
            onClick={() => selectCategory(category.id)}
            className={`p-6 rounded-xl border-2 text-left transition-all ${
              wizard.selectedCategory === category.id
                ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20'
                : 'border-gray-200 dark:border-gray-700 hover:border-blue-300 dark:hover:border-blue-700'
            }`}
          >
            <div className="text-3xl mb-3">{category.icon}</div>
            <div className="font-semibold text-gray-900 dark:text-white">
              {category.name}
            </div>
            <div className="text-sm text-gray-500 mt-1">
              {category.description}
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}

function TemplateStep() {
  const { templates, selectTemplate, wizard, isLoading } = useTemplates();
  const [searchQuery, setSearchQuery] = useState('');

  const filteredTemplates = templates.filter(t =>
    t.name.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div>
      <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-2">
        Choose a template
      </h3>
      <p className="text-gray-600 dark:text-gray-400 mb-6">
        Select a template that best fits your project
      </p>

      {/* Search */}
      <div className="mb-6">
        <input
          type="text"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder="Search templates..."
          className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800"
        />
      </div>

      {/* Template Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {filteredTemplates.map((template) => (
          <button
            key={template.id}
            onClick={() => selectTemplate(template.id)}
            disabled={isLoading}
            className={`p-4 rounded-xl border-2 text-left transition-all ${
              wizard.selectedTemplate?.id === template.id
                ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20'
                : 'border-gray-200 dark:border-gray-700 hover:border-blue-300'
            }`}
          >
            <div className="flex items-center gap-3 mb-3">
              <span className="text-2xl">{getCategoryIcon(template.category)}</span>
              <div>
                <div className="font-semibold text-gray-900 dark:text-white">
                  {template.name}
                </div>
                <div className="text-xs text-gray-500 capitalize">
                  {template.category}
                </div>
              </div>
            </div>
          </button>
        ))}
      </div>

      {/* Selected Template Details */}
      {wizard.selectedTemplate && (
        <div className="mt-6 p-4 bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700">
          <h4 className="font-semibold text-gray-900 dark:text-white mb-2">
            {wizard.selectedTemplate.name}
          </h4>
          <p className="text-gray-600 dark:text-gray-400 text-sm mb-4">
            {wizard.selectedTemplate.description}
          </p>
          
          <div className="flex flex-wrap gap-4 text-sm">
            <div>
              <span className="text-gray-500">Complexity:</span>
              <span className={`ml-2 px-2 py-0.5 rounded bg-${getComplexityColor(wizard.selectedTemplate.complexity)}-100 dark:bg-${getComplexityColor(wizard.selectedTemplate.complexity)}-900/30 text-${getComplexityColor(wizard.selectedTemplate.complexity)}-700`}>
                {getComplexityLabel(wizard.selectedTemplate.complexity)}
              </span>
            </div>
            <div>
              <span className="text-gray-500">Est. Time:</span>
              <span className="ml-2 text-gray-900 dark:text-white">
                {wizard.selectedTemplate.estimated_time}
              </span>
            </div>
          </div>

          {/* Tech Stack */}
          <div className="mt-4">
            <div className="text-sm text-gray-500 mb-2">Tech Stack:</div>
            <div className="flex flex-wrap gap-2">
              {Object.entries(wizard.selectedTemplate.tech_stack)
                .filter(([_, value]) => value)
                .map(([key, value]) => (
                  <span
                    key={key}
                    className="px-2 py-1 bg-gray-100 dark:bg-gray-700 rounded text-xs"
                  >
                    {value}
                  </span>
                ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function FeaturesStep() {
  const { wizard, toggleFeature } = useTemplates();

  if (!wizard.selectedTemplate) return null;

  const requiredFeatures = wizard.selectedTemplate.features.filter(f => f.required);
  const optionalFeatures = wizard.selectedTemplate.features.filter(f => !f.required);

  return (
    <div>
      <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-2">
        Select features
      </h3>
      <p className="text-gray-600 dark:text-gray-400 mb-6">
        Choose the features you want to include in your project
      </p>

      {/* Required Features */}
      {requiredFeatures.length > 0 && (
        <div className="mb-6">
          <h4 className="text-sm font-semibold text-gray-500 uppercase tracking-wider mb-3">
            Required Features
          </h4>
          <div className="space-y-2">
            {requiredFeatures.map((feature) => (
              <div
                key={feature.id}
                className="flex items-center gap-3 p-3 bg-gray-100 dark:bg-gray-800 rounded-lg"
              >
                <span className="text-green-500">✓</span>
                <div>
                  <div className="font-medium text-gray-900 dark:text-white">
                    {feature.name}
                  </div>
                  <div className="text-sm text-gray-500">{feature.description}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Optional Features */}
      {optionalFeatures.length > 0 && (
        <div>
          <h4 className="text-sm font-semibold text-gray-500 uppercase tracking-wider mb-3">
            Optional Features
          </h4>
          <div className="space-y-2">
            {optionalFeatures.map((feature) => (
              <button
                key={feature.id}
                onClick={() => toggleFeature(feature.id)}
                className={`w-full flex items-center gap-3 p-3 rounded-lg border-2 text-left transition-all ${
                  wizard.selectedFeatures.includes(feature.id)
                    ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20'
                    : 'border-gray-200 dark:border-gray-700 hover:border-blue-300'
                }`}
              >
                <div className={`w-5 h-5 rounded border-2 flex items-center justify-center ${
                  wizard.selectedFeatures.includes(feature.id)
                    ? 'bg-blue-500 border-blue-500 text-white'
                    : 'border-gray-400'
                }`}>
                  {wizard.selectedFeatures.includes(feature.id) && '✓'}
                </div>
                <div>
                  <div className="font-medium text-gray-900 dark:text-white">
                    {feature.name}
                  </div>
                  <div className="text-sm text-gray-500">{feature.description}</div>
                </div>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function ConfigStep() {
  const { wizard, updateConfig, validateCurrentConfig } = useTemplates();
  const [errors, setErrors] = useState<Record<string, string>>({});

  const handleBlur = async () => {
    const result = await validateCurrentConfig();
    const errorMap: Record<string, string> = {};
    result.errors.forEach(e => {
      errorMap[e.field] = e.message;
    });
    setErrors(errorMap);
  };

  return (
    <div>
      <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-2">
        Configure your project
      </h3>
      <p className="text-gray-600 dark:text-gray-400 mb-6">
        Set up the basic configuration for your new project
      </p>

      <div className="max-w-xl space-y-6">
        {/* Project Name */}
        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
            Project Name *
          </label>
          <input
            type="text"
            value={wizard.config.project_name || ''}
            onChange={(e) => updateConfig({ project_name: e.target.value })}
            onBlur={handleBlur}
            placeholder="my-awesome-project"
            className={`w-full px-4 py-2 border rounded-lg bg-white dark:bg-gray-800 ${
              errors.project_name ? 'border-red-500' : 'border-gray-300 dark:border-gray-600'
            }`}
          />
          {errors.project_name && (
            <p className="mt-1 text-sm text-red-500">{errors.project_name}</p>
          )}
          <p className="mt-1 text-xs text-gray-500">
            Lowercase letters, numbers, and hyphens only
          </p>
        </div>

        {/* Description */}
        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
            Description
          </label>
          <textarea
            value={wizard.config.project_description || ''}
            onChange={(e) => updateConfig({ project_description: e.target.value })}
            placeholder="A brief description of your project..."
            rows={3}
            className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800"
          />
        </div>

        {/* Output Path */}
        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
            Output Directory *
          </label>
          <input
            type="text"
            value={wizard.config.output_path || ''}
            onChange={(e) => updateConfig({ output_path: e.target.value })}
            onBlur={handleBlur}
            placeholder="/home/user/projects"
            className={`w-full px-4 py-2 border rounded-lg bg-white dark:bg-gray-800 ${
              errors.output_path ? 'border-red-500' : 'border-gray-300 dark:border-gray-600'
            }`}
          />
          {errors.output_path && (
            <p className="mt-1 text-sm text-red-500">{errors.output_path}</p>
          )}
        </div>
      </div>
    </div>
  );
}

function GenerateStep() {
  const { wizard, generationProgress, generateProject } = useTemplates();

  return (
    <div className="text-center">
      <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-2">
        Ready to generate
      </h3>
      <p className="text-gray-600 dark:text-gray-400 mb-8">
        Review your configuration and click Generate to create your project
      </p>

      {/* Summary */}
      <div className="max-w-md mx-auto bg-white dark:bg-gray-800 rounded-xl p-6 text-left mb-8">
        <div className="space-y-3">
          <div className="flex justify-between">
            <span className="text-gray-500">Template:</span>
            <span className="font-medium text-gray-900 dark:text-white">
              {wizard.selectedTemplate?.name}
            </span>
          </div>
          <div className="flex justify-between">
            <span className="text-gray-500">Project Name:</span>
            <span className="font-medium text-gray-900 dark:text-white">
              {wizard.config.project_name}
            </span>
          </div>
          <div className="flex justify-between">
            <span className="text-gray-500">Features:</span>
            <span className="font-medium text-gray-900 dark:text-white">
              {wizard.selectedFeatures.length} selected
            </span>
          </div>
          <div className="flex justify-between">
            <span className="text-gray-500">Output:</span>
            <span className="font-medium text-gray-900 dark:text-white truncate max-w-48">
              {wizard.config.output_path}/{wizard.config.project_name}
            </span>
          </div>
        </div>
      </div>

      {/* Progress */}
      {generationProgress && (
        <div className="max-w-md mx-auto">
          <div className="mb-2 flex justify-between text-sm">
            <span className="text-gray-600 dark:text-gray-400">
              {generationProgress.message}
            </span>
            <span className="text-gray-900 dark:text-white">
              {generationProgress.percent}%
            </span>
          </div>
          <div className="w-full h-2 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
            <div
              className="h-full bg-blue-500 rounded-full transition-all"
              style={{ width: `${generationProgress.percent}%` }}
            />
          </div>
          {generationProgress.current_file && (
            <p className="mt-2 text-xs text-gray-500 truncate">
              {generationProgress.current_file}
            </p>
          )}
        </div>
      )}
    </div>
  );
}

function CompleteStep({ onComplete }: { onComplete?: (path: string) => void }) {
  const { wizard, resetWizard } = useTemplates();

  if (!wizard.generationResult) return null;

  return (
    <div className="text-center">
      <div className="text-6xl mb-4">🎉</div>
      <h3 className="text-2xl font-bold text-gray-900 dark:text-white mb-2">
        Project Created!
      </h3>
      <p className="text-gray-600 dark:text-gray-400 mb-8">
        Your project has been generated successfully
      </p>

      {/* Stats */}
      <div className="flex justify-center gap-8 mb-8">
        <div className="text-center">
          <div className="text-3xl font-bold text-blue-600">
            {wizard.generationResult.files_created.length}
          </div>
          <div className="text-sm text-gray-500">Files Created</div>
        </div>
        <div className="text-center">
          <div className="text-3xl font-bold text-green-600">
            {(wizard.generationResult.duration_ms / 1000).toFixed(1)}s
          </div>
          <div className="text-sm text-gray-500">Generation Time</div>
        </div>
      </div>

      {/* Path */}
      <div className="max-w-md mx-auto bg-gray-100 dark:bg-gray-800 rounded-lg p-4 mb-8">
        <p className="text-sm text-gray-500 mb-1">Project Location:</p>
        <p className="font-mono text-sm text-gray-900 dark:text-white break-all">
          {wizard.generationResult.project_path}
        </p>
      </div>

      {/* Next Steps */}
      <div className="max-w-md mx-auto text-left mb-8">
        <h4 className="font-semibold text-gray-900 dark:text-white mb-3">Next Steps:</h4>
        <div className="space-y-2">
          {wizard.generationResult.next_steps.map((step, i) => (
            <div key={i} className="flex items-start gap-3 p-3 bg-white dark:bg-gray-800 rounded-lg">
              <span className="text-blue-500">{i + 1}.</span>
              <div>
                <div className="font-medium text-gray-900 dark:text-white">
                  {step.title}
                </div>
                <div className="text-sm text-gray-500">{step.description}</div>
                {step.command && (
                  <code className="mt-1 block text-xs bg-gray-100 dark:bg-gray-700 px-2 py-1 rounded">
                    {step.command}
                  </code>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Actions */}
      <div className="flex justify-center gap-4">
        <button
          onClick={resetWizard}
          className="px-4 py-2 text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg"
        >
          Create Another
        </button>
        <button
          onClick={() => onComplete?.(wizard.generationResult!.project_path)}
          className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
        >
          Open Project
        </button>
      </div>
    </div>
  );
}

export default TemplateWizard;
