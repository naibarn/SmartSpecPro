/**
 * useSSEWorkflowStream - React hook for SSE-based workflow execution streaming.
 *
 * Manages EventSource connection, event parsing, execution store updates,
 * and automatic reconnection with Last-Event-ID support.
 */

import { useEffect, useRef, useCallback } from 'react';
import { useExecutionStore } from '@/stores/executionStore';

export interface SSEWorkflowStreamOptions {
  /** Execution ID to stream */
  executionId: string | null;
  /** Whether to auto-reconnect on disconnect */
  autoReconnect?: boolean;
  /** Max reconnection attempts (0 = unlimited) */
  maxReconnectAttempts?: number;
  /** Reconnect delay in ms */
  reconnectDelay?: number;
  /** Event handlers */
  onWorkflowComplete?: () => void;
  onWorkflowError?: (error: string) => void;
  onConnectionError?: (error: Event) => void;
}

export interface SSEWorkflowStreamState {
  /** Whether connected to SSE stream */
  isConnected: boolean;
  /** Last event ID received (for reconnection) */
  lastEventId: string | null;
  /** Reconnection attempt count */
  reconnectAttempts: number;
  /** Manual disconnect function */
  disconnect: () => void;
  /** Manual reconnect function */
  reconnect: () => void;
}

/**
 * Safe JSON parse that returns null on failure instead of throwing.
 */
function safeJsonParse(data: string): any | null {
  try {
    return JSON.parse(data);
  } catch {
    console.error('Failed to parse SSE event data:', data);
    return null;
  }
}

/**
 * Hook to manage SSE connection for workflow execution streaming.
 *
 * Automatically:
 * - Connects to SSE endpoint when executionId changes
 * - Parses events and updates executionStore
 * - Handles reconnection with Last-Event-ID via query param
 * - Cleans up on unmount
 *
 * @param options - Stream configuration
 * @returns Stream state and control functions
 */
