/**
 * Chat Synchronization Module
 * Handles bidirectional message relay between TeamSpeak and Discord
 */

import { EventEmitter } from 'node:events';
import { createLogger } from '../../shared/utils/logger.js';
import { BridgeError } from '../../shared/utils/errors.js';
import type { ChatConfig, ChannelMapping, TSClient, DiscordMessage } from '../../shared/types.js';

const logger = createLogger('bridge:chat');

export interface ChatSyncEvents {
  'ts:message': [string, string, TSClient, number, string];
  'dc:message': [DiscordMessage];
  'message:synced': [string, string];
  'message:error': [Error, string];
  'mention:ts_poke': [string, string]; // discordUserId, tsUniqueId
  'command:execute': [string, string, string[]]; // platform, command, args
  'reaction:sync': [string, string, string]; // source, messageId, emoji
}

export interface MessageMapping {
  tsMessageId?: string;
  dcMessageId?: string;
  tsThreadId?: string;
  dcThreadId?: string;
  timestamp: number;
  authorTsId?: string;
  authorDcId?: string;
}

export interface MentionMapping {
  discordUserId: string;
  tsUniqueId: string;
  tsNickname: string;
}

export class ChatSync extends EventEmitter<ChatSyncEvents> {
  private config: ChatConfig;
  private channelMappings: Map<string, { tsChannelId: string; discordChannelId: string }> = new Map();
  private messageCache: Map<string, MessageMapping> = new Map();
  private mentionMappings: Map<string, MentionMapping> = new Map();
  private messageIdCounter: number = 0;
  private pendingCommands: Map<string, { resolve: (result: any) => void; reject: (error: Error) => void }> = new Map();

  constructor(config: ChatConfig) {
    super();
    this.config = config;
    this.setMaxListeners(100);
  }

  setChannelMappings(mappings: Map<string, { tsChannelId: string; discordChannelId: string }>): void {
    this.channelMappings = mappings;
    logger.debug('Updated channel mappings', { count: mappings.size });
  }

  setMentionMappings(mappings: Map<string, MentionMapping>): void {
    this.mentionMappings = mappings;
    logger.debug('Updated mention mappings', { count: mappings.size });
  }

  updateConfig(config: Partial<ChatConfig>): void {
    this.config = { ...this.config, ...config };
  }

  getConfig(): typeof this.config {
    return { ...this.config };
  }

  // ========================================================================
  // TeamSpeak -> Discord
  // ========================================================================

  async handleTSMessage(
    clid: string,
    message: string,
    client: { clid: string; clientNickname: string; clientUniqueIdentifier: string; cid: string },
    targetMode: number,
    target: string
  ): Promise<void> {
    if (!this.config.syncEnabled) return;
    try {
      const trimmed = message.trim();
      if (!trimmed) return;

      const mapping = this.findDiscordMappingForTS(client.cid);
      if (!mapping) {
        logger.debug('No Discord mapping for TS channel', { tsChannelId: client.cid });
        return;
      }

      // Check for commands in TS message
      if (trimmed.startsWith('!') || trimmed.startsWith('/')) {
        await this.handleTSCommand(clid, trimmed, client, mapping);
        return;
      }

      const formattedMessage = this.formatTSMessageForDiscord(client.clientNickname, trimmed);
      const messageId = await this.sendToDiscord(mapping.discordChannelId, formattedMessage);

      const cacheKey = `ts:${client.clid}:${Date.now()}`;
      this.messageCache.set(cacheKey, {
        tsMessageId: `${client.clid}-${Date.now()}`,
        dcMessageId: messageId,
        timestamp: Date.now(),
        authorTsId: client.clientUniqueIdentifier,
      });

      logger.debug('Synced TS -> DC message', { clid: client.clid, dcChannelId: mapping.discordChannelId });
      this.emit('ts:message', client.clid, message, client, targetMode, target);
    } catch (error) {
      logger.error('Failed to sync TS -> DC message', { error });
      this.emit('message:error', error as Error, 'ts->dc');
    }
  }

