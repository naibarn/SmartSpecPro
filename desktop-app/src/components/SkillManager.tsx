/**
 * Skill Manager Component
 * 
 * Main page for managing project skills.
 * Features:
 * - List active skills
 * - Create/edit/delete skills
 * - Browse and inject templates
 * - Setup project with recommended skills
 */

import { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { SkillEditor } from './SkillEditor';
import { SkillTemplateSelector } from './SkillTemplateSelector';
import { skillService } from '../services/skillService';
import type { Skill, SkillCreate, SkillTemplate } from '../types/skill';

interface SkillManagerProps {
  workspace: string;
  userId?: string;
  projectId?: string;
  onClose?: () => void;
}

type TabType = 'skills' | 'templates' | 'setup';

export function SkillManager({ workspace, userId, projectId, onClose }: SkillManagerProps) {
  const [activeTab, setActiveTab] = useState<TabType>('skills');
  const [skills, setSkills] = useState<Skill[]>([]);
  const [templates, setTemplates] = useState<SkillTemplate[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  
  // Editor state
  const [showEditor, setShowEditor] = useState(false);
  const [editingSkill, setEditingSkill] = useState<Skill | null>(null);
  const [saving, setSaving] = useState(false);
  
  // Setup state
  const [setupLoading, setSetupLoading] = useState(false);
  const [setupComplete, setSetupComplete] = useState(false);
  const [selectedSetupTemplates, setSelectedSetupTemplates] = useState<string[]>([
    'project_conventions',
    'api_design',
    'security_practices',
  ]);

  // Load skills and templates
  const loadData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [skillsRes, templatesRes] = await Promise.all([
        skillService.listSkills(workspace),
        skillService.listTemplates(),
      ]);
      setSkills(skillsRes.skills);
      setTemplates(templatesRes.templates);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load data');
    } finally {
      setLoading(false);
    }
  }, [workspace]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Create skill
  const handleCreateSkill = async (skill: SkillCreate) => {
    setSaving(true);
    try {
      await skillService.createSkill(workspace, skill);
      await loadData();
      setShowEditor(false);
      setEditingSkill(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create skill');
    } finally {
      setSaving(false);
    }
  };

  // Update skill
  const handleUpdateSkill = async (skill: SkillCreate) => {
    if (!editingSkill) return;
    setSaving(true);
    try {
      await skillService.updateSkill(workspace, editingSkill.name, {
        description: skill.description,
        content: skill.content,
        scope: skill.scope,
        mode: skill.mode,
        tags: skill.tags,
      });
      await loadData();
      setShowEditor(false);
      setEditingSkill(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update skill');
    } finally {
      setSaving(false);
    }
  };

  // Delete skill
  const handleDeleteSkill = async (skillName: string) => {
    if (!confirm(`Are you sure you want to delete "${skillName}"?`)) return;
    try {
      await skillService.deleteSkill(workspace, skillName);
      await loadData();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete skill');
    }
  };

  // Inject template
  const handleInjectTemplate = async (templateName: string) => {
    try {
      await skillService.injectTemplate(workspace, templateName);
      await loadData();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to inject template');
    }
  };

  // Inject SmartSpec context
  const handleInjectContext = async () => {
    try {
      await skillService.injectContext(workspace, { userId, projectId });
      await loadData();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to inject context');
    }
  };

  // Setup project skills
  const handleSetupProject = async () => {
    setSetupLoading(true);
    try {
      const result = await skillService.setupProjectSkills(workspace, selectedSetupTemplates);
      if (result.success) {
        setSetupComplete(true);
        await loadData();
      } else {
        setError('Some skills failed to setup. Check console for details.');
        console.error('Setup results:', result.results);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to setup project');
    } finally {
      setSetupLoading(false);
    }
  };

  // Toggle setup template selection
  const toggleSetupTemplate = (templateName: string) => {
    setSelectedSetupTemplates((prev) =>
      prev.includes(templateName)
        ? prev.filter((t) => t !== templateName)
        : [...prev, templateName]
    );
  };

  // Get active skill names for template selector
  const activeSkillNames = skills.map((s) => s.name);

  return (
    <div className="flex flex-col h-full bg-gray-50 dark:bg-gray-950">
      {/* Header */}
      <div className="flex items-center justify-between px-6 py-4 bg-white dark:bg-gray-900 border-b border-gray-200 dark:border-gray-700">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
            Project Skills
          </h1>
          <p className="text-sm text-gray-500 dark:text-gray-400">
            Manage skills for Kilo Code in this project
          </p>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={handleInjectContext}
            className="px-4 py-2 text-sm bg-purple-100 dark:bg-purple-900 text-purple-700 dark:text-purple-300 rounded-lg hover:bg-purple-200 dark:hover:bg-purple-800 transition-colors"
          >
            🧠 Inject SmartSpec Context
          </button>
          <button
            onClick={() => {
              setEditingSkill(null);
              setShowEditor(true);
            }}
            className="px-4 py-2 text-sm bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors flex items-center gap-2"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
            New Skill
          </button>
          {onClose && (
            <button
              onClick={onClose}
              className="p-2 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg transition-colors"
            >
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          )}
        </div>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900">
        {[
          { id: 'skills' as TabType, label: 'Active Skills', icon: '📋', count: skills.length },
          { id: 'templates' as TabType, label: 'Templates', icon: '📦', count: templates.length },
          { id: 'setup' as TabType, label: 'Quick Setup', icon: '⚡' },
        ].map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`flex items-center gap-2 px-6 py-3 text-sm font-medium transition-colors border-b-2 ${
              activeTab === tab.id
                ? 'border-indigo-600 text-indigo-600 dark:text-indigo-400'
                : 'border-transparent text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white'
            }`}
          >
            <span>{tab.icon}</span>
            {tab.label}
            {tab.count !== undefined && (
              <span className="px-2 py-0.5 bg-gray-100 dark:bg-gray-800 rounded-full text-xs">
                {tab.count}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Error message */}
      {error && (
        <div className="mx-6 mt-4 p-4 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg text-red-700 dark:text-red-300 flex items-center justify-between">
          <span>{error}</span>
          <button onClick={() => setError(null)} className="hover:text-red-900 dark:hover:text-red-100">
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
      )}

      {/* Content */}
      <div className="flex-1 overflow-hidden">
        <AnimatePresence mode="wait">
          {/* Active Skills Tab */}
          {activeTab === 'skills' && (
            <motion.div
              key="skills"
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 20 }}
              className="h-full overflow-auto p-6"
            >
              {loading ? (
                <div className="flex items-center justify-center h-64">
                  <svg className="animate-spin h-8 w-8 text-indigo-600" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                  </svg>
                </div>
              ) : skills.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-64 text-gray-500 dark:text-gray-400">
                  <svg className="w-16 h-16 mb-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
                  </svg>
                  <p className="text-lg font-medium">No skills yet</p>
                  <p className="text-sm mb-4">Create a new skill or use Quick Setup to get started</p>
                  <button
                    onClick={() => setActiveTab('setup')}
                    className="px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors"
                  >
                    Quick Setup
                  </button>
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {skills.map((skill) => (
                    <div
                      key={skill.name}
                      className="p-4 bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 hover:shadow-md transition-shadow"
                    >
                      <div className="flex items-start justify-between mb-2">
                        <div>
                          <h3 className="font-semibold text-gray-900 dark:text-white">
                            {skill.name}
                          </h3>
                          <div className="flex gap-2 mt-1">
                            <span className="px-2 py-0.5 bg-indigo-100 dark:bg-indigo-900 text-indigo-700 dark:text-indigo-300 rounded text-xs">
                              {skill.mode}
                            </span>
                            <span className="px-2 py-0.5 bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-400 rounded text-xs">
                              {skill.scope}
                            </span>
                          </div>
                        </div>
                        <div className="flex gap-1">
                          <button
                            onClick={() => {
                              setEditingSkill(skill);
                              setShowEditor(true);
                            }}
                            className="p-1.5 hover:bg-gray-100 dark:hover:bg-gray-700 rounded transition-colors"
                            title="Edit"
                          >
                            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                            </svg>
                          </button>
                          <button
                            onClick={() => handleDeleteSkill(skill.name)}
                            className="p-1.5 hover:bg-red-100 dark:hover:bg-red-900/30 text-red-600 dark:text-red-400 rounded transition-colors"
                            title="Delete"
                          >
                            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                            </svg>
                          </button>
                        </div>
                      </div>
                      <p className="text-sm text-gray-600 dark:text-gray-400 line-clamp-2">
                        {skill.description}
                      </p>
                      {skill.tags.length > 0 && (
                        <div className="flex flex-wrap gap-1 mt-2">
                          {skill.tags.slice(0, 3).map((tag) => (
                            <span
                              key={tag}
                              className="px-1.5 py-0.5 bg-gray-100 dark:bg-gray-700 text-gray-500 dark:text-gray-400 rounded text-xs"
                            >
                              {tag}
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </motion.div>
          )}

          {/* Templates Tab */}
          {activeTab === 'templates' && (
            <motion.div
              key="templates"
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 20 }}
              className="h-full"
            >
              <SkillTemplateSelector
                templates={templates}
                onSelect={(template) => console.log('Selected:', template)}
                onInject={handleInjectTemplate}
                isLoading={loading}
                selectedTemplates={activeSkillNames}
              />
            </motion.div>
          )}

          {/* Quick Setup Tab */}
          {activeTab === 'setup' && (
            <motion.div
              key="setup"
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 20 }}
              className="h-full overflow-auto p-6"
            >
              <div className="max-w-2xl mx-auto">
                <div className="text-center mb-8">
                  <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-2">
                    Quick Project Setup
                  </h2>
                  <p className="text-gray-600 dark:text-gray-400">
                    Select the skill templates you want to add to your project
                  </p>
                </div>

                {setupComplete ? (
                  <div className="text-center py-12">
                    <div className="w-16 h-16 bg-green-100 dark:bg-green-900 rounded-full flex items-center justify-center mx-auto mb-4">
                      <svg className="w-8 h-8 text-green-600 dark:text-green-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                      </svg>
                    </div>
                    <h3 className="text-xl font-semibold text-gray-900 dark:text-white mb-2">
                      Setup Complete!
                    </h3>
                    <p className="text-gray-600 dark:text-gray-400 mb-4">
                      Your project skills have been configured
                    </p>
                    <button
                      onClick={() => setActiveTab('skills')}
                      className="px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors"
                    >
                      View Skills
                    </button>
                  </div>
                ) : (
                  <>
                    <div className="space-y-3 mb-8">
                      {templates.map((template) => (
                        <label
                          key={template.name}
                          className={`flex items-center gap-4 p-4 rounded-lg border-2 cursor-pointer transition-all ${
                            selectedSetupTemplates.includes(template.name)
                              ? 'border-indigo-500 bg-indigo-50 dark:bg-indigo-900/20'
                              : 'border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600 bg-white dark:bg-gray-800'
                          }`}
                        >
                          <input
                            type="checkbox"
                            checked={selectedSetupTemplates.includes(template.name)}
                            onChange={() => toggleSetupTemplate(template.name)}
                            className="w-5 h-5 text-indigo-600 rounded focus:ring-indigo-500"
                          />
                          <div className="flex-1">
                            <div className="flex items-center gap-2">
                              <span className="font-medium text-gray-900 dark:text-white">
                                {template.name.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())}
                              </span>
                              <span className="px-2 py-0.5 bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-400 rounded text-xs">
                                {template.mode}
                              </span>
                            </div>
                            <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">
                              {template.description}
                            </p>
                          </div>
                        </label>
                      ))}
                    </div>

                    <div className="flex justify-center">
                      <button
                        onClick={handleSetupProject}
                        disabled={setupLoading || selectedSetupTemplates.length === 0}
                        className="px-8 py-3 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors disabled:opacity-50 flex items-center gap-2"
                      >
                        {setupLoading ? (
                          <>
                            <svg className="animate-spin h-5 w-5" viewBox="0 0 24 24">
                              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                            </svg>
                            Setting up...
                          </>
                        ) : (
                          <>
                            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                            </svg>
                            Setup {selectedSetupTemplates.length} Skills
                          </>
                        )}
                      </button>
                    </div>
                  </>
                )}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Skill Editor Modal */}
      <AnimatePresence>
        {showEditor && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => {
                setShowEditor(false);
                setEditingSkill(null);
              }}
              className="fixed inset-0 bg-black/50 z-40"
            />
            <motion.div
              initial={{ opacity: 0, y: 50 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 50 }}
              className="fixed inset-4 md:inset-10 z-50"
            >
              <SkillEditor
                skill={editingSkill}
                onSave={editingSkill ? handleUpdateSkill : handleCreateSkill}
                onCancel={() => {
                  setShowEditor(false);
                  setEditingSkill(null);
                }}
                isLoading={saving}
              />
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </div>
  );
}

export default SkillManager;
