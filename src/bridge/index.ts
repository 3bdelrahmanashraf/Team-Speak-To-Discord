/**
 * Core Bridge Module - Main bridge orchestration
 * Coordinates TeamSpeak and Discord connections
 */

import { EventEmitter } from 'node:events';
import { getConfig } from '../shared/config/index.js';
import { createLogger } from '../shared/utils/logger.js';
import { BridgeState, BridgeEvents, TSClient, TSChannel, DiscordVoiceState, UserLink, ChannelMapping, DiscordMessage } from '../shared/types/index.js';
import { BridgeError, ConnectionError, TeamSpeakError, DiscordError } from '../shared/utils/errors.js';
import { ChatSync } from './chat/index.js';

const logger = createLogger('bridge:core');

export class BridgeCore extends EventEmitter {
  private state: BridgeState = 'disconnected';
  private config = getConfig();
  private reconnectAttempts = 0;
  private readonly maxReconnectAttempts: number;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private healthCheckTimer: ReturnType<typeof setTimeout> | null = null;

  // Component references (to be initialized)
  private teamspeakClient: unknown = null;
  private discordClient: unknown = null;
  private audioPipeline: unknown = null;
  private chatSync: ChatSync | null = null;
  private userManager: unknown = null;

  // State tracking
  private connectedTSClients: Map<string, TSClient> = new Map();
  private connectedDiscordUsers: Map<string, DiscordVoiceState> = new Map();
  private userLinks: Map<string, UserLink> = new Map();
  private channelMappings: Map<string, ChannelMapping> = new Map();

  constructor() {
    super();
    this.maxReconnectAttempts = config.bridge.maxConcurrentUsers; // Using maxConcurrentUsers as fallback

    // Initialize chat sync
    this.chatSync = new ChatSync(this.config.chat);

    // Connect chat sync events
    this.chatSync.on('ts:message', this.handleTSChatMessageFromSync.bind(this));
    this.chatSync.on('dc:message', this.handleDiscordMessageFromSync.bind(this));
    this.chatSync.on('send:discord', this.handleSendToDiscord.bind(this));
    this.chatSync.on('send:teamspeak', this.handleSendToTeamSpeak.bind(this));
    this.chatSync.on('edit:discord', this.handleDiscordEdit.bind(this));
    this.chatSync.on('delete:discord', this.handleDiscordDelete.bind(this));
    this.chatSync.on('edit:teamspeak', this.handleTSEdit.bind(this));
    this.chatSync.on('delete:teamspeak', this.handleTSDelete.bind(this));

    this.setupEventHandlers();
  }

  /**
   * Get current bridge state
   */
  getState(): BridgeState {
    return this.state;
  }

  /**
   * Check if bridge is fully connected
   */
  isConnected(): boolean {
    return this.state === 'connected';
  }

  /**
   * Initialize and start the bridge
   */
  async start(): Promise<void> {
    if (this.state !== 'disconnected') {
      logger.warn('Bridge already started', { state: this.state });
      return;
    }

    this.setState('connecting');
    logger.info('Starting bridge components...');

    try {
      // Initialize components in order
      await this.initializeTeamSpeak();
      await this.initializeDiscord();
      await this.initializeAudioPipeline();
      await this.initializeChatSync();
      await this.initializeUserManager();
      await this.loadPersistentState();

      // Start health checks
      this.startHealthChecks();

      this.setState('connected');
      this.reconnectAttempts = 0;
      logger.info('Bridge started successfully');
      this.emit('bridge.ready');
    } catch (error) {
      this.setState('error');
      logger.error('Failed to start bridge', { error: String(error) });
      throw error;
    }
  }

  /**
   * Stop the bridge gracefully
   */
  async stop(): Promise<void> {
    logger.info('Stopping bridge...');
    this.setState('disconnected');

    // Clear timers
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    if (this.healthCheckTimer) {
      clearInterval(this.healthCheckTimer);
      this.healthCheckTimer = null;
    }

    // Stop components
    await this.shutdownComponents();

    // Save state
    await this.savePersistentState();

    logger.info('Bridge stopped');
    this.emit('bridge.stopped');
  }