  private async handleTSCommand(
    clid: string,
    message: string,
    client: { clid: string; clientNickname: string; clientUniqueIdentifier: string; cid: string },
    mapping: { discordChannelId: string }
  ): Promise<void> {
    const parts = message.slice(1).split(' ');
    const command = parts[0].toLowerCase();
    const args = parts.slice(1);

    logger.debug('TS command received', { clid, command, args });

    // Emit command for bridge to handle
    this.emit('command:execute', 'teamspeak', command, args);

    // Send response to Discord
    const response = await this.executeCommand(command, args, client);
    if (response) {
      await this.sendToDiscord(mapping.discordChannelId, `🤖 **${client.clientNickname}** executed \`${command}\`:\n${response}`);
    }
  }

  private async executeCommand(command: string, args: string[], client: any): Promise<string | null> {
    switch (command) {
      case 'help':
        return 'Available commands: `!help`, `!ping`, `!info`, `!users`, `!channels`';
      case 'ping':
        return '🏓 Pong!';
      case 'info':
        return `Bridge is running. Connected to TeamSpeak and Discord.`;
      case 'users':
        return `TS Users: ${this.getTSUserCount()}, Discord Users: ${this.getDCUserCount()}`;
      case 'channels':
        return `Mapped channels: ${this.channelMappings.size}`;
      default:
        return `Unknown command: ${command}. Use !help for list.`;
    }
  }

  private formatTSMessageForDiscord(nickname: string, message: string): string {
    let formatted = message;
    formatted = this.convertBBCodeToMarkdown(formatted);
    formatted = this.convertTSMentionsToDiscord(formatted);

    if (this.config.maxMessageLength && formatted.length > this.config.maxMessageLength) {
      formatted = formatted.substring(0, this.config.maxMessageLength - 3) + '...';
    }

    if (this.config.showUserBadges) {
      formatted = `**${this.escapeMarkdown(nickname)}**: ${formatted}`;
    } else {
      formatted = `${this.escapeMarkdown(nickname)}: ${formatted}`;
    }

    if (this.config.showTimestamps) {
      const timestamp = new Date().toLocaleTimeString();
      formatted = `[\`${timestamp}\`] ${formatted}`;
    }

    return formatted;
  }

