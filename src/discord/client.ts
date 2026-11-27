/**
 * Discord Client
 * Discord.js v14 bot with gateway intents, slash commands, and voice support
 */

import { Client, GatewayIntentBits, Partials, Collection, Events, REST, Routes, ActivityType, VoiceChannel, VoiceState, Guild, GuildMember, Message, TextChannel, ThreadChannel, Interaction, CommandInteraction, AutocompleteInteraction, MessageReaction, User, PartialMessageReaction } from 'discord.js';
import { EventEmitter } from 'node:events';
import { createLogger } from '../../shared/utils/logger.js';
import { BridgeError, ConnectionError, DiscordError } from '../../shared/utils/errors.js';
import type {
  DiscordConfig,
  DiscordIntents,
  SlashCommandData,
  SlashCommandHandler,
  VoiceConnectionState,
  VoiceConfig,
  DiscordEventMap,
  DiscordBotConfig,
  CommandContext,
  AutocompleteContext,
} from './types.js';
import { tsEventEmitter } from '../teamspeak/events/index.js';
import { createDiscordVoiceHandler, DiscordVoiceHandler } from './voice/handler.js';

const logger = createLogger('discord:client');

// Reaction role mapping type
interface ReactionRoleMapping {
  id: string;
  channelId: string;
  messageId: string;
  emoji: string;
  tsGroupName: string;
  description?: string;
}

interface CommandHandlerMap {
  [commandName: string]: SlashCommandHandler;
}

interface PendingVoiceConnection {
  guildId: string;
  channelId: string;
  resolve: (connection: unknown) => void;
  reject: (error: Error) => void;
  timeout: ReturnType<typeof setTimeout>;
}

export class DiscordClient extends EventEmitter {
  private client: Client<true>;
  private config: DiscordConfig;
  private state: 'disconnected' | 'connecting' | 'connected' | 'reconnecting' | 'error' = 'disconnected';
  private commands: CommandHandlerMap = {};
  private commandData: SlashCommandData[] = [];
  private rest: REST;
  private voiceConnections: Map<string, unknown> = new Map();
  private pendingVoiceConnections: Map<string, PendingVoiceConnection> = new Map();
  private isShuttingDown: boolean = false;
  private reconnectAttempts: number = 0;
  private maxReconnectAttempts: number = 10;
  private reconnectInterval: number = 5000;
  private voiceHandler: DiscordVoiceHandler;

  // Reaction role mappings
  private reactionRoleMappings: Map<string, ReactionRoleMapping> = new Map();

  // Rich Presence state
  private richPresenceEnabled: boolean = false;
  private tsConnectedUsers: number = 0;
  private dcConnectedUsers: number = 0;
  private tsChannelsActive: number = 0;

  constructor(config: DiscordConfig) {
    super();
    this.config = config;
    this.rest = new REST({ version: '10' }).setToken(config.token);
    this.client = this.createClient();

    // Initialize voice handler
    this.voiceHandler = new DiscordVoiceHandler({
      sampleRate: 48000,
      channels: 2,
      frameSize: 960,
      bitrate: 64000,
    });

    // Forward voice events
    this.voiceHandler.on('audio:received', (packet) => {
      this.emit('discord:audio:received', packet);
    });

    this.voiceHandler.on('connection:state', (state) => {
      this.emit('discord:voice:state', state);
    });

    this.voiceHandler.on('connection:ready', (connection) => {
      this.emit('discord:voice:ready', connection);
    });

    this.voiceHandler.on('connection:closed', (guildId) => {
      this.emit('discord:voice:disconnect', guildId);
    });

    this.voiceHandler.on('connection:error', (error) => {
      this.emit('discord:voice:error', error);
    });

    this.setupEventHandlers();
  }

  getVoiceHandler(): DiscordVoiceHandler {
    return this.voiceHandler;
  }

  // ========================================================================
  // Public API
  // ========================================================================

  getClient(): Client<true> {
    return this.client;
  }

  getConfig(): DiscordConfig {
    return { ...this.config };
  }

  getState(): 'disconnected' | 'connecting' | 'connected' | 'reconnecting' | 'error' {
    return this.state;
  }

  isConnected(): boolean {
    return this.state === 'connected' && this.client.isReady();
  }

  getGuild(): Guild | null {
    return this.client.guilds.cache.get(this.config.guildId) || null;
  }

