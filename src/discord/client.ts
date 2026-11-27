/**
 * Discord Client
 * Discord.js v14 bot with gateway intents, slash commands, and voice support
 */

import { Client, GatewayIntentBits, Partials, Collection, Events, REST, Routes, ActivityType, VoiceChannel, VoiceState, Guild, GuildMember, Message, TextChannel, ThreadChannel, Interaction, CommandInteraction, AutocompleteInteraction } from 'discord.js';
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

const logger = createLogger('discord:client');

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

  constructor(config: DiscordConfig) {
    super();
    this.config = config;
    this.rest = new REST({ version: '10' }).setToken(config.token);
    this.client = this.createClient();
    this.setupEventHandlers();
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
    const connection = this.voiceConnections.get(guildId);
    if (!connection) return null;
    // Return basic state - actual implementation depends on voice adapter
    return {
      connected: true,
      channelId: '',
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
    for (const [guildId] of this.voiceConnections) {
      await this.leaveVoiceChannel(guildId);
    }

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

    const voiceChannel = channel as VoiceChannel;

    // Check if already connected
    const existing = this.voiceConnections.get(guildId);
    if (existing) {
      logger.warn('Already connected to voice channel in guild', { guildId });
      return existing;
    }

    logger.info('Joining voice channel', { guildId, channelId });

    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.pendingVoiceConnections.delete(guildId);
        reject(new BridgeError('Voice connection timeout', 'VOICE_TIMEOUT', 504));
      }, 30000);

      const pending: PendingVoiceConnection = { guildId, channelId, resolve, reject, timeout };
      this.pendingVoiceConnections.set(guildId, pending);

      // Join voice channel using Discord.js voice
      try {
        const { joinVoiceChannel } = require('@discordjs/voice');
        const connection = joinVoiceChannel({
          channelId: voiceChannel.id,
          guildId: guild.id,
          adapterCreator: guild.voiceAdapterCreator,
          selfDeaf: false,
          selfMute: false,
        });

        connection.on('stateChange', (oldState, newState) => {
          logger.debug('Voice connection state change', { oldState: oldState.status, newState: newState.status });
        });

        connection.on('error', (error) => {
          logger.error('Voice connection error', { error });
          this.emit('voiceError', guildId, error);
        });

        connection.on('disconnect', () => {
          logger.info('Voice connection disconnected', { guildId });
          this.voiceConnections.delete(guildId);
          this.emit('voiceDisconnect', guildId);
        });

        this.voiceConnections.set(guildId, connection);

        const pendingConn = this.pendingVoiceConnections.get(guildId);
        if (pendingConn) {
          clearTimeout(pendingConn.timeout);
          this.pendingVoiceConnections.delete(guildId);
          pendingConn.resolve(connection);
        }

        resolve(connection);
      } catch (error) {
        const pendingConn = this.pendingVoiceConnections.get(guildId);
        if (pendingConn) {
          clearTimeout(pendingConn.timeout);
          this.pendingVoiceConnections.delete(guildId);
          pendingConn.reject(error);
        }
        reject(error);
      }
    });
  }

  async leaveVoiceChannel(guildId: string): Promise<void> {
    const connection = this.voiceConnections.get(guildId);
    if (connection) {
      // @ts-ignore - destroy method exists on voice connection
      connection.destroy();
      this.voiceConnections.delete(guildId);
      logger.info('Left voice channel', { guildId });
    }
  }

  getVoiceConnection(guildId: string): unknown | undefined {
    return this.voiceConnections.get(guildId);
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

    this.client.on(Events.MessageReactionAdd, (reaction, user) => {
      if (user.bot) return;
      this.emit('reactionAdd', reaction, user);
    });

    this.client.on(Events.MessageReactionRemove, (reaction, user) => {
      if (user.bot) return;
      this.emit('reactionRemove', reaction, user);
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