/**
 * Configuration Management for TeamSpeak to Discord Bridge
 * Loads, validates, and provides access to configuration
 */

import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { ConfigSchema, type Config, type DiscordConfig, type TeamSpeakConfig, type AudioConfig, type ChatConfig, type UserConfig, type BridgeConfig, type DatabaseConfig, type RedisConfig, type WebDashboardConfig } from '../../config/schema.js';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = resolve(__filename, '..');

interface ConfigOptions {
  configPath?: string;
  envPath?: string;
  validate?: boolean;
}

class ConfigManager {
  private static instance: ConfigManager;
  private config: Config | null = null;
  private initialized = false;

  private constructor() {}

  static getInstance(): ConfigManager {
    if (!ConfigManager.instance) {
      ConfigManager.instance = new ConfigManager();
    }
    return ConfigManager.instance;
  }

  /**
   * Load configuration from file and environment variables
   */
  load(options: ConfigOptions = {}): Config {
    if (this.initialized && this.config) {
      return this.config;
    }

    const {
      configPath = resolve(__dirname, '../../config/default.json'),
      envPath = resolve(__dirname, '../../.env'),
      validate = true,
    } = options;

    // Load default config
    let configObject: Record<string, unknown> = {};
    if (existsSync(configPath)) {
      try {
        const fileContent = readFileSync(configPath, 'utf-8');
        configObject = JSON.parse(fileContent);
      } catch (error) {
        throw new Error(`Failed to parse config file ${configPath}: ${error}`);
      }
    }

    // Load environment variables
    if (existsSync(envPath)) {
      this.loadEnvFile(envPath);
    }

    // Merge environment variables (they take precedence)
    const envConfig = this.parseEnvConfig();
    configObject = this.deepMerge(configObject, envConfig);

    // Validate if requested
    if (validate) {
      const result = ConfigSchema.safeParse(configObject);
      if (!result.success) {
        const errors = result.error.errors.map(e => `${e.path.join('.')}: ${e.message}`).join('\n');
        throw new Error(`Configuration validation failed:\n${errors}`);
      }
      this.config = result.data;
    } else {
      this.config = configObject as Config;
    }

    this.initialized = true;
    return this.config;
  }

  /**
   * Get the loaded configuration
   */
  get(): Config {
    if (!this.config) {
      return this.load();
    }
    return this.config;
  }

  /**
   * Get Discord configuration
   */
  getDiscord(): DiscordConfig {
    return this.get().discord;
  }

  /**
   * Get TeamSpeak configuration
   */
  getTeamSpeak(): TeamSpeakConfig {
    return this.get().teamspeak;
  }

  /**
   * Get Audio configuration
   */
  getAudio(): AudioConfig {
    return this.get().audio;
  }

  /**
   * Get Chat configuration
   */
  getChat(): ChatConfig {
    return this.get().chat;
  }

  /**
   * Get User configuration
   */
  getUser(): UserConfig {
    return this.get().user;
  }

  /**
   * Get Bridge configuration
   */
  getBridge(): BridgeConfig {
    return this.get().bridge;
  }

  /**
   * Get Database configuration
   */
  getDatabase(): DatabaseConfig {
    return this.get().database;
  }

  /**
   * Get Redis configuration
   */
  getRedis(): RedisConfig {
    return this.get().redis;
  }

  /**
   * Get Web Dashboard configuration
   */
  getWebDashboard(): WebDashboardConfig {
    return this.get().webDashboard;
  }

  /**
   * Get environment
   */
  getEnvironment(): Config['environment'] {
    return this.get().environment;
  }

  /**
   * Check if running in production
   */
  isProduction(): boolean {
    return this.getEnvironment() === 'production';
  }

  /**
   * Check if running in development
   */
  isDevelopment(): boolean {
    return this.getEnvironment() === 'development';
  }

  /**
   * Reload configuration
   */
  reload(options: ConfigOptions = {}): Config {
    this.initialized = false;
    this.config = null;
    return this.load(options);
  }