  /**
   * Restart the bridge
   */
  async restart(): Promise<void> {
    logger.info('Restarting bridge...');
    await this.stop();
    await this.start();
  }

  // ========================================================================
  // Component Initialization (Stubs - to be implemented)
  // ========================================================================

  private async initializeTeamSpeak(): Promise<void> {
    logger.info('Initializing TeamSpeak client...');
    // TODO: Implement TeamSpeak client connection
    // this.teamspeakClient = new TeamSpeakClient(this.config.teamspeak);
    // await this.teamspeakClient.connect();
    // this.setupTeamSpeakEvents();
  }

  private async initializeDiscord(): Promise<void> {
    logger.info('Initializing Discord client...');
    // TODO: Implement Discord client connection
    // this.discordClient = new DiscordClient(this.config.discord);
    // await this.discordClient.login();
    // this.setupDiscordEvents();
  }

  private async initializeAudioPipeline(): Promise<void> {
    logger.info('Initializing audio pipeline...');
    // TODO: Implement audio pipeline
    // this.audioPipeline = new AudioPipeline(this.config.audio);
  }

  private async initializeChatSync(): Promise<void> {
    logger.info('Initializing chat synchronization...');
    // ChatSync already initialized in constructor
    if (this.chatSync) {
      this.chatSync.setChannelMappings(this.channelMappings);
      logger.info('Chat synchronization initialized');
    }
  }

  private async initializeUserManager(): Promise<void> {
    logger.info('Initializing user manager...');
    // TODO: Implement user manager
    // this.userManager = new UserManager(this.config.user);
  }

  private async loadPersistentState(): Promise<void> {
    logger.info('Loading persistent state...');
    // TODO: Load user links, channel mappings from database
  }

  private async savePersistentState(): Promise<void> {
    logger.info('Saving persistent state...');
    // TODO: Save user links, channel mappings to database
  }

  private async shutdownComponents(): Promise<void> {
    logger.info('Shutting down components...');
    // TODO: Gracefully disconnect all components
  }

  // ========================================================================
  // TeamSpeak Event Handlers
  // ========================================================================

  private handleTSClientConnect(event: BridgeEvents): void {
    if (event.type !== 'ts.client.connect') return;
    const client = event.payload as TSClient;

    this.connectedTSClients.set(client.clid, client);
    logger.debug('TeamSpeak client connected', { clid: client.clid, nickname: client.clientNickname });

    // Check for linked Discord user
    const link = this.findUserLinkByTS(client.clientUniqueIdentifier);
    if (link) {
      this.handleLinkedUserConnect(link, client);
    }

    this.emit('user.joined', { platform: 'teamspeak', client });
  }

  private handleTSClientDisconnect(event: BridgeEvents): void {
    if (event.type !== 'ts.client.disconnect') return;
    const { clid, reasonId, reasonMsg } = event.payload as { clid: string; reasonId: number; reasonMsg: string };

    const client = this.connectedTSClients.get(clid);
    this.connectedTSClients.delete(clid);

    logger.debug('TeamSpeak client disconnected', { clid, reasonId, reasonMsg });

    if (client) {
      this.emit('user.left', { platform: 'teamspeak', client, reason: reasonMsg });
    }
  }

  private handleTSClientMove(event: BridgeEvents): void {
    if (event.type !== 'ts.client.move') return;
    const { clid, fromCid, toCid } = event.payload as { clid: string; fromCid: string; toCid: string };

    const client = this.connectedTSClients.get(clid);
    if (client) {
      client.cid = toCid;
      logger.debug('TeamSpeak client moved', { clid, fromCid, toCid });
      this.emit('user.moved', { platform: 'teamspeak', client, fromCid, toCid });
    }
  }

  private handleTSClientTalk(event: BridgeEvents): void {
    if (event.type !== 'ts.client.talk') return;
    const { clid, talking } = event.payload as { clid: string; talking: boolean };

    const client = this.connectedTSClients.get(clid);
    if (client) {
      client.clientIsTalking = talking;
      // Forward audio to Discord if linked
      if (talking) {
        this.emit('audio.start', { platform: 'teamspeak', client });
      } else {
        this.emit('audio.stop', { platform: 'teamspeak', client });
      }
    }
  }