export function useSSEWorkflowStream(
  options: SSEWorkflowStreamOptions
): SSEWorkflowStreamState {
  const {
    executionId,
    autoReconnect = true,
    maxReconnectAttempts = 5,
    reconnectDelay = 2000,
    onWorkflowComplete,
    onWorkflowError,
    onConnectionError,
  } = options;

  const eventSourceRef = useRef<EventSource | null>(null);
  const lastEventIdRef = useRef<string | null>(null);
  const reconnectAttemptsRef = useRef(0);
  const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  const {
    updateNodeStatus,
    addLog,
    completeExecution,
  } = useExecutionStore();

  const disconnect = useCallback(() => {
    if (eventSourceRef.current) {
      eventSourceRef.current.close();
      eventSourceRef.current = null;
    }
    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current);
      reconnectTimeoutRef.current = null;
    }
  }, []);

  const connect = useCallback(() => {
    if (!executionId) return;

    // Close existing connection
    disconnect();

    // Build URL with Last-Event-ID as query param (EventSource doesn't support custom headers)
    let url = `/api/v1/workflows/execute/${executionId}/stream`;
    if (lastEventIdRef.current) {
      url += `?lastEventId=${encodeURIComponent(lastEventIdRef.current)}`;
    }

    const eventSource = new EventSource(url, {
      withCredentials: true,
    });

    // Node start event
    eventSource.addEventListener('node_start', (event: MessageEvent) => {
      const data = safeJsonParse(event.data);
      if (!data) return;
      lastEventIdRef.current = data.event_id || event.lastEventId;

      updateNodeStatus(data.nodeId, {
        status: 'running',
        startTime: Date.now(),
      });

      addLog({
        id: data.event_id,
        timestamp: Date.now(),
        nodeId: data.nodeId,
        nodeName: data.nodeName || data.nodeId,
        eventType: 'node_start',
        status: 'running',
      });
    });

    // Node complete event
    eventSource.addEventListener('node_complete', (event: MessageEvent) => {
      const data = safeJsonParse(event.data);
      if (!data) return;
      lastEventIdRef.current = data.event_id || event.lastEventId;

      updateNodeStatus(data.nodeId, {
        status: 'success',
        endTime: Date.now(),
        output: data.output,
      });

      addLog({
        id: data.event_id,
        timestamp: Date.now(),
        nodeId: data.nodeId,
        nodeName: data.nodeName || data.nodeId,
        eventType: 'node_complete',
        status: 'success',
        duration: data.durationMs,
        output: data.output,
      });
    });

    // Node error event
    eventSource.addEventListener('node_error', (event: MessageEvent) => {
      const data = safeJsonParse(event.data);
      if (!data) return;
      lastEventIdRef.current = data.event_id || event.lastEventId;

      updateNodeStatus(data.nodeId, {
        status: 'failed',
        endTime: Date.now(),
        error: data.error,
      });

      addLog({
        id: data.event_id,
        timestamp: Date.now(),
        nodeId: data.nodeId,
        nodeName: data.nodeName || data.nodeId,
        eventType: 'node_error',
        status: 'failed',
        error: data.error,
      });
    });

    // Token streaming event (new - for real-time LLM output)
    eventSource.addEventListener('token', (event: MessageEvent) => {
      const data = safeJsonParse(event.data);
      if (!data) return;
      // Do NOT update lastEventIdRef for token events (too frequent, not needed for replay)

      // Forward to execution store for real-time display
      updateNodeStatus(data.nodeId, {
        status: 'running',
        // Append token to partial output
        output: {
          ...useExecutionStore.getState().nodeStatuses[data.nodeId]?.output,
          _streaming: true,
          _partialText: (useExecutionStore.getState().nodeStatuses[data.nodeId]?.output?._partialText || '') + data.token,
        },
      });
    });

    // Approval required event (new - for HITL)
    eventSource.addEventListener('approval_required', (event: MessageEvent) => {
      const data = safeJsonParse(event.data);
      if (!data) return;
      lastEventIdRef.current = data.event_id || event.lastEventId;

      updateNodeStatus(data.nodeId, {
        status: 'pending',
      });

      addLog({
        id: data.event_id,
        timestamp: Date.now(),
        nodeId: data.nodeId,
        nodeName: data.nodeId,
        eventType: 'node_start',
        status: 'pending',
      });
    });

    // Progress event (new - for long-running nodes)
    eventSource.addEventListener('progress', (event: MessageEvent) => {
      const data = safeJsonParse(event.data);
      if (!data) return;
      // Progress events are informational, update node status with progress info
      updateNodeStatus(data.nodeId, {
        status: 'running',
        output: {
          ...useExecutionStore.getState().nodeStatuses[data.nodeId]?.output,
          _progress: data.percent,
          _progressMessage: data.message,
        },
      });
    });

    // Workflow complete event
    eventSource.addEventListener('workflow_complete', (event: MessageEvent) => {
      const data = safeJsonParse(event.data);
      lastEventIdRef.current = data?.event_id || event.lastEventId;

      completeExecution();
      disconnect();
      reconnectAttemptsRef.current = 0; // Reset on success

      if (onWorkflowComplete) {
        onWorkflowComplete();
      }
    });

    // Workflow error event
    eventSource.addEventListener('workflow_error', (event: MessageEvent) => {
      const data = safeJsonParse(event.data);
      lastEventIdRef.current = data?.event_id || event.lastEventId;

      completeExecution();
      disconnect();
      reconnectAttemptsRef.current = 0; // Reset on error

      if (onWorkflowError) {
        onWorkflowError(data?.error || 'Unknown workflow error');
      }
    });

    // Error handler (connection errors)
    eventSource.onerror = (error: Event) => {
      console.error('SSE connection error:', error);
      disconnect();

      if (onConnectionError) {
        onConnectionError(error);
      }

      // Auto-reconnect logic
      if (
        autoReconnect &&
        (maxReconnectAttempts === 0 || reconnectAttemptsRef.current < maxReconnectAttempts)
      ) {
        reconnectAttemptsRef.current += 1;
        reconnectTimeoutRef.current = setTimeout(() => {
          console.log(`Reconnecting... (attempt ${reconnectAttemptsRef.current})`);
          connect();
        }, reconnectDelay);
      } else {
        completeExecution();
      }
    };

    eventSourceRef.current = eventSource;
  }, [
    executionId,
    autoReconnect,
    maxReconnectAttempts,
    reconnectDelay,
    updateNodeStatus,
    addLog,
    completeExecution,
    onWorkflowComplete,
    onWorkflowError,
    onConnectionError,
    disconnect,
  ]);

  // Connect when executionId changes
  useEffect(() => {
    if (executionId) {
      connect();
    }

    // Cleanup on unmount or executionId change
    return () => {
      disconnect();
    };
  }, [executionId, connect, disconnect]);

  return {
    isConnected: eventSourceRef.current !== null && eventSourceRef.current.readyState === EventSource.OPEN,
    lastEventId: lastEventIdRef.current,
    reconnectAttempts: reconnectAttemptsRef.current,
    disconnect,
    reconnect: connect,
  };
}