  /**
   * Load .env file into process.env
   */
  private loadEnvFile(path: string): void {
    const content = readFileSync(path, 'utf-8');
    const lines = content.split('\n');

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;

      const [key, ...valueParts] = trimmed.split('=');
      if (key && valueParts.length > 0) {
        const value = valueParts.join('=').trim();
        // Remove surrounding quotes if present
        const cleanValue = value.replace(/^["']|["']$/g, '');
        if (!process.env[key.trim()]) {
          process.env[key.trim()] = cleanValue;
        }
      }
    }
  }

  /**
   * Parse environment variables into config object
   */
  private parseEnvConfig(): Record<string, unknown> {
    const envPrefix = 'DISCORD_';
    const tsPrefix = 'TS_';
    const audioPrefix = 'AUDIO_';
    const chatPrefix = 'CHAT_';
    const userPrefix = 'USER_';
    const bridgePrefix = 'BRIDGE_';
    const dbPrefix = 'DATABASE_';
    const redisPrefix = 'REDIS_';
    const webPrefix = 'WEB_DASHBOARD_';

    const config: Record<string, unknown> = {
      discord: {},
      teamspeak: {},
      audio: {},
      chat: {},
      user: {},
      bridge: {},
      database: {},
      redis: {},
      webDashboard: {},
    };

    for (const [key, value] of Object.entries(process.env)) {
      if (key.startsWith(envPrefix)) {
        const subKey = key.slice(envPrefix.length).toLowerCase();
        this.setNested(config.discord, subKey, this.parseValue(value));
      } else if (key.startsWith(tsPrefix)) {
        const subKey = key.slice(tsPrefix.length).toLowerCase();
        this.setNested(config.teamspeak, subKey, this.parseValue(value));
      } else if (key.startsWith(audioPrefix)) {
        const subKey = key.slice(audioPrefix.length).toLowerCase();
        this.setNested(config.audio, subKey, this.parseValue(value));
      } else if (key.startsWith(chatPrefix)) {
        const subKey = key.slice(chatPrefix.length).toLowerCase();
        this.setNested(config.chat, subKey, this.parseValue(value));
      } else if (key.startsWith(userPrefix)) {
        const subKey = key.slice(userPrefix.length).toLowerCase();
        this.setNested(config.user, subKey, this.parseValue(value));
      } else if (key.startsWith(bridgePrefix)) {
        const subKey = key.slice(bridgePrefix.length).toLowerCase();
        this.setNested(config.bridge, subKey, this.parseValue(value));
      } else if (key.startsWith(dbPrefix)) {
        const subKey = key.slice(dbPrefix.length).toLowerCase();
        this.setNested(config.database, subKey, this.parseValue(value));
      } else if (key.startsWith(redisPrefix)) {
        const subKey = key.slice(redisPrefix.length).toLowerCase();
        this.setNested(config.redis, subKey, this.parseValue(value));
      } else if (key.startsWith(webPrefix)) {
        const subKey = key.slice(webPrefix.length).toLowerCase();
        this.setNested(config.webDashboard, subKey, this.parseValue(value));
      } else if (key === 'NODE_ENV') {
        config.environment = value;
      }
    }

    return config;
  }

  /**
   * Parse string value to appropriate type
   */
  private parseValue(value: string): unknown {
    // Try to parse as JSON first
    try {
      return JSON.parse(value);
    } catch {
      // Return as string
      return value;
    }
  }

  /**
   * Set nested property using dot notation
   */
  private setNested(obj: Record<string, unknown>, path: string, value: unknown): void {
    const keys = path.split('_');
    let current = obj;

    for (let i = 0; i < keys.length - 1; i++) {
      const key = keys[i];
      if (!(key in current) || typeof current[key] !== 'object' || current[key] === null) {
        current[key] = {};
      }
      current = current[key] as Record<string, unknown>;
    }

    current[keys[keys.length - 1]] = value;
  }

  /**
   * Deep merge two objects
   */
  private deepMerge(target: Record<string, unknown>, source: Record<string, unknown>): Record<string, unknown> {
    const result = { ...target };

    for (const key of Object.keys(source)) {
      if (source[key] instanceof Object && key in target && target[key] instanceof Object) {
        result[key] = this.deepMerge(
          target[key] as Record<string, unknown>,
          source[key] as Record<string, unknown>
        );
      } else {
        result[key] = source[key];
      }
    }

    return result;
  }
}

// Export singleton instance
export const configManager = ConfigManager.getInstance();

// Convenience function
export function loadConfig(options?: ConfigOptions): Config {
  return configManager.load(options);
}

export function getConfig(): Config {
  return configManager.get();
}