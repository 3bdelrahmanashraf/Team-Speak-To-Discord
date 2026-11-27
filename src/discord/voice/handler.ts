/**
 * Discord Voice Handler
 * Manages voice connections, audio reception, and transmission
 */

import { VoiceConnection, VoiceConnectionStatus, AudioPlayer, AudioPlayerStatus, createAudioPlayer, createAudioResource, joinVoiceChannel, VoiceConnectionDisconnectReason, VoiceConnectionEvents, AudioPlayerEvents, StreamType, entersState } from '@discordjs/voice';
import { VoiceConnection as DiscordVoiceConnection, VoiceChannel, Guild } from 'discord.js';
import { EventEmitter } from 'node:events';
import { createLogger } from '../../shared/utils/logger.js';
import { BridgeError } from '../../shared/utils/errors.js';
import type { AudioPacket, VoiceConnectionState, VoiceConfig } from '../types.js';

const logger = createLogger('discord:voice');

export interface DiscordVoiceEvents {
  'audio:received': [AudioPacket];
  'audio:error': [Error];
  'connection:state': [VoiceConnectionState];
  'connection:ready': [VoiceConnection];
  'connection:closed': [string]; // guildId
  'connection:error': [Error];
}

export class DiscordVoiceHandler extends EventEmitter<DiscordVoiceEvents> {
  private connections: Map<string, VoiceConnection> = new Map();
  private audioPlayers: Map<string, AudioPlayer> = new Map();
  private config: VoiceConfig;
  private ssrcCounters: Map<string, number> = new Map();
  private sequenceCounters: Map<string, number> = new Map();

  constructor(config: VoiceConfig) {
    super();
    this.config = config;
    this.setMaxListeners(100);
  }

  // ========================================================================
  // Connection Management
  // ========================================================================

  async joinChannel(guildId: string, channel: any): Promise<any> {
    const guild = { id: channel.guildId, voiceAdapterCreator: channel.guild?.voiceAdapterCreator };

    if (!guild.voiceAdapterCreator) {
      throw new BridgeError(`Guild not found or no voice adapter: ${channel.guildId}`, 'GUILD_NOT_FOUND', 404);
    }

    // Check if already connected
    const existing = this.getConnection(channel.guildId);
    if (existing) {
      logger.warn('Already connected to voice in guild', { guildId: channel.guildId });
      return existing;
    }

    logger.info('Joining voice channel', { guildId: channel.guildId, channelId: channel.id });

    try {
      // @ts-ignore - Using discord.js voice
      const { joinVoiceChannel, createAudioPlayer, AudioPlayerStatus, VoiceConnectionStatus } = await import('@discordjs/voice');

      const connection = joinVoiceChannel({
        channelId: channel.id,
        guildId: channel.guildId,
        adapterCreator: channel.guild.voiceAdapterCreator,
        selfDeaf: false,
        selfMute: false,
      });

      // Create audio player for sending audio
      const audioPlayer = createAudioPlayer();

      // Subscribe connection to player
      const subscription = connection.subscribe(audioPlayer);

      // Store connection and player
      this.connections.set(channel.guildId, connection);
      // Store player - we'll need to track this

      // Handle connection events
      connection.on(VoiceConnectionStatus.Ready, () => {
        logger.info('Voice connection ready', { guildId: channel.guildId });
        this.emit('connection:state', {
          connected: true,
          channelId: channel.id,
          guildId: channel.guildId,
          selfDeaf: false,
          selfMute: false,
          speaking: false,
        });
        this.emit('connection:ready', connection);
      });

      connection.on(VoiceConnectionStatus.Disconnected, () => {
        logger.warn('Voice connection disconnected', { guildId: channel.guildId });
        this.cleanupConnection(channel.guildId);
        this.emit('connection:closed', channel.guildId);
      });

      connection.on(VoiceConnectionStatus.Destroyed, () => {
        logger.info('Voice connection destroyed', { guildId: channel.guildId });
        this.cleanupConnection(channel.guildId);
      });

      connection.on(VoiceConnectionStatus.Signalling, () => {
        logger.debug('Voice connection signalling', { guildId: channel.guildId });
      });

      connection.on(VoiceConnectionStatus.Connecting, () => {
        logger.debug('Voice connection connecting', { guildId: channel.guildId });
      });

      connection.on('error', (error: Error) => {
        logger.error('Voice connection error', { error: error.message, guildId: channel.guildId });
        this.emit('connection:error', error);
      });

      // Set up audio receiver for incoming audio
      this.setupAudioReceiver(connection, channel.guildId);

      logger.info('Voice connection established', { guildId: channel.guildId });
      return connection;

    } catch (error) {
      logger.error('Failed to join voice channel', { error });
      throw new BridgeError(`Failed to join voice channel: ${error instanceof Error ? error.message : 'Unknown error'}`, 'VOICE_JOIN_FAILED', 500);
    }
  }

