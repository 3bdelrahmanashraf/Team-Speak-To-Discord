/**
 * Custom Error Classes for TeamSpeak to Discord Bridge
 * Provides structured error handling with context
 */

export class BridgeError extends Error {
  public readonly code: string;
  public readonly statusCode: number;
  public readonly context: Record<string, unknown>;
  public readonly timestamp: Date;
  public readonly isOperational: boolean;

  constructor(
    message: string,
    code: string,
    statusCode: number = 500,
    context: Record<string, unknown> = {},
    isOperational: boolean = true
  ) {
    super(message);
    this.name = this.constructor.name;
    this.code = code;
    this.statusCode = statusCode;
    this.context = context;
    this.timestamp = new Date();
    this.isOperational = isOperational;

    Error.captureStackTrace(this, this.constructor);
  }

  toJSON(): Record<string, unknown> {
    return {
      name: this.name,
      message: this.message,
      code: this.code,
      statusCode: this.statusCode,
      context: this.context,
      timestamp: this.timestamp.toISOString(),
      stack: this.stack,
    };
  }
}

// Configuration Errors
export class ConfigurationError extends BridgeError {
  constructor(message: string, context: Record<string, unknown> = {}) {
    super(message, 'CONFIGURATION_ERROR', 500, context);
  }
}

export class ValidationError extends BridgeError {
  public readonly errors: Array<{ field: string; message: string }>;

  constructor(message: string, errors: Array<{ field: string; message: string }>, context: Record<string, unknown> = {}) {
    super(message, 'VALIDATION_ERROR', 400, { ...context, validationErrors: errors });
    this.errors = errors;
  }
}

// Connection Errors
export class ConnectionError extends BridgeError {
  public readonly host: string;
  public readonly port: number;
  public readonly retryable: boolean;

  constructor(
    message: string,
    host: string,
    port: number,
    retryable: boolean = true,
    context: Record<string, unknown> = {}
  ) {
    super(message, 'CONNECTION_ERROR', 503, { ...context, host, port, retryable });
    this.host = host;
    this.port = port;
    this.retryable = retryable;
  }
}

export class ReconnectionError extends BridgeError {
  public readonly attempts: number;
  public readonly maxAttempts: number;

  constructor(message: string, attempts: number, maxAttempts: number, context: Record<string, unknown> = {}) {
    super(message, 'RECONNECTION_ERROR', 503, { ...context, attempts, maxAttempts });
    this.attempts = attempts;
    this.maxAttempts = maxAttempts;
  }
}

export class TimeoutError extends BridgeError {
  public readonly operation: string;
  public readonly timeoutMs: number;

  constructor(message: string, operation: string, timeoutMs: number, context: Record<string, unknown> = {}) {
    super(message, 'TIMEOUT_ERROR', 504, { ...context, operation, timeoutMs });
    this.operation = operation;
    this.timeoutMs = timeoutMs;
  }
}

// Authentication Errors
export class AuthenticationError extends BridgeError {
  constructor(message: string, context: Record<string, unknown> = {}) {
    super(message, 'AUTHENTICATION_ERROR', 401, context);
  }
}

export class AuthorizationError extends BridgeError {
  public readonly requiredPermission: string;

  constructor(message: string, requiredPermission: string, context: Record<string, unknown> = {}) {
    super(message, 'AUTHORIZATION_ERROR', 403, { ...context, requiredPermission });
    this.requiredPermission = requiredPermission;
  }
}

export class TokenError extends BridgeError {
  public readonly tokenType: string;

  constructor(message: string, tokenType: string, context: Record<string, unknown> = {}) {
    super(message, 'TOKEN_ERROR', 401, { ...context, tokenType });
    this.tokenType = tokenType;
  }
}

// TeamSpeak Errors
export class TeamSpeakError extends BridgeError {
  public readonly tsErrorId: number;
  public readonly tsErrorMsg: string;

  constructor(message: string, errorId: number, errorMsg: string, context: Record<string, unknown> = {}) {
    super(message, 'TEAMSPEAK_ERROR', 502, { ...context, tsErrorId: errorId, tsErrorMsg: errorMsg });
    this.tsErrorId = errorId;
    this.tsErrorMsg = errorMsg;
  }
}

export class TeamSpeakQueryError extends TeamSpeakError {
  public readonly command: string;
  public readonly params: Record<string, unknown>;