  private handleTSChatMessage(event: BridgeEvents): void {
    if (event.type !== 'ts.chat.message') return;
    const { clid, message, targetMode, target } = event.payload as { clid: string; message: string; targetMode: number; target: string };

    const client = this.connectedTSClients.get(clid);
    if (client) {
      logger.debug('TeamSpeak chat message', { clid, message: message.substring(0, 50) });
      // Forward to chat sync for processing
      this.chatSync?.handleTSMessage(clid, message, client, targetMode, target);
    }
  }

  // ========================================================================
  // Discord Event Handlers
  // ========================================================================

  private handleDiscordVoiceStateUpdate(event: BridgeEvents): void {
    if (event.type !== 'discord.voiceStateUpdate') return;
    const { oldState, newState } = event.payload as { oldState: DiscordVoiceState | null; newState: DiscordVoiceState | null };

    const userId = newState?.userId || oldState?.userId;
    if (!userId) return;

    if (newState?.channelId && !oldState?.channelId) {
      // User joined voice channel
      this.connectedDiscordUsers.set(userId, newState);
      logger.debug('Discord user joined voice', { userId, channelId: newState.channelId });

      // Check for linked TS user
      const link = this.findUserLinkByDiscord(userId);
      if (link) {
        this.handleLinkedUserVoiceJoin(link, newState);
      }

      this.emit('user.joined', { platform: 'discord', userId, channelId: newState.channelId });
    } else if (!newState?.channelId && oldState?.channelId) {
      // User left voice channel
      this.connectedDiscordUsers.delete(userId);
      logger.debug('Discord user left voice', { userId });

      this.emit('user.left', { platform: 'discord', userId });
    } else if (newState?.channelId && oldState?.channelId && newState.channelId !== oldState.channelId) {
      // User moved channels
      logger.debug('Discord user moved voice', { userId, from: oldState.channelId, to: newState.channelId });
      this.emit('user.moved', { platform: 'discord', userId, from: oldState.channelId, to: newState.channelId });
    }
  }

  private handleDiscordMessageCreate(event: BridgeEvents): void {
    if (event.type !== 'discord.messageCreate') return;
    const message = event.payload;

    // Ignore bot messages
    if (message.authorId === this.config.discord.clientId) return;

    logger.debug('Discord message created', { channelId: message.channelId, authorId: message.authorId });
    // Forward to chat sync for processing
    this.chatSync?.handleDiscordMessage({
      id: message.id,
      content: message.content,
      authorId: message.authorId,
      authorName: message.author?.username || 'Unknown',
      channelId: message.channelId,
      guildId: message.guildId,
      timestamp: message.createdAt,
      editedTimestamp: message.editedAt,
      embeds: message.embeds,
      attachments: message.attachments,
      mentions: message.mentions,
      referencedMessage: message.reference?.messageId ? { id: message.reference.messageId } : null,
    });
  }

  private handleDiscordMessageUpdate(event: BridgeEvents): void {
    if (event.type !== 'discord.messageUpdate') return;
    const message = event.payload;
    this.chatSync?.handleDiscordMessageEdit({
      id: message.id,
      content: message.content,
      channelId: message.channelId,
    });
  }

  private handleDiscordMessageDelete(event: BridgeEvents): void {
    if (event.type !== 'discord.messageDelete') return;
    this.chatSync?.handleDiscordMessageDelete(event.payload);
  }

  // ========================================================================
  // Chat Sync Event Handlers
  // ========================================================================

  private handleTSChatMessageFromSync(event: any): void {
    const { clid, message, client, targetMode, target } = event.payload;
    const client = this.connectedTSClients.get(clid);
    if (client) {
      this.chatSync?.handleTSMessage(clid, message, client, event.payload.targetMode, event.payload.target);
    }
  }

  private handleDiscordMessageFromSync(event: any): void {
    const message = event.payload;
    this.chatSync?.handleDiscordMessage(message);
  }

  private handleSendToDiscord(data: { channelId: string; content: string }): void {
    // Forward to Discord client via bot
    this.emit('send:discord', data);
  }

  private handleSendToTeamSpeak(data: { channelId: string; content: string }): void {
    // Forward to TeamSpeak client
    this.emit('send:teamspeak', data);
  }