  getVoiceConnectionState(guildId: string): VoiceConnectionState | null {
    const connection = this.voiceHandler.getConnection(guildId);
    if (!connection) return null;
    return {
      connected: this.voiceHandler.isConnected(guildId),
      channelId: '', // Would need to track this
      guildId,
      selfDeaf: false,
      selfMute: false,
      speaking: false,
    };
  }

  // ========================================================================
  // Connection Management
  // ========================================================================

  async connect(): Promise<void> {
    if (this.state === 'connecting' || this.isConnected()) {
      logger.warn('Already connecting or connected');
      return;
    }

    this.state = 'connecting';
    logger.info('Connecting to Discord...');

    try {
      await this.client.login(this.config.token);
      // Ready event will complete initialization
    } catch (error) {
      this.state = 'error';
      throw new ConnectionError(
        `Discord login failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
        'discord.com',
        443,
        true
      );
    }
  }

  async disconnect(): Promise<void> {
    this.isShuttingDown = true;

    // Disconnect all voice connections
    await this.voiceHandler.disconnectAll();

    // Destroy client
    this.client.destroy();
    this.state = 'disconnected';
    logger.info('Disconnected from Discord');
  }

  async reconnect(): Promise<void> {
    if (this.isShuttingDown) return;

    this.reconnectAttempts++;

    if (this.reconnectAttempts > this.maxReconnectAttempts) {
      logger.error('Max reconnect attempts reached');
      this.state = 'error';
      this.emit('error', new ConnectionError(
        'Max reconnect attempts reached',
        'discord.com',
        443,
        false
      ));
      return;
    }

    this.state = 'reconnecting';
    logger.info('Reconnecting to Discord...', {
      attempt: this.reconnectAttempts,
      maxAttempts: this.maxReconnectAttempts,
    });

    setTimeout(async () => {
      try {
        await this.connect();
      } catch (error) {
        logger.error('Reconnection failed', { error });
      }
    }, this.reconnectInterval);
  }

  // ========================================================================
  // Command Registration
  // ========================================================================

  registerCommand(handler: SlashCommandHandler): void {
    if (this.commands[handler.data.name]) {
      logger.warn(`Command ${handler.data.name} already registered, overwriting`);
    }
    this.commands[handler.data.name] = handler;
    this.commandData.push(handler.data);
    logger.debug('Registered command', { name: handler.data.name });
  }

  registerCommands(handlers: SlashCommandHandler[]): void {
    for (const handler of handlers) {
      this.registerCommand(handler);
    }
  }

  async deployCommands(guildOnly: boolean = true): Promise<void> {
    logger.info('Deploying slash commands...', { guildOnly, count: this.commandData.length });

    try {
      if (guildOnly) {
        await this.rest.put(
          Routes.applicationGuildCommands(this.config.clientId, this.config.guildId),
          { body: this.commandData }
        );
        logger.info('Guild commands deployed');
      } else {
        await this.rest.put(
          Routes.applicationCommands(this.config.clientId),
          { body: this.commandData }
        );
        logger.info('Global commands deployed');
      }
    } catch (error) {
      logger.error('Failed to deploy commands', { error });
      throw new DiscordError('Failed to deploy commands', 500, 'Command deployment failed');
    }
  }

  // ========================================================================
  // Voice Connection
  // ========================================================================

  async joinVoiceChannel(guildId: string, channelId: string): Promise<unknown> {
    const guild = this.client.guilds.cache.get(guildId);
    if (!guild) {
      throw new BridgeError(`Guild not found: ${guildId}`, 'GUILD_NOT_FOUND', 404);
    }

    const channel = guild.channels.cache.get(channelId);
    if (!channel || !channel.isVoiceBased()) {
      throw new BridgeError(`Voice channel not found: ${channelId}`, 'CHANNEL_NOT_FOUND', 404);
    }

    // Check if already connected
    const existing = this.voiceHandler.getConnection(guildId);
    if (existing) {
      logger.warn('Already connected to voice channel in guild', { guildId });
      return existing;
    }

    logger.info('Joining voice channel', { guildId, channelId });

    try {
      const connection = await this.voiceHandler.joinChannel(guildId, channel);
      return connection;
    } catch (error) {
      logger.error('Failed to join voice channel', { error, guildId, channelId });
      throw new BridgeError(`Failed to join voice channel: ${error instanceof Error ? error.message : 'Unknown error'}`, 'VOICE_JOIN_FAILED', 500);
    }
  }

  async leaveVoiceChannel(guildId: string): Promise<void> {
    await this.voiceHandler.leaveChannel(guildId);
  }

  getVoiceConnection(guildId: string): unknown | undefined {
    return this.voiceHandler.getConnection(guildId);
  }

  getVoiceHandler(): DiscordVoiceHandler {
    return this.voiceHandler;
  }

  // ========================================================================
  // Message & Interaction Helpers
  // ========================================================================

  async sendMessage(channelId: string, content: string, options?: { embeds?: unknown[]; components?: unknown[] }): Promise<Message> {
    const channel = this.client.channels.cache.get(channelId);
    if (!channel || !channel.isTextBased()) {
      throw new BridgeError(`Text channel not found: ${channelId}`, 'CHANNEL_NOT_FOUND', 404);
    }
    return (channel as TextChannel).send({ content, ...options });
  }

  async sendEmbed(channelId: string, embed: unknown): Promise<Message> {
    return this.sendMessage(channelId, '', { embeds: [embed] });
  }

  async replyToInteraction(interaction: CommandInteraction, content: string, options?: { embeds?: unknown[]; ephemeral?: boolean }): Promise<void> {
    if (interaction.replied || interaction.deferred) {
      await interaction.editReply({ content, ...options });
    } else {
      await interaction.reply({ content, ...options });
    }
  }

  async sendThreadMessage(threadId: string, content: string, options?: { embeds?: unknown[] }): Promise<Message> {
    const thread = this.client.channels.cache.get(threadId);
    if (!thread || !thread.isThread()) {
      throw new BridgeError(`Thread not found: ${threadId}`, 'THREAD_NOT_FOUND', 404);
    }
    return (thread as ThreadChannel).send({ content, ...options });
  }

  // ========================================================================
  // Rich Presence
  // ========================================================================

  async setPresence(activity: { name: string; type: ActivityType; url?: string; state?: string; details?: string }): Promise<void> {
    await this.client.user.setPresence({
      activities: [{ ...activity }],
      status: 'online',
    });
    logger.debug('Updated presence', { activity });
  }

  async clearPresence(): Promise<void> {
    await this.client.user.setPresence({ activities: [], status: 'online' });
    this.richPresenceEnabled = false;
  }

  // ========================================================================
  // Rich Presence Methods
  // ========================================================================

  /**
   * Enable and update Rich Presence based on TeamSpeak/Discord bridge status
   */
  async updateRichPresence(data: {
    tsConnectedUsers?: number;
    dcConnectedUsers?: number;
    tsChannelsActive?: number;
    tsConnected?: boolean;
    dcConnected?: boolean;
  }): Promise<void> {
    if (!this.richPresenceEnabled) {
      this.richPresenceEnabled = true;
    }

    // Update internal state
    if (data.tsConnectedUsers !== undefined) this.tsConnectedUsers = data.tsConnectedUsers;
    if (data.dcConnectedUsers !== undefined) this.dcConnectedUsers = data.dcConnectedUsers;
    if (data.tsChannelsActive !== undefined) this.tsChannelsActive = data.tsChannelsActive;

    const tsConnected = data.tsConnected ?? true;
    const dcConnected = data.dcConnected ?? true;

    // Build activity status
    const activities = [];

    // Main bridge status activity
    const bridgeStatus = tsConnected && dcConnected ? '🟢 Online' : '🔴 Offline';
    const userCount = this.tsConnectedUsers + this.dcConnectedUsers;
    const channelInfo = this.tsChannelsActive > 0 ? ` | ${this.tsChannelsActive} TS channels` : '';

    activities.push({
      name: `${bridgeStatus} | ${userCount} users${channelInfo}`,
      type: ActivityType.Watching,
    });

    // Add TeamSpeak-specific activity if connected
    if (tsConnected) {
      activities.push({
        name: `${this.tsConnectedUsers} users on TeamSpeak`,
        type: ActivityType.Listening,
      });
    }

    // Add Discord-specific activity if connected
    if (dcConnected) {
      activities.push({
        name: `${this.dcConnectedUsers} users on Discord`,
        type: ActivityType.Listening,
      });
    }

    try {
      await this.client.user.setPresence({
        activities,
        status: tsConnected && dcConnected ? 'online' : 'idle',
        afk: false,
      });

      this.richPresenceEnabled = true;
      logger.debug('Rich Presence updated', {
        tsConnectedUsers: this.tsConnectedUsers,
        dcConnectedUsers: this.dcConnectedUsers,
        tsChannelsActive: this.tsChannelsActive,
        tsConnected,
        dcConnected,
      });
    } catch (error) {
      logger.error('Failed to update Rich Presence', { error });
    }
  }

  /**
   * Disable Rich Presence
   */
  async disableRichPresence(): Promise<void> {
    await this.clearPresence();
  }

  /**
   * Get current Rich Presence status
   */
  getRichPresenceStatus(): { enabled: boolean; tsUsers: number; dcUsers: number; tsChannels: number } {
    return {
      enabled: this.richPresenceEnabled,
      tsUsers: this.tsConnectedUsers,
      dcUsers: this.dcConnectedUsers,
      tsChannels: this.tsChannelsActive,
    };
  }

  // ========================================================================
  // Reaction Role Methods
  // ========================================================================

  /**
   * Add a reaction role mapping
   */
  addReactionRoleMapping(mapping: ReactionRoleMapping): void {
    const key = `${mapping.channelId}:${mapping.messageId}:${mapping.emoji}`;
    this.reactionRoleMappings.set(key, mapping);
    logger.debug('Added reaction role mapping', { key, mapping });
  }

  /**
   * Remove a reaction role mapping
   */
  removeReactionRoleMapping(channelId: string, messageId: string, emoji: string): boolean {
    const key = `${channelId}:${messageId}:${emoji}`;
    const deleted = this.reactionRoleMappings.delete(key);
    if (deleted) {
      logger.debug('Removed reaction role mapping', { key });
    }
    return deleted;
  }

  /**
   * Get a reaction role mapping
   */
  getReactionRoleMapping(channelId: string, messageId: string, emoji: string): ReactionRoleMapping | undefined {
    const key = `${channelId}:${messageId}:${emoji}`;
    return this.reactionRoleMappings.get(key);
  }

  /**
   * Get all reaction role mappings for a message
   */
  getReactionRoleMappingsForMessage(channelId: string, messageId: string): ReactionRoleMapping[] {
    const results: ReactionRoleMapping[] = [];
    const prefix = `${channelId}:${messageId}:`;
    for (const [key, mapping] of this.reactionRoleMappings) {
      if (key.startsWith(prefix)) {
        results.push(mapping);
      }
    }
    return results;
  }

  /**
   * Get all reaction role mappings
   */
  getAllReactionRoleMappings(): ReactionRoleMapping[] {
    return Array.from(this.reactionRoleMappings.values());
  }

  // ========================================================================
  // Reaction Role Event Handlers
  // ========================================================================

  /**
   * Handle reaction role addition
   */
  private async handleReactionRoleAdd(reaction: MessageReaction, user: User): Promise<void> {
    try {
      // Ignore bots
      if (user.bot) return;

      // Partial reaction - fetch if needed
      if (reaction.partial) {
        await reaction.fetch();
      }

      const channelId = reaction.message.channelId;
      const messageId = reaction.message.id;
      const emoji = reaction.emoji.name || reaction.emoji.id || '';

      // Find matching mapping
      const mapping = this.getReactionRoleMapping(channelId, reaction.message.id, reaction.emoji.name || reaction.emoji.id || '');
      if (!mapping) return;

      // Get the guild
      const guild = this.client.guilds.cache.get(this.config.guildId);
      if (!guild) return;

      // Get the member
      const member = await guild.members.fetch(user.id).catch(() => null);
      if (!member) return;

      // Check if the TeamSpeak bridge is available
      const bridge = (global as any).bridgeInstance;
      if (!bridge?.bridgeCore) return;

      // Check if user is linked to a TeamSpeak account
      const links = bridge.bridgeCore.getUserLinks();
      const userLink = links.find(l => l.discordId === user.id);
      if (!userLink) return;

      // Emit event for bridge core to handle the TS server group assignment
      this.emit('reactionrole:add', {
        userId: user.id,
        tsUniqueId: userLink.tsUniqueId,
        tsGroupName: mapping.tsGroupName,
        emoji: reaction.emoji.name || reaction.emoji.id || '',
        messageId: reaction.message.id,
        channelId: reaction.message.channelId,
      });

      logger.info('Reaction role added', {
        userId: user.id,
        emoji: reaction.emoji.name || reaction.emoji.id,
        tsGroupName: mapping.tsGroupName,
        tsUniqueId: userLink.tsUniqueId,
      });
    } catch (error) {
      logger.error('Error handling reaction role add', { error });
    }
  }

  /**
   * Handle reaction role removal
   */
  private async handleReactionRoleRemove(reaction: MessageReaction, user: User): Promise<void> {
    try {
      // Ignore bots
      if (user.bot) return;

      // Partial reaction - fetch if needed
      if (reaction.partial) {
        await reaction.fetch();
      }

      const channelId = reaction.message.channelId;
      const messageId = reaction.message.id;
      const emoji = reaction.emoji.name || reaction.emoji.id || '';

      // Find matching mapping
      const mapping = this.getReactionRoleMapping(channelId, reaction.message.id, reaction.emoji.name || reaction.emoji.id || '');
      if (!mapping) return;

      // Get the guild
      const guild = this.client.guilds.cache.get(this.config.guildId);
      if (!guild) return;

      // Get the member
      const member = await guild.members.fetch(user.id).catch(() => null);
      if (!member) return;

      // Check if the TeamSpeak bridge is available
      const bridge = (global as any).bridgeInstance;
      if (!bridge?.bridgeCore) return;

      // Check if user is linked to a TeamSpeak account
      const links = bridge.bridgeCore.getUserLinks();
      const userLink = links.find(l => l.discordId === user.id);
      if (!userLink) return;

      // Emit event for bridge core to handle the TS server group removal
      this.emit('reactionrole:remove', {
        userId: user.id,
        tsUniqueId: userLink.tsUniqueId,
        tsGroupName: mapping.tsGroupName,
        emoji: reaction.emoji.name || reaction.emoji.id || '',
        messageId: reaction.message.id,
        channelId: reaction.message.channelId,
      });

      logger.info('Reaction role removed', {
        userId: user.id,
        emoji: reaction.emoji.name || reaction.emoji.id,
        tsGroupName: mapping.tsGroupName,
        tsUniqueId: userLink.tsUniqueId,
      });
    } catch (error) {
      logger.error('Error handling reaction role remove', { error });
    }
  }

  // ========================================================================
  // Utility Methods
  // ========================================================================

  getUser(userId: string) {
    return this.client.users.cache.get(userId);
  }

  getMember(guildId: string, userId: string) {
    const guild = this.client.guilds.cache.get(guildId);
    return guild?.members.cache.get(userId);
  }

  getChannel(channelId: string) {
    return this.client.channels.cache.get(channelId);
  }

  getRole(guildId: string, roleId: string) {
    const guild = this.client.guilds.cache.get(guildId);
    return guild?.roles.cache.get(roleId);
  }

  // ========================================================================
  // Private Methods
  // ========================================================================

  private createClient(): Client<true> {
    const intents = [
      GatewayIntentBits.Guilds,
      GatewayIntentBits.GuildMembers,
      GatewayIntentBits.GuildVoiceStates,
      GatewayIntentBits.GuildMessages,
      GatewayIntentBits.MessageContent,
      GatewayIntentBits.GuildMessageReactions,
      GatewayIntentBits.DirectMessages,
      GatewayIntentBits.DirectMessageReactions,
    ];

    const partials = [
      Partials.Message,
      Partials.Channel,
      Partials.Reaction,
      Partials.GuildMember,
      Partials.ThreadMember,
    ];

    const client = new Client({
      intents,
      partials,
      allowedMentions: {
        parse: ['users', 'roles'],
        repliedUser: true,
      },
      makeCache: {
        ...Client.defaultMakeCache,
        GuildEmoji: 500,
        GuildSticker: 500,
      },
      sweepers: {
        ...Client.defaultSweepers,
        messages: { interval: 3600, lifetime: 1800 },
      },
    });

    return client;
  }

  private setupEventHandlers(): void {
    // Ready event
    this.client.once(Events.ClientReady, async () => {
      logger.info('Discord client ready', {
        user: this.client.user?.tag,
        guilds: this.client.guilds.cache.size,
        users: this.client.users.cache.size,
      });

      // Verify guild
      const guild = this.getGuild();
      if (!guild) {
        logger.error('Configured guild not found', { guildId: this.config.guildId });
        this.state = 'error';
        return;
      }

      logger.info('Guild found', { name: guild.name, id: guild.id, members: guild.memberCount });

      // Deploy commands
      try {
        await this.deployCommands(true);
      } catch (error) {
        logger.error('Failed to deploy commands on ready', { error });
      }

      this.reconnectAttempts = 0;
      this.state = 'connected';
      this.emit('ready');
      logger.info('Discord client initialization complete');
    });

    // Disconnect
    this.client.on(Events.ClientDisconnect, ({ code, reason }) => {
      logger.warn('Discord disconnected', { code, reason });
      this.state = 'disconnected';
      this.emit('disconnect', code, reason);

      if (!this.isShuttingDown) {
        this.reconnect();
      }
    });

    // Error
    this.client.on(Events.Error, (error) => {
      logger.error('Discord client error', { error: error.message });
      this.emit('error', error);
    });

    // Warn
    this.client.on(Events.Warn, (warning) => {
      logger.warn('Discord warning', { warning });
    });

    // Debug
    this.client.on(Events.Debug, (info) => {
      logger.debug('Discord debug', { info });
    });

    // =======================================================================
    // Interaction Handling
    // =======================================================================

    this.client.on(Events.InteractionCreate, async (interaction) => {
      if (!interaction.isChatInputCommand() && !interaction.isAutocomplete()) return;

      const command = this.commands[interaction.commandName];
      if (!command) {
        logger.warn('Unknown command', { command: interaction.commandName });
        return;
      }

      try {
        if (interaction.isAutocomplete()) {
          if (command.autocomplete) {
            await command.autocomplete(interaction);
          }
        } else if (interaction.isChatInputCommand()) {
          await command.execute(interaction);
        }
      } catch (error) {
        logger.error('Command execution error', { command: interaction.commandName, error });

        const errorMessage = 'An error occurred while executing this command.';
        if (interaction.replied || interaction.deferred) {
          await interaction.editReply({ content: errorMessage }).catch(() => {});
        } else {
          await interaction.reply({ content: errorMessage, ephemeral: true }).catch(() => {});
        }
      }
    });

    // =======================================================================
    // Message Events (for chat sync)
    // =======================================================================

    this.client.on(Events.MessageCreate, (message) => {
      if (message.author.bot) return;
      if (message.system) return;
      if (!message.inGuild()) return;

      this.emit('messageCreate', message);
    });

    this.client.on(Events.MessageUpdate, (oldMessage, newMessage) => {
      if (newMessage.author.bot) return;
      if (newMessage.system) return;
      if (!newMessage.inGuild()) return;

      this.emit('messageUpdate', oldMessage, newMessage);
    });

    this.client.on(Events.MessageDelete, (message) => {
      if (message.author?.bot) return;
      if (!message.inGuild()) return;

      this.emit('messageDelete', message);
    });

    // =======================================================================
    // Voice State Updates
    // =======================================================================

    this.client.on(Events.VoiceStateUpdate, (oldState, newState) => {
      this.emit('voiceStateUpdate', oldState, newState);
    });

    // =======================================================================
    // Reaction Events (for reaction roles)
    // =======================================================================

    this.client.on(Events.MessageReactionAdd, async (reaction, user) => {
      if (user.bot) return;
      this.emit('reactionAdd', reaction, user);

      // Handle reaction role addition
      await this.handleReactionRoleAdd(reaction, user);
    });

    this.client.on(Events.MessageReactionRemove, async (reaction, user) => {
      if (user.bot) return;
      this.emit('reactionRemove', reaction, user);

      // Handle reaction role removal
      await this.handleReactionRoleRemove(reaction, user);
    });

    // =======================================================================
    // Thread Events
    // =======================================================================

    this.client.on(Events.ThreadCreate, (thread) => {
      this.emit('threadCreate', thread);
    });

    this.client.on(Events.ThreadUpdate, (oldThread, newThread) => {
      this.emit('threadUpdate', oldThread, newThread);
    });

    this.client.on(Events.ThreadDelete, (thread) => {
      this.emit('threadDelete', thread);
    });

    // =======================================================================
    // Member Events
    // =======================================================================

    this.client.on(Events.GuildMemberAdd, (member) => {
      this.emit('guildMemberAdd', member);
    });

    this.client.on(Events.GuildMemberRemove, (member) => {
      this.emit('guildMemberRemove', member);
    });

    this.client.on(Events.GuildMemberUpdate, (oldMember, newMember) => {
      this.emit('guildMemberUpdate', oldMember, newMember);
    });

    // =======================================================================
    // Presence Updates
    // =======================================================================

    this.client.on(Events.PresenceUpdate, (oldPresence, newPresence) => {
      this.emit('presenceUpdate', oldPresence, newPresence);
    });

    // Raw events
    this.client.on(Events.Raw, (packet) => {
      this.emit('raw', packet);
    });
  }
}

// ========================================================================
// Factory Function
// ========================================================================

export function createDiscordClient(config: DiscordConfig): DiscordClient {
  return new DiscordClient(config);
}