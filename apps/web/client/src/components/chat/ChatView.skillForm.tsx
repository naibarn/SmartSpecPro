/**
 * Skill Form Integration for ChatView
 * 
 * This module contains the skill form state management and UI
 * that integrates with the main ChatView component.
 */

import React, { useState, useCallback, useEffect } from 'react';
import { trpc } from '@/lib/trpc';
import { SkillSelector } from '@/components/chat/skill/SkillSelector';
import { ChatDynamicSkillForm } from '@/components/chat/skill/ChatDynamicSkillForm';
import { ScheduleSkillDialog, ScheduleData } from '@/components/chat/skill/ScheduleSkillDialog';
import { SkillInputSchema } from '@/components/media/DynamicSkillForm';
import { useSkillForm } from '@/components/chat/skill/hooks/useSkillForm';
import { useSkillExecution } from '@/components/chat/skill/hooks/useSkillExecution';
import { Button } from '@/components/ui/button';
import { DashboardCard } from '@/components/dashboard';
import { Minimize2, X, Settings, Loader2, Clock } from 'lucide-react';
import { toast } from 'sonner';
import { describeSkillLocalExecution } from '@/features/local-ai/skills/skillLocalExecutionPolicy';
import { useTauriLocalSkillRuntimeStatus } from '@/features/local-ai/skills/useTauriLocalSkillRuntimeStatus';
import {
  shouldAllowExternalLocalBackend,
  shouldAllowOnDeviceLocalEngine,
  useExternalLocalTextBackendAvailability,
} from '@/features/local-ai/adapters/externalLocalTextBackend';
import type {
  LocalAiExecutionMode,
  ResolvedLocalSkillPolicy,
} from '@/features/local-ai/types/capability';

export interface SkillFormState {
  skillId: string;
  skillName: string;
  schema: SkillInputSchema;
  isOpen: boolean;
  isMinimized: boolean;
  localExecutionPolicy: ResolvedLocalSkillPolicy | null;
}

function assignMappedValue(target: Record<string, any>, path: string, value: any): void {
  if (!path.includes('.')) {
    target[path] = value;
    return;
  }

  const keys = path.split('.').filter(Boolean);
  let current = target;

  keys.slice(0, -1).forEach((key) => {
    if (
      current[key] === undefined
      || current[key] === null
      || typeof current[key] !== 'object'
      || Array.isArray(current[key])
    ) {
      current[key] = {};
    }
    current = current[key];
  });

  const finalKey = keys[keys.length - 1];
  if (finalKey) {
    current[finalKey] = value;
  }
}

export interface UseChatSkillFormReturn {
  // State
  skillFormState: SkillFormState | null;
  isFormOpen: boolean;
  hasFormChanges: boolean;
  isLoadingSchema: boolean;

  // UI Controls
  showSkillSelector: boolean;
  setShowSkillSelector: (show: boolean) => void;

  // Actions
  openSkillForm: (skillId: string, initialValues?: Record<string, any>) => Promise<void>;
  closeSkillForm: () => void;
  minimizeSkillForm: () => void;
  restoreSkillForm: () => void;

  // Form Submission
  handleSkillFormSubmit: (conversationId: number, prompt?: string) => Promise<void>;
  isSubmitting: boolean;

  // Render helpers
  renderSkillForm: () => React.ReactNode;
  renderSkillChip: () => React.ReactNode;
  renderSkillSelector: (options?: {
    skillIntentEnabled?: boolean;
    onToggleSkillIntent?: () => void;
  }) => React.ReactNode;
}

export interface ChatSkillLocalAiContext {
  featureEnabled: boolean;
  forceCloudOnly: boolean;
  localAiEnabled: boolean;
  executionMode: LocalAiExecutionMode;
  preferredLocalProfileId?: string | null;
  platform?: 'web' | 'tauri';
}

