import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createStructuredLogger } from '../structuredLogging';

describe('Structured Logging Middleware', () => {
  let originalLog: typeof console.log;
  let logOutput: string[];

  beforeEach(() => {
    logOutput = [];
    originalLog = console.log;
    console.log = vi.fn((msg: string) => logOutput.push(msg));
  });

  afterEach(() => {
    console.log = originalLog;
  });

  it('outputs valid JSON with required fields', () => {
    const logger = createStructuredLogger();
    logger.info('Test message', { request_id: 'test-123', user_id: 'user-456' });

    expect(logOutput).toHaveLength(1);
    const parsed = JSON.parse(logOutput[0]);
    expect(parsed).toMatchObject({
      severity: 'INFO',
      message: 'Test message',
      request_id: 'test-123',
      user_id: 'user-456',
      release: expect.any(String),
      environment: expect.any(String),
    });
  });

  it('includes HTTP request metadata', () => {
    const logger = createStructuredLogger();
    logger.httpRequest({
      route: '/api/jobs',
      method: 'POST',
      status: 201,
      latency_ms: 125,
      request_id: 'req-789',
    });

    const parsed = JSON.parse(logOutput[0]);
    expect(parsed).toMatchObject({
      severity: 'INFO',
      route: '/api/jobs',
      method: 'POST',
      status: 201,
      latency_ms: 125,
      request_id: 'req-789',
    });
  });

  it('includes timestamp in ISO format', () => {
    const logger = createStructuredLogger();
    logger.info('Timestamp test');

    const parsed = JSON.parse(logOutput[0]);
    expect(parsed.timestamp).toBeDefined();
    expect(new Date(parsed.timestamp).toISOString()).toBe(parsed.timestamp);
  });

  it('supports all severity levels', () => {
    const logger = createStructuredLogger();
    logger.debug('Debug msg');
    logger.info('Info msg');
    logger.warn('Warn msg');
    logger.error('Error msg');
    logger.critical('Critical msg');

    expect(logOutput).toHaveLength(5);
    expect(JSON.parse(logOutput[0]).severity).toBe('DEBUG');
    expect(JSON.parse(logOutput[1]).severity).toBe('INFO');
    expect(JSON.parse(logOutput[2]).severity).toBe('WARNING');
    expect(JSON.parse(logOutput[3]).severity).toBe('ERROR');
    expect(JSON.parse(logOutput[4]).severity).toBe('CRITICAL');
  });
});