  constructor(
    message: string,
    errorId: number,
    errorMsg: string,
    command: string,
    params: Record<string, unknown>,
    context: Record<string, unknown> = {}
  ) {
    super(message, errorId, errorMsg, { ...context, command, params });
    this.command = command;
    this.params = params;
  }
}

// Discord Errors
export class DiscordError extends BridgeError {
  public readonly discordCode: number;
  public readonly discordMessage: string;

  constructor(message: string, code: number, discordMessage: string, context: Record<string, unknown> = {}) {
    super(message, 'DISCORD_ERROR', 502, { ...context, discordCode: code, discordMessage });
    this.discordCode = code;
    this.discordMessage = discordMessage;
  }
}

export class DiscordRateLimitError extends DiscordError {
  public readonly retryAfter: number;
  public readonly global: boolean;

  constructor(message: string, retryAfter: number, global: boolean, context: Record<string, unknown> = {}) {
    super(message, 429, 'Rate Limited', { ...context, retryAfter, global });
    this.retryAfter = retryAfter;
    this.global = global;
  }
}

// Audio Errors
export class AudioError extends BridgeError {
  public readonly codec: string;

  constructor(message: string, codec: string, context: Record<string, unknown> = {}) {
    super(message, 'AUDIO_ERROR', 500, { ...context, codec });
    this.codec = codec;
  }
}

export class AudioEncodingError extends AudioError {
  public readonly inputFormat: string;
  public readonly outputFormat: string;

  constructor(message: string, inputFormat: string, outputFormat: string, context: Record<string, unknown> = {}) {
    super(message, 'opus', { ...context, inputFormat, outputFormat });
    this.inputFormat = inputFormat;
    this.outputFormat = outputFormat;
  }
}

export class AudioDecodingError extends AudioError {
  public readonly packetSize: number;

  constructor(message: string, packetSize: number, context: Record<string, unknown> = {}) {
    super(message, 'opus', { ...context, packetSize });
    this.packetSize = packetSize;
  }
}

// Database Errors
export class DatabaseError extends BridgeError {
  public readonly query: string;
  public readonly params: unknown[];

  constructor(message: string, query: string, params: unknown[] = [], context: Record<string, unknown> = {}) {
    super(message, 'DATABASE_ERROR', 500, { ...context, query, params });
    this.query = query;
    this.params = params;
  }
}

export class MigrationError extends DatabaseError {
  public readonly migrationName: string;

  constructor(message: string, migrationName: string, context: Record<string, unknown> = {}) {
    super(message, '', [], { ...context, migrationName });
    this.migrationName = migrationName;
  }
}

// Redis Errors
export class RedisError extends BridgeError {
  public readonly command: string;

  constructor(message: string, command: string, context: Record<string, unknown> = {}) {
    super(message, 'REDIS_ERROR', 503, { ...context, command });
    this.command = command;
  }
}

// Web Dashboard Errors
export class WebDashboardError extends BridgeError {
  public readonly endpoint: string;
  public readonly method: string;

  constructor(message: string, method: string, endpoint: string, context: Record<string, unknown> = {}) {
    super(message, 'WEB_DASHBOARD_ERROR', 500, { ...context, method, endpoint });
    this.endpoint = endpoint;
    this.method = method;
  }
}

// Error Factory Functions
export function createErrorFromUnknown(error: unknown, defaultMessage: string = 'Unknown error'): BridgeError {
  if (error instanceof BridgeError) {
    return error;
  }

  if (error instanceof Error) {
    return new BridgeError(error.message, 'UNKNOWN_ERROR', 500, { originalError: error.name });
  }

  return new BridgeError(defaultMessage, 'UNKNOWN_ERROR', 500, { originalValue: String(error) });
}

export function isOperationalError(error: unknown): boolean {
  if (error instanceof BridgeError) {
    return error.isOperational;
  }
  return false;
}

export function getErrorCode(error: unknown): string {
  if (error instanceof BridgeError) {
    return error.code;
  }
  return 'UNKNOWN_ERROR';
}

export function getErrorStatusCode(error: unknown): number {
  if (error instanceof BridgeError) {
    return error.statusCode;
  }
  return 500;
}

// Error Handler for Express/Fastify
export function errorHandler(error: unknown): { code: string; message: string; statusCode: number; context: Record<string, unknown> } {
  const bridgeError = createErrorFromUnknown(error);
  return {
    code: bridgeError.code,
    message: bridgeError.message,
    statusCode: bridgeError.statusCode,
    context: bridgeError.context,
  };
}