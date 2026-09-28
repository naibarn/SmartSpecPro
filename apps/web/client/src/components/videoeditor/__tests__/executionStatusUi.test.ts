import { describe, expect, it } from 'vitest';
import { projectExecutionStatus } from '../ui/executionStatusUi';

describe('execution status projection', () => {
  it('distinguishes a missing capability from a waiting worker', () => {
    expect(projectExecutionStatus({ status: 'queued', statusReason: 'capability_blocked' }).state).toBe('capability-blocked');
    expect(projectExecutionStatus({ status: 'queued', statusReason: 'waiting_for_worker' }).state).toBe('waiting-agent');
    expect(projectExecutionStatus({ status: 'waiting_external' }).state).toBe('waiting-agent');
  });

  it('does not call an output complete without a verified output reference', () => {
    const result = projectExecutionStatus({ status: 'completed', outputRefs: [] });
    expect(result.state).toBe('degraded');
    expect(result.outputReady).toBe(false);
  });

  it('keeps an artifact gated while verification is pending or failed', () => {
    expect(projectExecutionStatus({ status: 'completed', outputRefs: [{ verificationState: 'pending' }] }).outputReady).toBe(false);
    expect(projectExecutionStatus({ status: 'completed', outputRefs: [{ verificationState: 'verified' }] }).outputReady).toBe(true);
    expect(projectExecutionStatus({ status: 'completed', statusReason: 'qc_blocked', outputRefs: [{ verificationState: 'verified' }] }).outputReady).toBe(false);
    expect(projectExecutionStatus({ status: 'completed', statusReason: 'revision_pinned', outputRefs: [{ verificationState: 'verified' }] }).outputReady).toBe(true);
    expect(projectExecutionStatus({ status: 'completed', statusReason: 'revision_mismatch', outputRefs: [{ verificationState: 'verified' }] }).outputReady).toBe(false);
  });

  it('keeps render, retry, and QC lifecycle statuses distinct', () => {
    expect(projectExecutionStatus({ status: 'rendering' }).state).toBe('running');
    expect(projectExecutionStatus({ status: 'retrying' }).state).toBe('retrying');
    expect(projectExecutionStatus({ status: 'qc_pending' }).state).toBe('qc');
  });

  it('keeps runtime and revision metadata inspectable', () => {
    const result = projectExecutionStatus({
      status: 'running',
      statusReason: 'claimed_by_worker',
      runtimeType: 'node_job_worker',
      worker: { displayName: 'Render Node', machineName: 'node-1' },
      pinnedRevisionId: 'revision-42',
    });

    expect(result.state).toBe('running');
    expect(result.context).toContain('node_job_worker');
    expect(result.context).toContain('revision-42');
  });

  it('maps unknown future states to a safe review state', () => {
    const result = projectExecutionStatus({ status: 'future_status' });
    expect(result.state).toBe('degraded');
    expect(result.label).toContain('ตรวจสอบ');
  });
});
