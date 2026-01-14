// ========================================
// Workflow Service for Chat-to-Workflow Bridge
// ========================================
//
// This service provides the frontend interface for:
// - Detecting workflow intents from user messages
// - Executing SmartSpec workflows
// - Handling workflow events (progress, approval requests, etc.)

import { invoke } from '@tauri-apps/api/core';
import { listen, UnlistenFn } from '@tauri-apps/api/event';

// ========================================
// Types
// ========================================

export interface WorkflowRequest {
  workflow: string;
  args: Record<string, string>;
  prompt?: string;
  platform: string;
}

export interface DetectedIntent {
  detected: boolean;
  workflow: string | null;
  params: Record<string, string>;
  confidence: number;
}

export type WorkflowEventType = 
  | 'Started'
  | 'Log'
  | 'Progress'
  | 'Output'
  | 'ApprovalRequest'
  | 'Completed'
  | 'Failed';

export interface WorkflowEventStarted {
  type: 'Started';
  workflow_id: string;
  workflow_name: string;
}

export interface WorkflowEventLog {
  type: 'Log';
  workflow_id: string;
  level: string;
  message: string;
}

export interface WorkflowEventProgress {
  type: 'Progress';
  workflow_id: string;
  step: string;
  progress: number;
  message: string;
}

export interface WorkflowEventOutput {
  type: 'Output';
  workflow_id: string;
  content: string;
}

export interface WorkflowEventApprovalRequest {
  type: 'ApprovalRequest';
  workflow_id: string;
  artifact_type: string;
  artifact_path: string;
  preview: string;
  next_command: string;
}

export interface WorkflowEventCompleted {
  type: 'Completed';
  workflow_id: string;
  result: unknown;
}

export interface WorkflowEventFailed {
  type: 'Failed';
  workflow_id: string;
  error: string;
}

export type WorkflowEvent = 
  | WorkflowEventStarted
  | WorkflowEventLog
  | WorkflowEventProgress
  | WorkflowEventOutput
  | WorkflowEventApprovalRequest
  | WorkflowEventCompleted
  | WorkflowEventFailed;

export interface WorkflowState {
  workflowId: string | null;
  workflowName: string | null;
  status: 'idle' | 'running' | 'waiting_approval' | 'completed' | 'failed';
  progress: number;
  currentStep: string;
  logs: Array<{ level: string; message: string; timestamp: Date }>;
  pendingApproval: WorkflowEventApprovalRequest | null;
  error: string | null;
}

// ========================================
// Workflow Service Class
// ========================================

class WorkflowService {
  private listeners: Map<string, UnlistenFn> = new Map();
  private eventHandlers: Array<(event: WorkflowEvent) => void> = [];
  private state: WorkflowState = this.getInitialState();

  private getInitialState(): WorkflowState {
    return {
      workflowId: null,
      workflowName: null,
      status: 'idle',
      progress: 0,
      currentStep: '',
      logs: [],
      pendingApproval: null,
      error: null,
    };
  }

  // ========================================
  // Intent Detection
  // ========================================

  /**
   * Detect if a user message contains a workflow intent
   */
  async detectIntent(message: string): Promise<DetectedIntent> {
    try {
      return await invoke<DetectedIntent>('workflow_detect_intent', { message });
    } catch (error) {
      console.error('Failed to detect intent:', error);
      return {
        detected: false,
        workflow: null,
        params: {},
        confidence: 0,
      };
    }
  }

  /**
   * Check if message should trigger a workflow instead of LLM chat
   */
  async shouldTriggerWorkflow(message: string): Promise<boolean> {
    const intent = await this.detectIntent(message);
    return intent.detected && intent.confidence >= 0.7;
  }

  // ========================================
  // Workflow Execution
  // ========================================

  /**
   * Execute a workflow from a detected intent
   */
  async executeFromIntent(message: string): Promise<string | null> {
    const intent = await this.detectIntent(message);
    
    if (!intent.detected || !intent.workflow) {
      return null;
    }

    const request: WorkflowRequest = {
      workflow: intent.workflow,
      args: intent.params,
      prompt: message,
      platform: 'kilo',
    };

    return this.execute(request);
  }

  /**
   * Execute a workflow with the given request
   */
  async execute(request: WorkflowRequest): Promise<string> {
    // Reset state
    this.state = this.getInitialState();
    this.state.status = 'running';

    // Start listening for events
    await this.startListening();

    try {
      const workflowId = await invoke<string>('workflow_execute', { request });
      this.state.workflowId = workflowId;
      return workflowId;
    } catch (error) {
      this.state.status = 'failed';
      this.state.error = String(error);
      throw error;
    }
  }