  private convertBBCodeToMarkdown(text: string): string {
    return text
      // Basic formatting
      .replace(/\[b\](.*?)\[\/b\]/gi, '**$1**')
      .replace(/\[i\](.*?)\[\/i\]/gi, '*$1*')
      .replace(/\[u\](.*?)\[\/u\]/gi, '__$1__')
      .replace(/\[s\](.*?)\[\/s\]/gi, '~~$1~~')
      // Colors - strip or convert to markdown
      .replace(/\[color=(.*?)\](.*?)\[\/color\]/gi, '$2')
      // Links
      .replace(/\[url=(.*?)\](.*?)\[\/url\]/gi, '[$2]($1)')
      .replace(/\[url\](.*?)\[\/url\]/gi, '$1')
      // Images
      .replace(/\[img\](.*?)\[\/img\]/gi, '![]($1)')
      // Code blocks
      .replace(/\[code\](.*?)\[\/code\]/gi, '```\n$1\n```')
      .replace(/\[code=(.*?)\](.*?)\[\/code\]/gi, '```$1\n$2\n```')
      // Quotes
      .replace(/\[quote\](.*?)\[\/quote\]/gi, '> $1')
      .replace(/\[quote=(.*?)\](.*?)\[\/quote\]/gi, '> **$1**:\n> $2')
      // Lists
      .replace(/\[list\](.*?)\[\/list\]/gi, '$1')
      .replace(/\[\*\]/gi, '\n• ')
      .replace(/\[list=1\](.*?)\[\/list\]/gi, '$1')
      .replace(/\[\#\]/gi, '\n1. ')
      // Spoilers
      .replace(/\[spoiler\](.*?)\[\/spoiler\]/gi, '||$1||')
      .replace(/\[spoiler=(.*?)\](.*?)\[\/spoiler\]/gi, '||**$1**: $2||')
      // Tables (basic)
      .replace(/\[table\](.*?)\[\/table\]/gi, '$1')
      .replace(/\[tr\](.*?)\[\/tr\]/gi, '\n|$1|')
      .replace(/\[td\](.*?)\[\/td\]/gi, '$1|')
      // Size
      .replace(/\[size=(.*?)\](.*?)\[\/size\]/gi, '$2')
      // Alignment
      .replace(/\[center\](.*?)\[\/center\]/gi, '$1')
      .replace(/\[left\](.*?)\[\/left\]/gi, '$1')
      .replace(/\[right\](.*?)\[\/right\]/gi, '$1');
  }

  private convertTSMentionsToDiscord(text: string): string {
    // Convert @username to @username (Discord handles mentions via ID)
    // This is a placeholder - actual mention resolution happens via mentionMappings
    return text;
  }

  private escapeMarkdown(text: string): string {
    return text
      .replace(/\\/g, '\\\\')
      .replace(/\*/g, '\\*')
      .replace(/_/g, '\\_')
      .replace(/~/g, '\\~')
      .replace(/\|/g, '\\|')
      .replace(/`/g, '\\`')
      .replace(/>/g, '\\>')
      .replace(/#/g, '\\#')
      .replace(/-/g, '\\-')
      .replace(/\./g, '\\.');
  }

  private findDiscordMappingForTS(tsChannelId: string): { discordChannelId: string } | null {
    for (const [, mapping] of this.channelMappings) {
      if (mapping.tsChannelId === tsChannelId) {
        return { discordChannelId: mapping.discordChannelId };
      }
    }
    return null;
  }

  // ========================================================================
  // Discord -> TeamSpeak
  // ========================================================================

  async handleDiscordMessage(message: {
    id: string;
    content: string;
    authorId: string;
    authorName: string;
    channelId: string;
    guildId?: string;
    timestamp: Date;
    editedTimestamp?: Date | null;
    embeds?: any[];
    attachments?: any[];
    mentions?: { users: string[]; roles: string[] };
    referencedMessage?: { id: string } | null;
  }): Promise<void> {
    if (!this.config.syncEnabled) return;
    try {
      const trimmed = message.content.trim();
      if (!trimmed) return;

      // Handle Discord commands
      if (trimmed.startsWith('!') || trimmed.startsWith('/')) {
        await this.handleDiscordCommand(message);
        return;
      }

      // Handle mentions - convert @user to TS poke
      if (message.mentions?.users?.length > 0) {
        await this.handleMentions(message);
      }

      const mapping = this.findTSMappingForDC(message.channelId);
      if (!mapping) {
        logger.debug('No TS mapping for Discord channel', { dcChannelId: message.channelId });
        return;
      }

      const formattedMessage = this.formatDiscordMessageForTS(message);
      await this.sendToTeamSpeak(mapping.tsChannelId, formattedMessage);

      const cacheKey = `dc:${message.id}`;
      this.messageCache.set(cacheKey, {
        dcMessageId: message.id,
        tsMessageId: `dc-${message.id}`,
        timestamp: Date.now(),
        authorDcId: message.authorId,
      });

      logger.debug('Synced DC -> TS message', { dcChannelId: message.channelId, tsChannelId: mapping.tsChannelId });
      this.emit('dc:message', message);
    } catch (error) {
      logger.error('Failed to sync DC -> TS message', { error });
      this.emit('message:error', error as Error, 'dc->ts');
    }
  }

  private async handleDiscordCommand(message: any): Promise<void> {
    const parts = message.content.slice(1).split(' ');
    const command = parts[0].toLowerCase();
    const args = parts.slice(1);

    logger.debug('Discord command received', { authorId: message.authorId, command, args });

    // Handle mention commands
    if (command === 'poke' && message.mentions?.users?.[0]) {
      const targetUserId = message.mentions.users[0];
      const mapping = this.mentionMappings.get(targetUserId);
      if (mapping) {
        this.emit('mention:ts_poke', message.authorId, mapping.tsUniqueId);
        await this.sendToDiscord(message.channelId, `🔔 Poked **${mapping.tsNickname}** on TeamSpeak!`);
      } else {
        await this.sendToDiscord(message.channelId, '❌ User not linked to TeamSpeak.');
      }
      return;
    }

    this.emit('command:execute', 'discord', command, args);

    const response = await this.executeCommand(command, args, { id: message.authorId, name: message.authorName });
    if (response) {
      await this.sendToDiscord(message.channelId, response);
    }
  }

  private async handleMentions(message: any): Promise<void> {
    for (const userId of message.mentions.users) {
      const mapping = this.mentionMappings.get(userId);
      if (mapping) {
        this.emit('mention:ts_poke', message.authorId, mapping.tsUniqueId);
        logger.debug('Discord mention -> TS poke', { discordUserId: userId, tsUniqueId: mapping.tsUniqueId });
      }
    }
  }

  private formatDiscordMessageForTS(message: { content: string; authorName: string; embeds?: any[]; attachments?: any[] }): string {
    let formatted = message.content;

    // Convert markdown to BBCode
    formatted = this.convertMarkdownToBBCode(formatted);

    // Handle embeds
    if (message.embeds && message.embeds.length > 0) {
      for (const embed of message.embeds) {
        if (embed.title) formatted += `\n[b]${embed.title}[/b]`;
        if (embed.description) formatted += `\n${embed.description}`;
        if (embed.url) formatted += `\n${embed.url}`;
        if (embed.fields) {
          for (const field of embed.fields) {
            formatted += `\n[b]${field.name}[/b]: ${field.value}`;
          }
        }
        if (embed.footer?.text) formatted += `\n[i]${embed.footer.text}[/i]`;
      }

    // Handle attachments
    if (this.config.embedImages && message.attachments && message.attachments.length > 0) {
      for (const attachment of message.attachments) {
        if (attachment.contentType?.startsWith('image/')) {
          formatted += `\n[img]${attachment.url}[/img]`;
        } else {
          formatted += `\n[url=${attachment.url}][File: ${attachment.name}][/url]`;
        }
      }

    // Add author
    if (this.config.showUserBadges) {
      formatted = `[b]${this.escapeTSNickname(message.authorName)}[/b]: ${formatted}`;
    } else {
      formatted = `${this.escapeTSNickname(message.authorName)}: ${formatted}`;
    }

    if (this.config.showTimestamps) {
      const timestamp = new Date().toLocaleTimeString();
      formatted = `[${timestamp}] ${formatted}`;
    }

    return formatted;
  }

  private convertMarkdownToBBCode(text: string): string {
    return text
      // Basic formatting
      .replace(/\*\*(.*?)\*\*/g, '[b]$1[/b]')
      .replace(/\*(.*?)\*/g, '[i]$1[/i]')
      .replace(/__(.*?)__/g, '[u]$1[/u]')
      .replace(/~~(.*?)~~/g, '[s]$1[/s]')
      // Code
      .replace(/`([^`]+)`/g, '[code]$1[/code]')
      .replace(/```([\s\S]*?)```/g, '[code]$1[/code]')
      // Links
      .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '[url=$2]$1[/url]')
      // Images
      .replace(/!\[([^\]]*)\]\(([^)]+)\)/g, '[img]$2[/img]')
      // Quotes
      .replace(/^>\s*(.+)$/gm, '[quote]$1[/quote]')
      // Lists
      .replace(/^•\s+(.+)$/gm, '[*]$1')
      .replace(/^\d+\.\s+(.+)$/gm, '[#]$1')
      // Spoilers
      .replace(/\|\|([^|]+)\|\|/g, '[spoiler]$1[/spoiler]')
      // Headers
      .replace(/^###\s+(.+)$/gm, '[size=14][b]$1[/b][/size]')
      .replace(/^##\s+(.+)$/gm, '[size=16][b]$1[/b][/size]')
      .replace(/^#\s+(.+)$/gm, '[size=18][b]$1[/b][/size]');
  }

  private escapeTSNickname(nickname: string): string {
    return nickname
      .replace(/\[/g, '\\[')
      .replace(/\]/g, '\\]')
      .replace(/\|/g, '\\|')
      .replace(/:/g, '\\:');
  }

  private findTSMappingForDC(discordChannelId: string): { tsChannelId: string } | null {
    for (const [, mapping] of this.channelMappings) {
      if (mapping.discordChannelId === discordChannelId) {
        return { tsChannelId: mapping.tsChannelId };
      }
    }
    return null;
  }

  // ========================================================================
  // Message Editing & Deletion
  // ========================================================================

  async handleDiscordMessageEdit(message: { id: string; content: string; channelId: string }): Promise<void> {
    const cacheKey = `dc:${message.id}`;
    const cached = this.messageCache.get(cacheKey);
    if (cached?.tsMessageId) {
      this.emit('edit:teamspeak', { tsMessageId: cached.tsMessageId, newContent: message.content });
    }
  }

  async handleDiscordMessageDelete(messageId: string): Promise<void> {
    const cacheKey = `dc:${messageId}`;
    const cached = this.messageCache.get(cacheKey);
    if (cached?.tsMessageId) {
      this.emit('delete:teamspeak', { tsMessageId: cached.tsMessageId });
    }
    this.messageCache.delete(cacheKey);
  }

  async handleTSMessageEdit(tsMessageId: string, newContent: string): Promise<void> {
    for (const [key, value] of this.messageCache) {
      if (value.tsMessageId === tsMessageId && value.dcMessageId) {
        this.emit('edit:discord', { dcMessageId: value.dcMessageId, newContent });
        break;
      }
    }
  }

  async handleTSMessageDelete(tsMessageId: string): Promise<void> {
    for (const [key, value] of this.messageCache) {
      if (value.tsMessageId === tsMessageId && value.dcMessageId) {
        this.emit('delete:discord', { dcMessageId: value.dcMessageId });
        this.messageCache.delete(key);
        break;
      }
    }
  }

  // ========================================================================
  // Reactions
  // ========================================================================

  async handleDiscordReactionAdd(reaction: { messageId: string; emoji: { name?: string; id?: string } }, userId: string): Promise<void> {
    const cacheKey = `dc:${reaction.messageId}`;
    const cached = this.messageCache.get(cacheKey);
    if (cached?.tsMessageId) {
      const emoji = reaction.emoji.name || reaction.emoji.id || '';
      this.emit('reaction:sync', 'discord', cached.tsMessageId, emoji);
    }
  }

  async handleDiscordReactionRemove(reaction: { messageId: string; emoji: { name?: string; id?: string } }, userId: string): Promise<void> {
    // Could emit reaction removal for TS
  }

  // ========================================================================
  // Threads
  // ========================================================================

  async handleDiscordThreadCreate(thread: { id: string; name: string; parentId: string }): Promise<void> {
    const mapping = this.findTSMappingForDC(thread.parentId);
    if (mapping) {
      logger.debug('Discord thread created for mapped channel', { threadId: thread.id, tsChannelId: mapping.tsChannelId });
      // Could auto-create TS channel or notify
    }
  }

  async handleDiscordThreadDelete(thread: { id: string; parentId: string }): Promise<void> {
    // Handle thread deletion
  }

  // ========================================================================
  // Sending
  // ========================================================================

  async sendToDiscord(discordChannelId: string, content: string, options?: { embeds?: any[]; files?: any[] }): Promise<string> {
    const messageId = `dc-${++this.messageIdCounter}`;
    this.emit('send:discord', { channelId: discordChannelId, content, options });
    return messageId;
  }

  async sendToTeamSpeak(tsChannelId: string, content: string): Promise<void> {
    this.emit('send:teamspeak', { channelId: tsChannelId, content });
  }

  async sendTSPrivateMessage(targetId: string, message: string): Promise<void> {
    this.emit('send:teamspeak:private', { targetId, message });
  }

  async sendDiscordDM(userId: string, message: string): Promise<void> {
    this.emit('send:discord:dm', { userId, message });
  }

  // ========================================================================
  // Utility
  // ========================================================================

  getCacheStats(): { size: number; entries: string[] } {
    return {
      size: this.messageCache.size,
      entries: Array.from(this.messageCache.keys()),
    };
  }

  clearCache(): void {
    this.messageCache.clear();
  }

  getTSUserCount(): number {
    // Would be provided by bridge
    return 0;
  }

  getDCUserCount(): number {
    return 0;
  }

  // Command bridge
  registerCommandHandler(command: string, handler: (args: string[], context: any) => Promise<string>): void {
    // Custom command handlers
  }
}

export function createChatSync(config: ChatConfig): ChatSync {
  return new ChatSync(config);
}