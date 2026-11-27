/**
 * Discord Types
 * Types for Discord.js v14 integration
 */

import type { DiscordUser, DiscordGuildMember, DiscordVoiceState, DiscordChannel } from '../shared/types.js';

// Re-export shared types
export type {
  DiscordUser,
  DiscordGuildMember,
  DiscordVoiceState,
  DiscordChannel,
};

// ============================================================================
// Discord Configuration
// ============================================================================

export interface DiscordConfig {
  token: string;
  clientId: string;
  guildId: string;
  intents: string[];
}

export interface DiscordIntents {
  Guilds: boolean;
  GuildMembers: boolean;
  GuildVoiceStates: boolean;
  GuildMessages: boolean;
  MessageContent: boolean;
  GuildMessageReactions: boolean;
  DirectMessages: boolean;
  DirectMessageReactions: boolean;
}

// ============================================================================
// Slash Commands
// ============================================================================

export interface SlashCommandData {
  name: string;
  description: string;
  options?: SlashCommandOption[];
  defaultMemberPermissions?: string;
  dmPermission?: boolean;
}

export interface SlashCommandOption {
  name: string;
  description: string;
  type: number; // Discord.js ApplicationCommandOptionType
  required?: boolean;
  choices?: { name: string; value: string | number }[];
  autocomplete?: boolean;
  channelTypes?: number[];
  minValue?: number;
  maxValue?: number;
  minLength?: number;
  maxLength?: number;
}

export interface SlashCommandHandler {
  data: SlashCommandData;
  execute: (interaction: CommandInteraction) => Promise<void>;
  autocomplete?: (interaction: AutocompleteInteraction) => Promise<void>;
}

// ============================================================================
// Voice Types
// ============================================================================

export interface VoiceConnectionState {
  connected: boolean;
  channelId: string | null;
  guildId: string | null;
  selfDeaf: boolean;
  selfMute: boolean;
  speaking: boolean;
}

export interface VoiceConfig {
  sampleRate: number;
  channels: number;
  frameSize: number;
  bitrate: number;
}

export interface AudioPacket {
  data: Buffer;
  userId: string;
  timestamp: number;
  sequence: number;
  ssrc: number;
}

// ============================================================================
// Event Types
// ============================================================================

export interface DiscordEventMap {
  // Connection events
  'ready': [void];
  'disconnect': [Error | null];
  'reconnecting': [void];
  'error': [Error];

  // Guild events
  'guildCreate': [Guild];
  'guildDelete': [Guild];
  'guildUpdate': [Guild, Guild];

  // Member events
  'guildMemberAdd': [GuildMember];
  'guildMemberRemove': [GuildMember, Guild];
  'guildMemberUpdate': [GuildMember, GuildMember];
  'guildMemberAvailable': [GuildMember];
  'guildMembersChunk': [GuildMember[]];

  // Voice events
  'voiceStateUpdate': [VoiceState, VoiceState];
  'voiceServerUpdate': [VoiceServerUpdate];

  // Message events
  'messageCreate': [Message];
  'messageUpdate': [Message, Message];
  'messageDelete': [Message, Channel];
  'messageDeleteBulk': [Collection<string, Message>, Channel];

  // Reaction events
  'messageReactionAdd': [MessageReaction, User];
  'messageReactionRemove': [MessageReaction, User];
  'messageReactionRemoveAll': [Message];
  'messageReactionRemoveEmoji': [ReactionEmoji];

  // Thread events
  'threadCreate': [ThreadChannel];
  'threadUpdate': [ThreadChannel, ThreadChannel];
  'threadDelete': [ThreadChannel];
  'threadListSync': [ThreadChannel[]];
  'threadMemberUpdate': [ThreadMember, ThreadMember];
  'threadMembersUpdate': [ThreadMembersUpdate];

  // Interaction events
  'interactionCreate': [Interaction];
  'applicationCommandPermissionsUpdate': [ApplicationCommandPermissions];

  // Presence events
  'presenceUpdate': [Presence, Presence];
  'userUpdate': [User, User];

  // Raw events
  'raw': [object];
  'rawWS': [object];
}

// ============================================================================
// Discord.js Re-exports (for convenience)
// ============================================================================

export type {
  Client,
  ClientOptions,
  GatewayIntentBits,
  Partials,
  Collection,
  Guild,
  GuildMember,
  User,
  Message,
  MessageReaction,
  ReactionEmoji,
  Channel,
  TextChannel,
  VoiceChannel,
  ThreadChannel,
  DMChannel,
  CategoryChannel,
  NewsChannel,
  StageChannel,
  VoiceState,
  VoiceServerUpdate,
  Interaction,
  CommandInteraction,
  AutocompleteInteraction,
  ButtonInteraction,
  SelectMenuInteraction,
  ModalSubmitInteraction,
  ApplicationCommand,
  ApplicationCommandOptionType,
  ApplicationCommandPermissionType,
  ApplicationCommandPermissions,
  ThreadMember,
  ThreadMembersUpdate,
  Presence,
  Activity,
  ActivityType,
  GatewayIntentBits as Intents,
  REST,
  Routes,
  APIApplicationCommand,
  APIApplicationCommandOption,
  APIApplicationCommandInteractionDataOption,
  APIMessageComponentInteractionData,
  APIModalSubmitInteractionData,
} from 'discord.js';

// ============================================================================
// Custom Types
// ============================================================================

export interface DiscordBotConfig {
  token: string;
  clientId: string;
  guildId: string;
  intents: GatewayIntentBits[];
  partials: Partials[];
  allowedMentions: {
    parse: ('users' | 'roles' | 'everyone')[];
    repliedUser: boolean;
  };
}

export interface CommandContext {
  interaction: CommandInteraction;
  client: Client<true>;
  guild: Guild | null;
  member: GuildMember | null;
  user: User;
  channel: Channel;
}

export interface AutocompleteContext {
  interaction: AutocompleteInteraction;
  client: Client<true>;
  focusedOption: string;
  options: Map<string, string | number | boolean>;
}