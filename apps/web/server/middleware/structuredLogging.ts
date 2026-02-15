/**
 * Structured Logging Middleware
 *
 * Outputs JSON-formatted logs compatible with Google Cloud Logging.
 * Each log entry includes severity, message, release, and environment.
 */

interface LogContext {
  request_id?: string;
  user_id?: string;
  job_id?: string;
  route?: string;
  method?: string;
  status?: number;
  latency_ms?: number;
  [key: string]: unknown;
}

interface StructuredLog {
  severity: 'DEBUG' | 'INFO' | 'WARNING' | 'ERROR' | 'CRITICAL';
  message: string;
  release: string;
  environment: string;
  timestamp: string;
  [key: string]: unknown;
}

export function createStructuredLogger() {
  const release = process.env.RELEASE || process.env.COMMIT_SHA || 'dev';
  const environment = process.env.ENVIRONMENT || 'development';

  function log(severity: StructuredLog['severity'], message: string, context?: LogContext) {
    const logEntry: StructuredLog = {
      severity,
      message,
      release,
      environment,
      timestamp: new Date().toISOString(),
      ...context,
    };

    console.log(JSON.stringify(logEntry));
  }

  return {
    debug: (msg: string, ctx?: LogContext) => log('DEBUG', msg, ctx),
    info: (msg: string, ctx?: LogContext) => log('INFO', msg, ctx),
    warn: (msg: string, ctx?: LogContext) => log('WARNING', msg, ctx),
    error: (msg: string, ctx?: LogContext) => log('ERROR', msg, ctx),
    critical: (msg: string, ctx?: LogContext) => log('CRITICAL', msg, ctx),
    httpRequest: (ctx: LogContext & { route: string; method: string; status: number; latency_ms: number }) => {
      log('INFO', `${ctx.method} ${ctx.route} ${ctx.status}`, ctx);
    },
  };
}

export const logger = createStructuredLogger();
