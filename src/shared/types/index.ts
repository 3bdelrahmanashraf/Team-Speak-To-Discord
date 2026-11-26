/**
 * Shared TypeScript types for TeamSpeak to Discord Bridge
 * Used across all modules for type safety
 */

// ============================================================================
// Core Bridge Types
// ============================================================================

export type LogLevel = 'trace' | 'debug' | 'info' | 'warn' | 'error' | 'fatal';

export type Environment = 'development' | 'staging' | 'production';

export type AudioQuality = 'low' | 'medium' | 'high' | 'ultra';

export type OpusApplication = 'voip' | 'audio' | 'restricted-lowdelay';

export type BridgeState = 'disconnected' | 'connecting' | 'connected' | 'reconnecting' | 'error';

// ============================================================================
// Discord Types
// ============================================================================

export interface DiscordUser {
  id: string;
  username: string;
  discriminator: string;
  globalName: string | null;
  avatar: string | null;
  bot: boolean;
  system: boolean;
  mfaEnabled: boolean;
  locale: string;
  verified: boolean;
  email: string | null;
  flags: number;
  premiumType: number;
  publicFlags: number;
}

export interface DiscordGuildMember extends DiscordUser {
  nick: string | null;
  roles: string[];
  joinedAt: Date;
  premiumSince: Date | null;
  deaf: boolean;
  mute: boolean;
  pending: boolean;
  permissions: bigint;
  communicationDisabledUntil: Date | null;
}

export interface DiscordVoiceState {
  guildId: string;
  channelId: string | null;
  userId: string;
  member: DiscordGuildMember | null;
  sessionId: string;
  deaf: boolean;
  mute: boolean;
  selfDeaf: boolean;
  selfMute: boolean;
  selfStream: boolean;
  selfVideo: boolean;
  suppress: boolean;
  requestToSpeakTimestamp: Date | null;
}

export interface DiscordChannel {
  id: string;
  type: number;
  guildId: string | null;
  name: string | null;
  topic: string | null;
  position: number;
  parentId: string | null;
  permissionOverwrites: DiscordPermissionOverwrite[];
  nsfw: boolean;
  rateLimitPerUser: number;
  bitrate: number | null;
  userLimit: number | null;
  rtcRegion: string | null;
  videoQualityMode: number;
  threadMetadata: DiscordThreadMetadata | null;
  appliedTags: string[];
  defaultAutoArchiveDuration: number;
  defaultReactionEmoji: DiscordDefaultReactionEmoji | null;
  defaultThreadRateLimitPerUser: number;
  defaultSortOrder: number;
  defaultForumLayout: number;
  availableTags: DiscordForumTag[];
  icon: string | null;
  ownerId: string | null;
  managed: boolean;
  flags: number;
}

export interface DiscordPermissionOverwrite {
  id: string;
  type: number;
  allow: string;
  deny: string;
}

export interface DiscordThreadMetadata {
  archived: boolean;
  autoArchiveDuration: number;
  archiveTimestamp: Date;
  locked: boolean;
  invitable: boolean;
  createTimestamp: Date | null;
}

export interface DiscordDefaultReactionEmoji {
  emojiId: string | null;
  emojiName: string | null;
}

export interface DiscordForumTag {
  id: string;
  name: string;
  moderated: boolean;
  emojiId: string | null;
  emojiName: string | null;
}

// ============================================================================
// TeamSpeak Types
// ============================================================================

export interface TSClient {
  clid: string;
  cid: string;
  clientNickname: string;
  clientType: number;
  clientDatabaseId: string;
  clientUniqueIdentifier: string;
  clientServergroups: string;
  clientAway: boolean;
  clientAwayMessage: string | null;
  clientTalkPower: number;
  clientIsTalking: boolean;
  clientIsRecording: boolean;
  clientIsPrioritySpeaker: boolean;
  clientInputMuted: boolean;
  clientOutputMuted: boolean;
  clientInputHardware: boolean;
  clientOutputHardware: boolean;
  clientIdleTime: number;
  clientCreated: number;
  clientLastConnected: number;
  clientPlatform: string;
  clientVersion: string;
  clientMetaData: string | null;
}

export interface TSChannel {
  cid: string;
  pid: string;
  channelOrder: number;
  channelName: string;
  channelTopic: string | null;
  channelDescription: string | null;
  channelPassword: string | null;
  channelCodec: number;
  channelCodecQuality: number;
  channelMaxClients: number;
  channelMaxFamilyClients: number;
  channelMaxFamilyClientsInherited: number;
  channelFlagPermanent: boolean;
  channelFlagSemiPermanent: boolean;
  channelFlagDefault: boolean;
  channelFlagPassword: boolean;
  channelFlagMaxClientsUnlimited: boolean;
  channelFlagMaxFamilyClientsUnlimited: boolean;
  channelFlagMaxFamilyClientsInheritedUnlimited: boolean;
  channelNeededTalkPower: number;
  channelNamePhonetic: string | null;
  channelIconId: string | null;
  channelBannerGfxUrl: string | null;
  channelBannerMode: number;
  totalClients: number;
  totalClientsFamily: number;
  secondsEmpty: number;
}

export interface TSServerGroup {
  sgid: string;
  name: string;
  type: number;
  iconId: string | null;
  savedb: boolean;
  sortId: number;
  namemode: number;
  nMemberAddp: number;
  nMemberRemovep: number;
  nModifyp: number;
  members: string[];
}

export interface TSChannelGroup {
  cgid: string;
  name: string;
  type: number;
  iconId: string | null;
  savedb: boolean;
  sortId: number;
  namemode: number;
  nMemberAddp: number;
  nMemberRemovep: number;
  nModifyp: number;
}

