import { z } from 'zod';

/**
 * Configuration schema for TeamSpeak to Discord Bridge
 * Validated at startup using Zod
 */

export const DiscordConfigSchema = z.object({
  token: z.string().min(1, 'Discord bot token is required'),
  clientId: z.string().min(1, 'Discord client ID is required'),
  guildId: z.string().min(1, 'Discord guild ID is required'),
  intents: z.array(z.string()).default([
    'Guilds',
    'GuildMembers',
    'GuildVoiceStates',
    'GuildMessages',
    'MessageContent',
    'GuildMessageReactions',
    'DirectMessages',
    'DirectMessageReactions',
  ]),
});

export const TeamSpeakConfigSchema = z.object({
  host: z.string().min(1, 'TeamSpeak host is required'),
  queryPort: z.number().int().positive().default(10011),
  sshPort: z.number().int().positive().optional(),
  username: z.string().min(1, 'TeamSpeak username is required'),
  password: z.string().min(1, 'TeamSpeak password is required'),
  serverId: z.number().int().positive().default(1),
  nickname: z.string().default('Discord Bridge'),
  useTS5: z.boolean().default(false),
  ts5WebsocketPort: z.number().int().positive().optional(),
  reconnectInterval: z.number().int().positive().default(5000),
  maxReconnectAttempts: z.number().int().positive().default(10),
});

export const AudioConfigSchema = z.object({
  quality: z.enum(['low', 'medium', 'high', 'ultra']).default('high'),
  bitrate: z.number().int().positive().default(64000),
  sampleRate: z.number().int().positive().default(48000),
  channels: z.number().int().positive().max(2).default(1),
  frameSize: z.number().int().positive().default(960),
  vadEnabled: z.boolean().default(true),
  vadThreshold: z.number().min(0).max(1).default(0.5),
  noiseSuppressionEnabled: z.boolean().default(true),
  noiseSuppressionLevel: z.number().int().min(0).max(3).default(2),
  jitterBufferMs: z.number().int().positive().default(100),
  adaptiveBitrate: z.boolean().default(true),
  opusApplication: z.enum(['voip', 'audio', 'restricted-lowdelay']).default('voip'),
});

export const ChatConfigSchema = z.object({
  syncEnabled: z.boolean().default(true),
  syncInterval: z.number().int().positive().default(1000),
  maxMessageLength: z.number().int().positive().default(2000),
  embedLinks: z.boolean().default(true),
  embedImages: z.boolean().default(true),
  showTimestamps: z.boolean().default(true),
  showUserBadges: z.boolean().default(true),
  threadMapping: z.boolean().default(true),
  mentionMapping: z.boolean().default(true),
  commandPrefix: z.string().default('!'),
  ignoredChannels: z.array(z.string()).default([]),
});

export const UserConfigSchema = z.object({
  linkEnabled: z.boolean().default(true),
  nicknameSync: z.boolean().default(true),
  avatarSync: z.boolean().default(false),
  roleMapping: z.record(z.string(), z.string()).default({}),
  permissionSync: z.boolean().default(true),
  presenceSync: z.boolean().default(true),
  banSync: z.boolean().default(true),
  kickSync: z.boolean().default(true),
});

export const BridgeConfigSchema = z.object({
  logLevel: z.enum(['trace', 'debug', 'info', 'warn', 'error', 'fatal']).default('info'),
  syncInterval: z.number().int().positive().default(5000),
  healthCheckInterval: z.number().int().positive().default(30000),
  maxConcurrentUsers: z.number().int().positive().default(100),
  rateLimit: z.object({
    windowMs: z.number().int().positive().default(60000),
    maxRequests: z.number().int().positive().default(100),
  }),
  encryption: z.object({
    enabled: z.boolean().default(true),
    key: z.string().optional(),
  }),
});

export const DatabaseConfigSchema = z.object({
  url: z.string().url().default('postgresql://bridge:password@localhost:5432/teamspeak_discord_bridge'),
  poolSize: z.number().int().positive().default(10),
  ssl: z.boolean().default(false),
});

export const RedisConfigSchema = z.object({
  url: z.string().url().default('redis://localhost:6379'),
  keyPrefix: z.string().default('tsdc:'),
  connectionTimeout: z.number().int().positive().default(10000),
});

export const WebDashboardConfigSchema = z.object({
  enabled: z.boolean().default(true),
  port: z.number().int().positive().default(3000),
  host: z.string().default('0.0.0.0'),
  corsOrigins: z.array(z.string()).default(['http://localhost:3000']),
  sessionSecret: z.string().min(32).optional(),
  discordOAuth: z.object({
    clientId: z.string().optional(),
    clientSecret: z.string().optional(),
    callbackUrl: z.string().url().optional(),
  }).optional(),
});

export const ConfigSchema = z.object({
  discord: DiscordConfigSchema,
  teamspeak: TeamSpeakConfigSchema,
  audio: AudioConfigSchema,
  chat: ChatConfigSchema,
  user: UserConfigSchema,
  bridge: BridgeConfigSchema,
  database: DatabaseConfigSchema,
  redis: RedisConfigSchema,
  webDashboard: WebDashboardConfigSchema,
  environment: z.enum(['development', 'staging', 'production']).default('development'),
});

export type DiscordConfig = z.infer<typeof DiscordConfigSchema>;
export type TeamSpeakConfig = z.infer<typeof TeamSpeakConfigSchema>;
export type AudioConfig = z.infer<typeof AudioConfigSchema>;
export type ChatConfig = z.infer<typeof ChatConfigSchema>;
export type UserConfig = z.infer<typeof UserConfigSchema>;
export type BridgeConfig = z.infer<typeof BridgeConfigSchema>;
export type DatabaseConfig = z.infer<typeof DatabaseConfigSchema>;
export type RedisConfig = z.infer<typeof RedisConfigSchema>;
export type WebDashboardConfig = z.infer<typeof WebDashboardConfigSchema>;
export type Config = z.infer<typeof ConfigSchema>;