  private handleDiscordEdit(data: { dcMessageId: string; newContent: string }): void {
    this.emit('edit:discord', data);
  }

  private handleDiscordDelete(data: { dcMessageId: string }): void {
    this.emit('delete:discord', data);
  }

  private handleTSEdit(data: { tsMessageId: string; newContent: string }): void {
    this.emit('edit:teamspeak', data);
  }

  private handleTSDelete(data: { tsMessageId: string }): void {
    this.emit('delete:teamspeak', data);
  }

  // ========================================================================
  // Linked User Handling
  // ========================================================================

  private findUserLinkByTS(tsUniqueId: string): UserLink | undefined {
    for (const link of this.userLinks.values()) {
      if (link.tsUniqueId === tsUniqueId && link.active) {
        return link;
      }
    }
    return undefined;
  }

  private findUserLinkByDiscord(discordId: string): UserLink | undefined {
    for (const link of this.userLinks.values()) {
      if (link.discordId === discordId && link.active) {
        return link;
      }
    }
    return undefined;
  }

  private handleLinkedUserConnect(link: UserLink, tsClient: TSClient): void {
    logger.info('Linked user connected to TeamSpeak', {
      discordId: link.discordId,
      tsUniqueId: link.tsUniqueId,
    });
    // TODO: Notify Discord, update presence
  }

  private handleLinkedUserVoiceJoin(link: UserLink, voiceState: DiscordVoiceState): void {
    logger.info('Linked user joined Discord voice', {
      discordId: link.discordId,
      channelId: voiceState.channelId,
    });
    // TODO: Connect TS audio to Discord voice channel
  }

  // ========================================================================
  // State Management
  // ========================================================================

  private setState(state: BridgeState): void {
    const oldState = this.state;
    this.state = state;
    logger.debug('Bridge state changed', { from: oldState, to: state });
    this.emit('state.change', { from: oldState, to: state });
  }

  private startHealthChecks(): void {
    this.healthCheckTimer = setInterval(() => {
      this.performHealthCheck();
    }, this.config.bridge.healthCheckInterval);
  }

  private async performHealthCheck(): Promise<void> {
    // TODO: Implement health checks for all components
    // - TeamSpeak connection
    // - Discord gateway
    // - Database connectivity
    // - Redis connectivity
    // - Memory usage
    this.emit('health.check', { timestamp: new Date(), state: this.state });
  }

  // ========================================================================
  // Public API
  // ========================================================================

  /**
   * Get connected TeamSpeak clients
   */
  getTSClients(): TSClient[] {
    return Array.from(this.connectedTSClients.values());
  }

  /**
   * Get connected Discord users in voice
   */
  getDiscordVoiceUsers(): DiscordVoiceState[] {
    return Array.from(this.connectedDiscordUsers.values());
  }

  /**
   * Get user links
   */
  getUserLinks(): UserLink[] {
    return Array.from(this.userLinks.values());
  }

  /**
   * Get channel mappings
   */
  getChannelMappings(): ChannelMapping[] {
    return Array.from(this.channelMappings.values());
  }

  /**
   * Send message to TeamSpeak
   */
  async sendTSMessage(targetMode: number, target: string, message: string): Promise<void> {
    if (this.teamspeakClient) {
      // @ts-ignore
      await this.teamspeakClient.sendMessage(targetMode, target, message);
    } else {
      logger.warn('TeamSpeak client not initialized');
    }
  }

  /**
   * Send message to Discord
   */
  async sendDiscordMessage(channelId: string, content: string): Promise<void> {
    if (this.discordClient) {
      await this.discordClient.sendMessage(channelId, content);
    } else {
      logger.warn('Discord client not initialized');
    }
  }

  /**
   * Move TeamSpeak client
   */
  async moveTSClient(clid: string, cid: string): Promise<void> {
    // TODO: Implement via TeamSpeak client
    logger.debug('Moving TS client', { clid, cid });
  }

  /**
   * Move Discord user
   */
  async moveDiscordUser(userId: string, channelId: string): Promise<void> {
    // TODO: Implement via Discord client
    logger.debug('Moving Discord user', { userId, channelId });
  }
}

// Export singleton instance
export const bridgeCore = new BridgeCore();