export interface TSPermission {
  permid: number;
  permsid: string;
  permvalue: number;
  permnegated: boolean;
  permskip: boolean;
}

export interface TSBan {
  banid: string;
  ip: string | null;
  name: string | null;
  uid: string | null;
  created: number;
  duration: number;
  invokerName: string;
  invokerUid: string;
  reason: string;
  enforcements: number;
}

// ============================================================================
// Bridge Mapping Types
// ============================================================================

export interface UserLink {
  id: string;
  discordId: string;
  tsUniqueId: string;
  tsDatabaseId: string;
  tsNickname: string;
  discordUsername: string;
  linkedAt: Date;
  lastSyncedAt: Date | null;
  active: boolean;
  metadata: Record<string, unknown>;
}

export interface ChannelMapping {
  id: string;
  tsChannelId: string;
  discordChannelId: string;
  type: 'voice' | 'text' | 'both';
  syncMessages: boolean;
  syncUsers: boolean;
  syncPermissions: boolean;
  createdAt: Date;
  updatedAt: Date;
  active: boolean;
}

export interface RoleMapping {
  id: string;
  tsServerGroupId: string;
  discordRoleId: string;
  tsGroupName: string;
  discordRoleName: string;
  syncEnabled: boolean;
  createdAt: Date;
  updatedAt: Date;
}

// ============================================================================
// Audio Types
// ============================================================================

export interface AudioConfig {
  quality: AudioQuality;
  bitrate: number;
  sampleRate: number;
  channels: number;
  frameSize: number;
  vadEnabled: boolean;
  vadThreshold: number;
  noiseSuppressionEnabled: boolean;
  noiseSuppressionLevel: number;
  jitterBufferMs: number;
  adaptiveBitrate: boolean;
  opusApplication: OpusApplication;
}

export interface AudioPacket {
  data: Buffer;
  timestamp: number;
  sequence: number;
  ssrc: number;
  userId: string;
  speaking: boolean;
}

export interface OpusEncoderOptions {
  bitrate: number;
  sampleRate: number;
  channels: number;
  application: OpusApplication;
  frameSize: number;
}

export interface OpusDecoderOptions {
  sampleRate: number;
  channels: number;
  frameSize: number;
}

// ============================================================================
// Event Types
// ============================================================================

export interface BridgeEvent<T = unknown> {
  type: string;
  timestamp: Date;
  source: 'teamspeak' | 'discord' | 'bridge';
  payload: T;
  correlationId?: string;
}

export interface TSClientConnectEvent extends BridgeEvent<TSClient> {
  type: 'ts.client.connect';
}

export interface TSClientDisconnectEvent extends BridgeEvent<{ clid: string; reasonId: number; reasonMsg: string }> {
  type: 'ts.client.disconnect';
}

export interface TSClientMoveEvent extends BridgeEvent<{ clid: string; fromCid: string; toCid: string }> {
  type: 'ts.client.move';
}

export interface TSClientTalkEvent extends BridgeEvent<{ clid: string; talking: boolean }> {
  type: 'ts.client.talk';
}

export interface TSChatMessageEvent extends BridgeEvent<{
  clid: string;
  message: string;
  targetMode: number;
  target: string;
}> {
  type: 'ts.chat.message';
}

export interface DiscordVoiceStateUpdateEvent extends BridgeEvent<{
  oldState: DiscordVoiceState | null;
  newState: DiscordVoiceState | null;
}> {
  type: 'discord.voiceStateUpdate';
}

export interface DiscordMessageCreateEvent extends BridgeEvent<{
  message: {
    id: string;
    content: string;
    authorId: string;
    channelId: string;
    guildId: string | null;
    timestamp: Date;
    editedTimestamp: Date | null;
    embeds: unknown[];
    attachments: unknown[];
    mentions: { users: string[]; roles: string[] };
    referencedMessage: { id: string } | null;
  };
}> {
  type: 'discord.messageCreate';
}

export interface DiscordMessageUpdateEvent extends BridgeEvent<{
  oldMessage: Partial<DiscordMessageCreateEvent['payload']['message']> | null;
  newMessage: DiscordMessageCreateEvent['payload']['message'];
}> {
  type: 'discord.messageUpdate';
}

export interface DiscordMessageDeleteEvent extends BridgeEvent<{
  id: string;
  channelId: string;
  guildId: string | null;
}> {
  type: 'discord.messageDelete';
}

export type BridgeEvents =
  | TSClientConnectEvent
  | TSClientDisconnectEvent
  | TSClientMoveEvent
  | TSClientTalkEvent
  | TSChatMessageEvent
  | DiscordVoiceStateUpdateEvent
  | DiscordMessageCreateEvent
  | DiscordMessageUpdateEvent
  | DiscordMessageDeleteEvent;

// ============================================================================
// Configuration Types (re-exported from schema)
// ============================================================================

export type {
  DiscordConfig,
  TeamSpeakConfig,
  AudioConfig as AudioConfigType,
  ChatConfig,
  UserConfig,
  BridgeConfig,
  DatabaseConfig,
  RedisConfig,
  WebDashboardConfig,
  Config,
} from '../../config/schema.js';

// ============================================================================
// Utility Types
// ============================================================================

export type DeepPartial<T> = {
  [P in keyof T]?: T[P] extends object ? DeepPartial<T[P]> : T[P];
};

export type RequiredKeys<T, K extends keyof T> = T & Required<Pick<T, K>>;

export type OptionalKeys<T, K extends keyof T> = Omit<T, K> & Partial<Pick<T, K>>;

export type NonNullable<T> = T extends null | undefined ? never : T;

export type ValueOf<T> = T[keyof T];

export type Prettify<T> = {
  [K in keyof T]: T[K];
} & {};