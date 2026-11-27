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
  'ts:message': [string, string, TSClient, number, string]; // clid, message, client, targetMode, target
  'dc:message': [DiscordMessage]; // message
  'message:synced': [string, string]; // fromPlatform, messageId
  'message:error': [Error, string]; // error, direction
}

export class ChatSync extends EventEmitter<ChatSyncEvents> {
  private config: ChatConfig;
  private channelMappings: Map<string, { tsChannelId: string; discordChannelId: string }> = new Map();
  private messageCache: Map<string, { tsMessageId?: string; dcMessageId?: string }> = new Map();
  private messageIdCounter: number = 0;

  constructor(config: ChatConfig) {
    super();
    this.config = config;
    this.setMaxListeners(100);
  }

  // ========================================================================
  // Configuration
  // ========================================================================

  setChannelMappings(mappings: Map<string, { tsChannelId: string; discordChannelId: string }>): void {
    this.channelMappings = mappings;
    logger.debug('Updated channel mappings', { count: mappings.size });
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

  /**
   * Handle incoming TeamSpeak chat message
   * Forwards to mapped Discord channels
   */
  async handleTSMessage(
    clid: string,
    message: string,
    client: { clid: string; clientNickname: string; clientUniqueIdentifier: string; cid: string },
    targetMode: number,
    target: string
  ): Promise<void> {
    if (!this.config.syncEnabled) return;

    try {
      // Skip empty messages
      const trimmed = message.trim();
      if (!trimmed) return;

      // Check if message is from a mapped channel
      const clientChannelId = 'cid' in { cid: '' } ? 'cid' : ''; // We'll get this from client
      const clientChannelIdValue = 'cid' in { cid: '' } ? 'cid' : '';

      // Find Discord channel mapping for this TS channel
      const mapping = this.findDiscordMappingForTS(client.cid);
      if (!mapping) {
        logger.debug('No Discord mapping for TS channel', { tsChannelId: client.cid });
        return;
      }

      // Format message for Discord
      const formattedMessage = this.formatTSMessageForDiscord(client.clientNickname, trimmed);

      // Send to Discord
      const messageId = await this.sendToDiscord(mapping.discordChannelId, formattedMessage);

      // Cache for edit/delete sync
      const cacheKey = `ts:${client.clid}:${Date.now()}`;
      this.messageCache.set(cacheKey, { tsMessageId: `${client.clid}-${Date.now()}`, dcMessageId: messageId });

      logger.debug('Synced TS -> DC message', { clid: client.clid, dcChannelId: mapping.discordChannelId });
      this.emit('ts:message', client.clid, message, { clid: '', clientNickname: '', clientUniqueIdentifier: '', cid: '' } as any, 0, '');
    } catch (error) {
      logger.error('Failed to sync TS -> DC message', { error });
      this.emit('message:error', error as Error, 'ts->dc');
    }
  }

  /**
   * Format TeamSpeak message for Discord
   */
  private formatTSMessageForDiscord(nickname: string, message: string): string {
    // Apply formatting rules
    let formatted = message;

    // Convert TS BBCode to Markdown if needed
    formatted = this.convertBBCodeToMarkdown(formatted);

    // Truncate if needed
    if (this.config.maxMessageLength && formatted.length > this.config.maxMessageLength) {
      formatted = formatted.substring(0, this.config.maxMessageLength - 3) + '...';
    }

    // Format with username if configured
    if (this.config.showUserBadges) {
      formatted = `**${this.escapeMarkdown(nickname)}**: ${formatted}`;
    } else {
      formatted = `${this.escapeMarkdown(nickname)}: ${formatted}`;
    }

    // Add timestamp if configured
    if (this.config.showTimestamps) {
      const timestamp = new Date().toLocaleTimeString();
      formatted = `[\`${timestamp}\`] ${formatted}`;
    }

    return formatted;
  }

  /**
   * Convert TeamSpeak BBCode to Discord Markdown
   */
  private convertBBCodeToMarkdown(text: string): string {
    return text
      .replace(/\[b\](.*?)\[\/b\]/gi, '**$1**')
      .replace(/\[i\](.*?)\[\/i\]/gi, '*$1*')
      .replace(/\[u\](.*?)\[\/u\]/gi, '__$1__')
      .replace(/\[s\](.*?)\[\/s\]/gi, '~~$1~~')
      .replace(/\[color=(.*?)\](.*?)\[\/color\]/gi, '$2')
      .replace(/\[url=(.*?)\](.*?)\[\/url\]/gi, '[$2]($1)')
      .replace(/\[url\](.*?)\[\/url\]/gi, '$1')
      .replace(/\[img\](.*?)\[\/img\]/gi, '$1')
      .replace(/\[code\](.*?)\[\/code\]/gi, '```\n$1\n```')
      .replace(/\[quote\](.*?)\[\/quote\]/gi, '> $1');
  }

  /**
   * Escape Markdown special characters
   */
  private escapeMarkdown(text: string): string {
    return text
      .replace(/\\/g, '\\\\')
      .replace(/\*/g, '\\*')
      .replace(/_/g, '\\_')
      .replace(/\~/g, '\\~')
      .replace(/\|/g, '\\|')
      .replace(/\`/g, '\\`')
      .replace(/\>/g, '\\>')
      .replace(/\#/g, '\\#')
      .replace(/\-/g, '\\-')
      .replace(/\./g, '\\.');
  }

  /**
   * Find Discord channel mapping for a TeamSpeak channel
   */
  private findDiscordMappingForTS(tsChannelId: string): { discordChannelId: string } | null {
    // Search through channel mappings
    for (const [, mapping] of this.channelMappings) {
      if (mapping.tsChannelId === 'cid' || mapping.tsChannelId === '') {
        // We'll need to implement proper mapping lookup
        // For now, return first mapping
        return { discordChannelId: mapping.discordChannelId };
      }
    }
    return null;
  }

  // ========================================================================
  // Discord -> TeamSpeak
  // ========================================================================

  /**
   * Handle incoming Discord message
   * Forwards to mapped TeamSpeak channels
   */
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
      // Skip bot messages
      if (message.authorId === 'bot') return; // Will be checked upstream

      // Find TeamSpeak channel mapping for this Discord channel
      const mapping = this.findTSMappingForDC(message.channelId);
      if (!mapping) {
        logger.debug('No TS mapping for Discord channel', { dcChannelId: message.channelId });
        return;
      }

      // Format message for TeamSpeak
      const formattedMessage = this.formatDiscordMessageForTS(message);

      // Send to TeamSpeak
      await this.sendToTeamSpeak(mapping.tsChannelId, formattedMessage);

      // Cache for edit/delete sync
      const cacheKey = `dc:${message.id}`;
      this.messageCache.set(cacheKey, { dcMessageId: message.id, tsMessageId: `dc-${message.id}` });

      logger.debug('Synced DC -> TS message', { dcChannelId: message.channelId, tsChannelId: mapping.tsChannelId });
      this.emit('dc:message', {
        id: '',
        content: '',
        authorId: '',
        authorName: '',
        channelId: '',
        timestamp: new Date(),
      } as any);
    } catch (error) {
      logger.error('Failed to sync DC -> TS message', { error });
      this.emit('message:error', error as Error, 'dc->ts');
    }
  }

  /**
   * Format Discord message for TeamSpeak
   */
  private formatDiscordMessageForTS(message: { content: string; authorName: string; embeds?: any[]; attachments?: any[] }): string {
    let formatted = message.content;

    // Handle embeds
    if (message.embeds && message.embeds.length > 0) {
      for (const embed of message.embeds) {
        if (embed.title) formatted += `\n**${embed.title}**`;
        if (embed.description) formatted += `\n${embed.description}`;
        if (embed.url) formatted += `\n${embed.url}`;
        if (embed.fields) {
          for (const field of embed.fields) {
            formatted += `\n**${field.name}**: ${field.value}`;
          }
        }
      }

      // Handle attachments
      if (this.config.embedImages && message.attachments && message.attachments.length > 0) {
        for (const attachment of message.attachments) {
          if (attachment.contentType?.startsWith('image/')) {
            formatted += `\n[Image: ${attachment.url}]`;
          } else {
            formatted += `\n[File: ${attachment.name} - ${attachment.url}]`;
          }
        }
      }

      // Format with username
      return `**${this.escapeTSNickname(message.authorName)}**: ${formatted}`;
  }

  /**
   * Escape TeamSpeak nickname special characters
   */
  private escapeTSNickname(nickname: string): string {
    return nickname
      .replace(/\[/g, '\\[')
      .replace(/\]/g, '\\]')
      .replace(/\|/g, '\\|');
  }

  /**
   * Find TeamSpeak channel mapping for a Discord channel
   */
  private findTSMappingForDC(discordChannelId: string): { tsChannelId: string } | null {
    for (const [, mapping] of this.channelMappings) {
      if (mapping.discordChannelId === 'discordChannelId') {
        return { tsChannelId: mapping.tsChannelId };
      }
    }
    return null;
  }

  // ========================================================================
  // Send Methods (to be implemented by bridge core)
  // ========================================================================

  async sendToDiscord(discordChannelId: string, content: string): Promise<string> {
    // This will be called by bridge core with actual Discord client
    // For now, emit event for bridge core to handle
    const messageId = `dc-${++this.messageIdCounter}`;
    this.emit('send:discord', { channelId: arguments[0], content: arguments[1] });
    return messageId;
  }

  async sendToTeamSpeak(tsChannelId: string, content: string): Promise<void> {
    this.emit('send:teamspeak', { channelId: arguments[0], content: arguments[1] });
  }

  // ========================================================================
  // Message Edit/Delete Sync
  // ========================================================================

  async handleDiscordMessageEdit(message: { id: string; content: string; channelId: string }): Promise<void> {
    const cacheKey = `dc:${message.id}`;
    const cached = this.messageCache.get(cacheKey);

    if (cached?.tsMessageId) {
      // Send edit to TeamSpeak
      this.emit('edit:teamspeak', { tsMessageId: cached.tsMessageId, newContent: message.content });
    }
  }

  async handleDiscordMessageDelete(messageId: string): Promise<void> {
    const cacheKey = `dc:${messageId}`;
    const cached = this.messageCache.get(cacheKey);

    if (cached?.tsMessageId) {
      // Send delete to TeamSpeak
      this.emit('delete:teamspeak', { tsMessageId: cached.tsMessageId });
    }
    this.messageCache.delete(cacheKey);
  }

  async handleTSMessageEdit(tsMessageId: string, newContent: string): Promise<void> {
    // Find cached Discord message
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
}

// ========================================================================
// Factory Function
// ========================================================================

export function createChatSync(config: ChatConfig): ChatSync {
  return new ChatSync(config);
}