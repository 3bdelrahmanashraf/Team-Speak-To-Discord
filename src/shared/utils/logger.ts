/**
 * Logging Utility for TeamSpeak to Discord Bridge
 * Uses Pino for structured logging
 */

import pino, { Logger, LogLevel } from 'pino';
import { configManager } from '../config/index.js';

let loggerInstance: Logger | null = null;

export function createLogger(name?: string): Logger {
  if (loggerInstance) {
    return name ? loggerInstance.child({ module: name }) : loggerInstance;
  }

  const config = configManager.get();
  const logLevel: LogLevel = config.bridge.logLevel;

  const transport = pino.transport({
    target: 'pino-pretty',
    options: {
      colorize: true,
      translateTime: 'HH:MM:ss Z',
      ignore: 'pid,hostname',
      singleLine: false,
      messageFormat: '{module} - {msg}',
    },
  });

  loggerInstance = pino(
    {
      level: logLevel,
      base: {
        service: 'teamspeak-discord-bridge',
        version: process.env.npm_package_version || '0.1.0',
        environment: config.environment,
      },
      formatters: {
        level: (label) => ({ level: label }),
      },
      timestamp: pino.stdTimeFunctions.isoTime,
    },
    transport
  );

  return name ? loggerInstance.child({ module: name }) : loggerInstance;
}

export function getLogger(name?: string): Logger {
  if (!loggerInstance) {
    return createLogger(name);
  }
  return name ? loggerInstance.child({ module: name }) : loggerInstance;
}

export function setLogLevel(level: LogLevel): void {
  if (loggerInstance) {
    loggerInstance.level = level;
  }
}

// Structured logging helpers
export const log = {
  trace: (logger: Logger, msg: string, meta?: Record<string, unknown>) => logger.trace(meta, msg),
  debug: (logger: Logger, msg: string, meta?: Record<string, unknown>) => logger.debug(meta, msg),
  info: (logger: Logger, msg: string, meta?: Record<string, unknown>) => logger.info(meta, msg),
  warn: (logger: Logger, msg: string, meta?: Record<string, unknown>) => logger.warn(meta, msg),
  error: (logger: Logger, msg: string, meta?: Record<string, unknown>) => logger.error(meta, msg),
  fatal: (logger: Logger, msg: string, meta?: Record<string, unknown>) => logger.fatal(meta, msg),

  // Event logging
  event: (logger: Logger, event: string, meta?: Record<string, unknown>) =>
    logger.info({ event, ...meta }, `Event: ${event}`),

  // Performance logging
  perf: (logger: Logger, operation: string, durationMs: number, meta?: Record<string, unknown>) =>
    logger.debug({ perf: { operation, durationMs }, ...meta }, `Performance: ${operation} took ${durationMs}ms`),

  // Error with context
  errorWithContext: (logger: Logger, error: Error, context: Record<string, unknown>) =>
    logger.error({ err: error, ...context }, error.message),

  // Audit logging
  audit: (logger: Logger, action: string, userId: string, details: Record<string, unknown>) =>
    logger.info({ audit: { action, userId, ...details } }, `Audit: ${action} by ${userId}`),
};

export type { Logger, LogLevel } from 'pino';