export function useChatSkillForm(
  conversationId: number,
  onSendMessage?: (content: string, skillContext?: any) => void,
  localAiContext?: ChatSkillLocalAiContext,
): UseChatSkillFormReturn {
  const [skillFormState, setSkillFormState] = useState<SkillFormState | null>(null);
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [showSkillSelector, setShowSkillSelector] = useState(false);
  const [isLoadingSchema, setIsLoadingSchema] = useState(false);
  const [pendingPrefill, setPendingPrefill] = useState<Record<string, any> | null>(null);
  const [isScheduleDialogOpen, setIsScheduleDialogOpen] = useState(false);
  const skillRuntimePlatform =
    localAiContext?.platform
      ? localAiContext.platform
      : typeof window !== 'undefined' && (window as any).__TAURI__ != null
      ? 'tauri'
      : 'web';
  const tauriRuntimeStatus = useTauriLocalSkillRuntimeStatus();
  const externalLocalTextBackend =
    useExternalLocalTextBackendAvailability(skillRuntimePlatform);

  const utils = trpc.useUtils();

  // Form state management
  const {
    values,
    setValue,
    validate,
    reset: resetForm,
    hasChanges
  } = useSkillForm({
    schema: skillFormState?.schema || { title: '', sections: [] },
  });

  // Skill execution
  const { execute, isLoading: isSubmitting, error: executionError } = useSkillExecution({
    conversationId,
    platform: skillRuntimePlatform,
    localAiEnabled: localAiContext?.featureEnabled === true && localAiContext?.localAiEnabled === true,
    localAiExecutionMode: localAiContext?.executionMode ?? 'off',
    forceCloudOnly: localAiContext?.forceCloudOnly === true,
    localExecutionPolicy: skillFormState?.localExecutionPolicy ?? null,
    preferredLocalProfileId: localAiContext?.preferredLocalProfileId ?? null,
  });

  // Schedule mutation
  const createScheduleMutation = trpc.scheduledMessages.create.useMutation({
    onSuccess: () => {
      utils.scheduledMessages.list.invalidate();
      toast.success('Skill scheduled successfully');
      setSkillFormState(null);
      setIsFormOpen(false);
      resetForm();
    },
    onError: (err) => toast.error(err.message),
  });

  // Apply pending prefill values once the form schema has loaded and the form is open
  useEffect(() => {
    if (pendingPrefill && skillFormState?.isOpen) {
      Object.entries(pendingPrefill).forEach(([key, value]) => setValue(key, value));
      setPendingPrefill(null);
    }
  }, [skillFormState?.isOpen, pendingPrefill, setValue]);

  // Open skill form
  const openSkillForm = useCallback(async (skillId: string, initialValues?: Record<string, any>) => {
    if (initialValues) setPendingPrefill(initialValues);
    setIsLoadingSchema(true);
    try {
      let skillName = skillId;
      let localExecutionPolicy: ResolvedLocalSkillPolicy | null = null;
      try {
        const skill = await utils.skills.get.fetch({
          id: skillId,
          platform: skillRuntimePlatform,
          origin: 'chat',
          ...(conversationId > 0 ? { conversationId } : {}),
        });
        skillName = skill.name;
        localExecutionPolicy = skill.localExecutionPolicy ?? null;
      } catch {
        // fall back to schema title or slug below
      }

      // Check if skill has schema
      const schemaData = await utils.skills.getInputSchema.fetch({ skillId });

      if (schemaData.hasSchema) {
        // If skills.get fails, try to extract name from schema or use skillId
        if (skillName === skillId && schemaData.schema && 'title' in schemaData.schema) {
          skillName = schemaData.schema.title;
        }

        // Open form
        setSkillFormState({
          skillId,
          skillName,
          schema: schemaData.schema as SkillInputSchema,
          isOpen: true,
          isMinimized: false,
          localExecutionPolicy,
        });
        setIsFormOpen(true);
        resetForm();
      } else {
        // Execute immediately
        await execute({
          skillId,
          dynamicParams: {},
          localExecutionPolicy,
        });
      }
    } catch (error) {
      console.error('[openSkillForm] Error:', error);
      toast.error('Failed to load skill form');
    } finally {
      setIsLoadingSchema(false);
    }
  }, [utils, execute, resetForm, skillRuntimePlatform]);

  // Close form
  const closeSkillForm = useCallback(() => {
    setSkillFormState(null);
    setIsFormOpen(false);
    resetForm();
  }, [resetForm]);

  // Minimize form
  const minimizeSkillForm = useCallback(() => {
    setSkillFormState(prev => prev ? { ...prev, isMinimized: true } : null);
  }, []);

  // Restore form
  const restoreSkillForm = useCallback(() => {
    setSkillFormState(prev => prev ? { ...prev, isMinimized: false } : null);
  }, []);

  const getMappedValuesAndPrompt = () => {
    if (!skillFormState) return null;
    const isValid = validate();
    if (!isValid) {
      toast.error('Please fill in all required fields');
      return null;
    }
    const mappedValues = skillFormState.schema.outputMapping
      ? Object.entries(skillFormState.schema.outputMapping).reduce(
        (acc, [fieldId, apiKey]) => {
          assignMappedValue(acc, apiKey, values[fieldId]);
          return acc;
        },
        {} as Record<string, any>
      )
      : values;

    const promptValue = values.prompt
      || values.input
      || values.message
      || values.description
      || values.text
      || `Use ${skillFormState.skillName}`;

    return { mappedValues, promptValue };
  };

  const handleSchedule = useCallback((scheduleData: ScheduleData) => {
    if (!skillFormState) return;
    const formVals = getMappedValuesAndPrompt();
    if (!formVals) return;

    createScheduleMutation.mutate({
      prompt: formVals.promptValue,
      description: `Run ${skillFormState.skillName}`,
      skillId: skillFormState.skillId,
      dynamicParams: formVals.mappedValues,
      ...scheduleData
    });
  }, [skillFormState, values, validate, createScheduleMutation]);

  // Handle form submission
  const handleSkillFormSubmit = useCallback(async (
    conversationId: number,
    prompt?: string
  ) => {
    if (!skillFormState) return;

    // Validate form
    const isValid = validate();
    if (!isValid) {
      toast.error('Please fill in all required fields');
      return;
    }

    const formVals = getMappedValuesAndPrompt();
    if (!formVals) return;

    // Get prompt from form values if not provided directly
    const formValsPrompt = Object.entries(formVals.mappedValues).find(([k]) => ['prompt', 'input', 'message', 'description', 'text'].includes(k))?.[1]
      || `Use ${skillFormState.skillName}`;

    const promptValue = prompt || formValsPrompt;

    try {
      const result = await execute({
        skillId: skillFormState.skillId,
        prompt: promptValue,
        dynamicParams: formVals.mappedValues,
      });

      if (result?.success) {
        // Send context message if needed
        if (onSendMessage) {
          onSendMessage(
            `[Using ${skillFormState.skillName}]`,
            { skillId: skillFormState.skillId, params: formVals.mappedValues }
          );
        }

        closeSkillForm();
        toast.success('Skill executed successfully');
      } else {
        toast.error(result?.error || 'Skill execution failed');
      }
    } catch (error) {
      toast.error('Failed to execute skill');
    }
  }, [skillFormState, values, validate, execute, closeSkillForm, onSendMessage]);

  // Render skill form
  const renderSkillForm = useCallback(() => {
    if (!skillFormState?.isOpen || skillFormState.isMinimized) return null;
    const localExecutionState = skillFormState.localExecutionPolicy
      ? describeSkillLocalExecution(skillFormState.localExecutionPolicy, skillRuntimePlatform, {
          scriptBundleAvailable: tauriRuntimeStatus.supportsScriptBundle,
          gemma4TextAvailable: shouldAllowOnDeviceLocalEngine(
            externalLocalTextBackend.localEnginePreference,
          )
            ? tauriRuntimeStatus.supportsGemma4Text
            : false,
          installedGemmaProfileIds:
            tauriRuntimeStatus.installedGemmaProfileIds,
          externalTextBackendAvailable:
            shouldAllowExternalLocalBackend(
              externalLocalTextBackend.localEnginePreference,
            ) && externalLocalTextBackend.backend != null,
        })
      : null;

    return (
      <>
        <DashboardCard className="mb-4 flex max-h-[70vh] flex-col relative">
          {/* Execution overlay */}
          {isSubmitting && (
            <div className="absolute inset-0 z-10 flex flex-col items-center justify-center bg-background/80 backdrop-blur-sm rounded-lg">
              <Loader2 className="h-8 w-8 animate-spin text-primary mb-3" />
              <p className="text-sm font-medium text-foreground">
                กำลังประมวลผล {skillFormState.skillName}...
              </p>
              <p className="text-xs text-muted-foreground mt-1">
                ระบบกำลังเรียกใช้ AI กรุณารอสักครู่
              </p>
            </div>
          )}
          <div className="flex flex-row items-center justify-between py-3 shrink-0">
            <h3 className="text-base flex items-center gap-2">
              {isSubmitting ? (
                <Loader2 className="h-4 w-4 animate-spin text-primary" />
              ) : (
                <Settings className="h-4 w-4" />
              )}
              {skillFormState.skillName}
              {localExecutionState &&
                localExecutionState.badgeLabel !== 'Cloud' &&
                (localExecutionState.canRunLocally || localExecutionState.canUseLocalPreprocess) && (
                <span
                  className={
                    localExecutionState.badgeLabel === 'Local Safe'
                      ? 'rounded-full bg-emerald-500/15 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-emerald-700 dark:text-emerald-300'
                      : 'rounded-full bg-sky-500/15 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-sky-700 dark:text-sky-300'
                  }
                  title={localExecutionState.reason ?? undefined}
                >
                  {localExecutionState.badgeLabel}
                </span>
              )}
              {isSubmitting && (
                <span className="text-xs font-normal text-muted-foreground ml-1">
                  (กำลังทำงาน)
                </span>
              )}
            </h3>
            <div className="flex gap-1">
              <Button
                variant="ghost"
                size="sm"
                className="h-8 w-8 p-0"
                onClick={minimizeSkillForm}
                disabled={isSubmitting}
              >
                <Minimize2 className="h-4 w-4" />
              </Button>
              <Button
                variant="ghost"
                size="sm"
                className="h-8 w-8 p-0"
                onClick={closeSkillForm}
                disabled={isSubmitting}
              >
                <X className="h-4 w-4" />
                </Button>
              </div>
          </div>
          <div className="flex-1 overflow-y-auto px-6" style={{ minHeight: 0, maxHeight: 'calc(70vh - 140px)' }}>
            <ChatDynamicSkillForm
              schema={skillFormState.schema}
              values={values}
              onChange={(newValues) => {
                // Update form values
                Object.entries(newValues).forEach(([key, value]) => {
                  if (values[key] !== value) {
                    setValue(key, value);
                  }
                });
              }}
              error={executionError?.message || null}
              />
          </div>
          <div className="flex justify-end gap-2 shrink-0 border-t pt-4">
            <Button variant="ghost" onClick={closeSkillForm} disabled={isSubmitting || createScheduleMutation.isPending}>
              Cancel
            </Button>
            <div className="flex-1" />
            <Button
              variant="outline"
              onClick={() => setIsScheduleDialogOpen(true)}
              disabled={isSubmitting || createScheduleMutation.isPending}
              className="gap-2"
            >
              <Clock className="w-4 h-4" />
              Schedule
            </Button>
            <Button
              onClick={() => handleSkillFormSubmit(conversationId)}
              disabled={isSubmitting || createScheduleMutation.isPending}
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin mr-2" />
                  กำลังประมวลผล...
                </>
              ) : (
                'Execute'
              )}
            </Button>
          </div>
        </DashboardCard>

        {skillFormState && (
          <ScheduleSkillDialog
            open={isScheduleDialogOpen}
            onOpenChange={setIsScheduleDialogOpen}
            skillName={skillFormState.skillName}
            onSchedule={handleSchedule}
          />
        )}
      </>
    );
  }, [
    conversationId,
    createScheduleMutation.isPending,
    executionError,
    externalLocalTextBackend.backend,
    externalLocalTextBackend.localEnginePreference,
    handleSchedule,
    handleSkillFormSubmit,
    isScheduleDialogOpen,
    isSubmitting,
    minimizeSkillForm,
    closeSkillForm,
    setValue,
    skillFormState,
    skillRuntimePlatform,
    tauriRuntimeStatus.installedGemmaProfileIds,
    tauriRuntimeStatus.supportsGemma4Text,
    tauriRuntimeStatus.supportsScriptBundle,
    values,
  ]);

  // Render minimized chip
  const renderSkillChip = useCallback(() => {
    if (!skillFormState?.isMinimized) return null;

    return (
      <div className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-full text-sm mb-3 ${isSubmitting ? 'bg-primary/20 border border-primary/30' : 'bg-primary/10'
        }`}>
        {isSubmitting ? (
          <Loader2 className="h-3.5 w-3.5 text-primary animate-spin" />
        ) : (
          <Settings className="h-3.5 w-3.5 text-primary" />
        )}
        <span className="font-medium">{skillFormState.skillName}</span>
        {isSubmitting ? (
          <span className="text-primary text-xs font-medium">
            กำลังประมวลผล...
          </span>
        ) : (
          <span className="text-muted-foreground">
            ({Object.keys(values).length} fields)
          </span>
        )}
        <div className="flex items-center gap-1 ml-2">
          <Button
            variant="ghost"
            size="sm"
            className="h-6 w-6 p-0"
            onClick={restoreSkillForm}
            disabled={isSubmitting}
          >
            <Minimize2 className="h-3 w-3 rotate-180" />
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className="h-6 w-6 p-0 text-destructive"
            onClick={closeSkillForm}
            disabled={isSubmitting}
          >
            <X className="h-3 w-3" />
          </Button>
        </div>
      </div>
    );
  }, [skillFormState, values, isSubmitting, restoreSkillForm, closeSkillForm]);

  // Render skill selector
  const renderSkillSelector = useCallback((
    options?: {
      skillIntentEnabled?: boolean;
      onToggleSkillIntent?: () => void;
    }
  ) => {
    return (
      <SkillSelector
        open={showSkillSelector}
        onClose={() => setShowSkillSelector(false)}
        conversationId={conversationId > 0 ? conversationId : undefined}
        onSelect={(skillId) => {
          setShowSkillSelector(false);
          openSkillForm(skillId);
        }}
        skillIntentEnabled={options?.skillIntentEnabled}
        onToggleSkillIntent={options?.onToggleSkillIntent}
      />
    );
  }, [showSkillSelector, openSkillForm]);

  return {
    skillFormState,
    isFormOpen,
    hasFormChanges: hasChanges,
    isLoadingSchema,
    showSkillSelector,
    setShowSkillSelector,
    openSkillForm,
    closeSkillForm,
    minimizeSkillForm,
    restoreSkillForm,
    handleSkillFormSubmit,
    isSubmitting,
    renderSkillForm,
    renderSkillChip,
    renderSkillSelector,
  };
}