  /**
   * Stop a running workflow
   */
  async stop(workflowId?: string): Promise<void> {
    const id = workflowId || this.state.workflowId;
    if (!id) {
      throw new Error('No workflow to stop');
    }

    await invoke('workflow_stop', { workflowId: id });
    this.state.status = 'idle';
  }

  /**
   * Get list of running workflows
   */
  async listRunning(): Promise<string[]> {
    return invoke<string[]>('workflow_list_running');
  }

  // ========================================
  // Approval Handling
  // ========================================

  /**
   * Approve a pending artifact and continue workflow
   */
  async approve(): Promise<string | null> {
    if (!this.state.pendingApproval) {
      throw new Error('No pending approval');
    }

    const { workflow_id, next_command } = this.state.pendingApproval;
    this.state.pendingApproval = null;
    this.state.status = 'running';

    try {
      const newWorkflowId = await invoke<string>('workflow_approve', {
        workflowId: workflow_id,
        nextCommand: next_command,
      });
      this.state.workflowId = newWorkflowId;
      return newWorkflowId;
    } catch (error) {
      this.state.status = 'failed';
      this.state.error = String(error);
      throw error;
    }
  }

  /**
   * Reject a pending artifact
   */
  async reject(reason?: string): Promise<void> {
    if (!this.state.pendingApproval) {
      throw new Error('No pending approval');
    }

    const { workflow_id } = this.state.pendingApproval;
    this.state.pendingApproval = null;
    this.state.status = 'idle';

    await invoke('workflow_reject', {
      workflowId: workflow_id,
      reason,
    });
  }

  // ========================================
  // Event Handling
  // ========================================

  /**
   * Subscribe to workflow events
   */
  onEvent(handler: (event: WorkflowEvent) => void): () => void {
    this.eventHandlers.push(handler);
    return () => {
      const index = this.eventHandlers.indexOf(handler);
      if (index > -1) {
        this.eventHandlers.splice(index, 1);
      }
    };
  }

  /**
   * Get current workflow state
   */
  getState(): WorkflowState {
    return { ...this.state };
  }

  private async startListening(): Promise<void> {
    if (this.listeners.has('workflow-event')) {
      return;
    }

    const unlisten = await listen<WorkflowEvent>('workflow-event', (event) => {
      this.handleEvent(event.payload);
    });

    this.listeners.set('workflow-event', unlisten);
  }

  private handleEvent(event: WorkflowEvent): void {
    // Update internal state
    switch (event.type) {
      case 'Started':
        this.state.workflowId = event.workflow_id;
        this.state.workflowName = event.workflow_name;
        this.state.status = 'running';
        break;

      case 'Log':
        this.state.logs.push({
          level: event.level,
          message: event.message,
          timestamp: new Date(),
        });
        break;

      case 'Progress':
        this.state.progress = event.progress;
        this.state.currentStep = event.step;
        break;

      case 'ApprovalRequest':
        this.state.status = 'waiting_approval';
        this.state.pendingApproval = event;
        break;

      case 'Completed':
        this.state.status = 'completed';
        break;

      case 'Failed':
        this.state.status = 'failed';
        this.state.error = event.error;
        break;
    }

    // Notify all handlers
    for (const handler of this.eventHandlers) {
      try {
        handler(event);
      } catch (error) {
        console.error('Error in workflow event handler:', error);
      }
    }
  }

  /**
   * Clean up listeners
   */
  cleanup(): void {
    for (const unlisten of this.listeners.values()) {
      unlisten();
    }
    this.listeners.clear();
    this.eventHandlers = [];
  }
}

// ========================================
// Singleton Instance
// ========================================

export const workflowService = new WorkflowService();

// ========================================
// React Hook
// ========================================

import { useState, useEffect, useCallback } from 'react';

export function useWorkflow() {
  const [state, setState] = useState<WorkflowState>(workflowService.getState());

  useEffect(() => {
    const unsubscribe = workflowService.onEvent(() => {
      setState(workflowService.getState());
    });

    return () => {
      unsubscribe();
    };
  }, []);

  const executeFromMessage = useCallback(async (message: string) => {
    const shouldTrigger = await workflowService.shouldTriggerWorkflow(message);
    if (shouldTrigger) {
      await workflowService.executeFromIntent(message);
      return true;
    }
    return false;
  }, []);

  const approve = useCallback(async () => {
    await workflowService.approve();
  }, []);

  const reject = useCallback(async (reason?: string) => {
    await workflowService.reject(reason);
  }, []);

  const stop = useCallback(async () => {
    await workflowService.stop();
  }, []);

  return {
    state,
    executeFromMessage,
    approve,
    reject,
    stop,
    isRunning: state.status === 'running',
    isWaitingApproval: state.status === 'waiting_approval',
    pendingApproval: state.pendingApproval,
  };
}