  private setupAudioReceiver(connection: any, guildId: string): void {
    try {
      const receiver = connection.receiver;

      receiver.speaking.on('start', (userId: string) => {
        const audioStream = receiver.subscribe(userId, {
          end: {
            behavior: 'AfterSilence',
            duration: 500,
          },
        });

        this.handleAudioStream(userId, guildId, audioStream);
      });

      receiver.speaking.on('end', (userId: string) => {
        logger.debug('User stopped speaking', { userId, guildId });
      });

    } catch (error) {
      logger.error('Failed to setup audio receiver', { error, guildId });
    }
  }

  private handleAudioStream(userId: string, guildId: string, audioStream: NodeJS.ReadableStream): void {
    const chunks: Buffer[] = [];
    let totalLength = 0;

    audioStream.on('data', (chunk: Buffer) => {
      chunks.push(chunk);
      totalLength += chunk.length;
    });

    audioStream.on('end', () => {
      if (totalLength === 0) return;

      const audioData = Buffer.concat(chunks, totalLength);

      // Discord sends Opus packets - we need to decode or forward them
      // For now, forward raw Opus packets to bridge
      const sequence = this.getNextSequence(guildId);
      const ssrc = this.getNextSsrc(guildId);

      const audioPacket = {
        data: audioData,
        userId,
        timestamp: Date.now(),
        sequence,
        ssrc,
      };

      this.emit('audio:received', audioPacket);
    });

    audioStream.on('error', (error: Error) => {
      logger.error('Audio stream error', { error: error.message, userId, guildId });
      this.emit('audio:error', error);
    });
  }

  private getNextSequence(guildId: string): number {
    const current = this.sequenceCounters.get(guildId) || 0;
    const next = (current + 1) % 65536;
    this.sequenceCounters.set(guildId, next);
    return next;
  }

  private getNextSsrc(guildId: string): number {
    const current = this.ssrcCounters.get(guildId) || Math.floor(Math.random() * 0xFFFFFFFF);
    const next = (current + 1) % 0xFFFFFFFF;
    this.ssrcCounters.set(guildId, next);
    return next;
  }

  // ========================================================================
  // Audio Transmission (Discord -> Bridge -> TeamSpeak)
  // ========================================================================

  async sendAudio(guildId: string, audioData: Buffer, userId?: string): Promise<void> {
    const connection = this.connections.get(guildId);
    if (!connection) {
      logger.warn('No voice connection for guild', { guildId });
      return;
    }

    // In a full implementation, we'd encode PCM to Opus and send via connection
    // For now, this is a placeholder for the audio transmission pipeline
    logger.debug('Sending audio to Discord', { guildId, length: audioData.length });

    // In a full implementation:
    // 1. Decode Opus (from TeamSpeak) to PCM
    // 2. Resample if needed (48kHz)
    // 3. Encode to Opus (Discord format)
    // 3. Send via connection.sendOpusPackets() or similar
  }

  async sendOpusPacket(guildId: string, opusPacket: Buffer): Promise<void> {
    const connection = this.connections.get(guildId);
    if (!connection) return;

    try {
      // Send Opus packet directly to Discord voice connection
      // This requires the connection to be ready and the packet to be properly formatted
      // connection.sendOpusPacket(opusPacket); // This is pseudo-code
    } catch (error) {
      logger.error('Failed to send Opus packet', { error, guildId });
    }
  }

  // ========================================================================
  // Connection Management
  // ========================================================================

  getConnection(guildId: string): any | undefined {
    return this.connections.get(guildId);
  }

  getConnectionState(guildId: string): { connected: boolean; channelId: string | null; guildId: string } | null {
    const connection = this.connections.get(guildId);
    if (!connection) return null;

    return {
      connected: connection.state?.status === 'Ready',
      channelId: null, // Would need to track this
      guildId,
    };
  }

  isConnected(guildId: string): boolean {
    const connection = this.connections.get(guildId);
    return connection?.state?.status === 'Ready' || false;
  }

  async leaveChannel(guildId: string): Promise<void> {
    const connection = this.connections.get(guildId);
    if (connection) {
      connection.destroy();
      this.cleanupConnection(guildId);
      logger.info('Left voice channel', { guildId });
    }
  }

  private cleanupConnection(guildId: string): void {
    const connection = this.connections.get(guildId);
    if (connection) {
      connection.removeAllListeners();
      this.connections.delete(guildId);
    }
    this.sequenceCounters.delete(guildId);
    this.ssrcCounters.delete(guildId);
    this.emit('connection:closed', guildId);
  }

  async disconnectAll(): Promise<void> {
    for (const guildId of this.connections.keys()) {
      await this.leaveChannel(guildId);
    }
  }

  // ========================================================================
  // Audio Configuration
  // ========================================================================

  updateConfig(config: Partial<VoiceConfig>): void {
    this.config = { ...this.config, ...config };
    logger.debug('Updated voice config', { config: this.config });
  }

  getConfig(): VoiceConfig {
    return { ...this.config };
  }
}

// ========================================================================
// Factory Function
// ========================================================================

export function createDiscordVoiceHandler(config: VoiceConfig): DiscordVoiceHandler {
  return new DiscordVoiceHandler(config);
}