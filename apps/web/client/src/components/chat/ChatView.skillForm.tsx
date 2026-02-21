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
import { SkillInputSchema } from '@/components/media/DynamicSkillForm';
import { useSkillForm } from '@/components/chat/skill/hooks/useSkillForm';
import { useSkillExecution } from '@/components/chat/skill/hooks/useSkillExecution';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardFooter } from '@/components/ui/card';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Minimize2, X, Settings, Loader2 } from 'lucide-react';
import { toast } from 'sonner';

export interface SkillFormState {
  skillId: string;
  skillName: string;
  schema: SkillInputSchema;
  isOpen: boolean;
  isMinimized: boolean;
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
  renderSkillSelector: () => React.ReactNode;
}

export function useChatSkillForm(
  conversationId: number,
  onSendMessage?: (content: string, skillContext?: any) => void
): UseChatSkillFormReturn {
  const [skillFormState, setSkillFormState] = useState<SkillFormState | null>(null);
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [showSkillSelector, setShowSkillSelector] = useState(false);
  const [isLoadingSchema, setIsLoadingSchema] = useState(false);
  const [pendingPrefill, setPendingPrefill] = useState<Record<string, any> | null>(null);
  
  const utils = trpc.useUtils();
  
  // Form state management
  const { 
    values, 
    setValue, 
    validate, 
    reset: resetForm, 
    errors,
    hasChanges 
  } = useSkillForm({
    schema: skillFormState?.schema || { title: '', sections: [] },
  });
  
  // Skill execution
  const { execute, isLoading: isSubmitting, error: executionError } = useSkillExecution({
    conversationId,
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
      // Check if skill has schema
      const schemaData = await utils.skills.getInputSchema.fetch({ skillId });
      
      if (schemaData.hasSchema) {
        // Try to get skill details - first try by slug, then use schema data
        let skillName = skillId;
        try {
          const skill = await utils.skills.get.fetch({ id: skillId });
          skillName = skill.name;
        } catch {
          // If skills.get fails, try to extract name from schema or use skillId
          if (schemaData.schema && 'title' in schemaData.schema) {
            skillName = schemaData.schema.title;
          }
        }
        
        // Open form
        setSkillFormState({
          skillId,
          skillName,
          schema: schemaData.schema as SkillInputSchema,
          isOpen: true,
          isMinimized: false,
        });
        setIsFormOpen(true);
        resetForm();
      } else {
        // Execute immediately
        await execute({ skillId, dynamicParams: {} });
      }
    } catch (error) {
      console.error('[openSkillForm] Error:', error);
      toast.error('Failed to load skill form');
    } finally {
      setIsLoadingSchema(false);
    }
  }, [utils, execute, resetForm]);

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
    
    // Apply outputMapping if exists
    const mappedValues = skillFormState.schema.outputMapping
      ? Object.entries(skillFormState.schema.outputMapping).reduce(
          (acc, [fieldId, apiKey]) => {
            acc[apiKey] = values[fieldId];
            return acc;
          },
          {} as Record<string, any>
        )
      : values;
    
    // Get prompt from form values if not provided directly
    // Check common prompt field names; fallback to skill name (backend requires non-empty string)
    const promptValue = prompt
      || values.prompt
      || values.input
      || values.message
      || values.description
      || values.text
      || `Use ${skillFormState.skillName}`;

    try {
      const result = await execute({
        skillId: skillFormState.skillId,
        prompt: promptValue,
        dynamicParams: mappedValues,
      });
      
      if (result?.success) {
        // Send context message if needed
        if (onSendMessage) {
          onSendMessage(
            `[Using ${skillFormState.skillName}]`,
            { skillId: skillFormState.skillId, params: mappedValues }
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

    return (
      <Card className="mb-4 flex flex-col relative" style={{ maxHeight: '70vh' }}>
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
        <CardHeader className="flex flex-row items-center justify-between py-3 shrink-0">
          <CardTitle className="text-base flex items-center gap-2">
            {isSubmitting ? (
              <Loader2 className="h-4 w-4 animate-spin text-primary" />
            ) : (
              <Settings className="h-4 w-4" />
            )}
            {skillFormState.skillName}
            {isSubmitting && (
              <span className="text-xs font-normal text-muted-foreground ml-1">
                (กำลังทำงาน)
              </span>
            )}
          </CardTitle>
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
        </CardHeader>
        <CardContent className="flex-1 overflow-y-auto px-6" style={{ minHeight: 0, maxHeight: 'calc(70vh - 140px)' }}>
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
        </CardContent>
        <CardFooter className="flex justify-end gap-2 shrink-0 border-t pt-4">
          <Button variant="outline" onClick={closeSkillForm} disabled={isSubmitting}>
            Cancel
          </Button>
          <Button
            onClick={() => handleSkillFormSubmit(conversationId)}
            disabled={isSubmitting}
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
        </CardFooter>
      </Card>
    );
  }, [skillFormState, values, executionError, isSubmitting, minimizeSkillForm, closeSkillForm, handleSkillFormSubmit, conversationId, setValue]);

  // Render minimized chip
  const renderSkillChip = useCallback(() => {
    if (!skillFormState?.isMinimized) return null;

    return (
      <div className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-full text-sm mb-3 ${
        isSubmitting ? 'bg-primary/20 border border-primary/30' : 'bg-primary/10'
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
  const renderSkillSelector = useCallback(() => {
    return (
      <SkillSelector
        open={showSkillSelector}
        onClose={() => setShowSkillSelector(false)}
        onSelect={(skillId) => {
          setShowSkillSelector(false);
          openSkillForm(skillId);
        }}
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
