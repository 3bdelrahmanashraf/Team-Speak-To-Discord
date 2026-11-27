/**
 * Opus Encoder/Decoder Module
 * High-quality audio processing for TeamSpeak ↔ Discord bridge
 */

import { createLogger } from '../../shared/utils/logger.js';
import { BridgeError } from '../../shared/utils/errors.js';
import type { AudioConfig, AudioFrame, OpusEncoder, OpusDecoder } from '../types/index.js';

const logger = createLogger('bridge:audio:opus');

// Opus application types
export enum OpusApplication {
  VOIP = 2048,
  AUDIO = 2049,
  RESTRICTED_LOWDELAY = 2051,
}

// Opus bandwidth types
export enum OpusBandwidth {
  NARROWBAND = 1101,      // 4 kHz
  MEDIUMBAND = 1102,      // 6 kHz
  WIDEBAND = 1103,        // 8 kHz
  SUPERWIDEBAND = 1104,   // 12 kHz
  FULLBAND = 1105,        // 20 kHz
}

// Opus signal types
export enum OpusSignal {
  AUTO = -1000,
  VOICE = 3001,
  MUSIC = 3002,
}

interface OpusEncoderHandle {
  encode: (pcm: Float32Array, frameSize: number, maxDataBytes: number) => Uint8Array;
  encodeFloat: (pcm: Float32Array, frameSize: number, maxDataBytes: number) => Uint8Array;
  delete: () => void;
  ctl: (request: number, value?: number) => number;
}

interface OpusDecoderHandle {
  decode: (data: Uint8Array, frameSize: number, decodeFEC: boolean) => Float32Array;
  decodeFloat: (data: Uint8Array, frameSize: number, decodeFEC: boolean) => Float32Array;
  delete: () => void;
  ctl: (request: number, value?: number) => number;
}

// Dynamic import for @discordjs/opus
let OpusModule: {
  OpusEncoder: new (sampleRate: number, channels: number, application: OpusApplication) => OpusEncoderHandle;
  OpusDecoder: new (sampleRate: number, channels: number) => OpusDecoderHandle;
} | null = null;

async function loadOpusModule(): Promise<void> {
  if (OpusModule) return;

  try {
    const opus = await import('@discordjs/opus');
    OpusModule = {
      OpusEncoder: opus.OpusEncoder,
      OpusDecoder: opus.OpusDecoder,
    };
    logger.debug('Opus module loaded successfully');
  } catch (error) {
    logger.error('Failed to load Opus module', { error });
    throw new BridgeError(
      'Opus module not available. Install @discordjs/opus',
      'OPUS_MODULE_MISSING',
      500
    );
  }
}

/**
 * Opus Encoder for encoding PCM to Opus
 */
export class OpusEncoderWrapper implements OpusEncoder {
  private encoder: OpusEncoderHandle;
  private sampleRate: number;
  private channels: number;
  private frameSize: number;
  private application: OpusApplication;

  constructor(config: AudioConfig) {
    if (!OpusModule) {
      throw new BridgeError('Opus module not loaded. Call loadOpusModule() first.', 'OPUS_NOT_LOADED', 500);
    }

    this.sampleRate = config.sampleRate;
    this.channels = config.channels;
    this.frameSize = config.frameSize;
    this.application = OpusApplication.VOIP;

    this.encoder = new OpusModule.OpusEncoder(
      this.sampleRate,
      this.channels,
      this.application
    );

    // Configure encoder for voice
    this.encoder.ctl(4002, OpusBandwidth.FULLBAND);     // SET_BANDWIDTH
    this.encoder.ctl(4008, OpusSignal.VOICE);           // SET_SIGNAL
    this.encoder.ctl(4012, 1);                          // SET_DTX (Discontinuous Transmission)
    this.encoder.ctl(4014, 1);                          // SET_FEC (Forward Error Correction)
    this.encoder.ctl(4034, config.bitrate || 64000);    // SET_BITRATE

    logger.info('Opus encoder initialized', {
      sampleRate: this.sampleRate,
      channels: this.channels,
      frameSize: this.frameSize,
      bitrate: config.bitrate,
      application: this.application,
    });
  }

  /**
   * Encode PCM audio frame to Opus
   */
  encode(pcm: Float32Array): Uint8Array {
    if (pcm.length !== this.frameSize * this.channels) {
      throw new BridgeError(
        `Invalid PCM frame size. Expected ${this.frameSize * this.channels}, got ${pcm.length}`,
        'INVALID_FRAME_SIZE',
        400
      );
    }

    try {
      const encoded = this.encoder.encodeFloat(pcm, this.frameSize, 4000);
      return encoded;
    } catch (error) {
      logger.error('Opus encoding failed', { error });
      throw new BridgeError(
        `Opus encoding failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
        'ENCODING_FAILED',
        500
      );
    }
  }

  /**
   * Encode PCM audio frame to Opus (Int16 input)
   */
  encodeInt16(pcm: Int16Array): Uint8Array {
    if (pcm.length !== this.frameSize * this.channels) {
      throw new BridgeError(
        `Invalid PCM frame size. Expected ${this.frameSize * this.channels}, got ${pcm.length}`,
        'INVALID_FRAME_SIZE',
        400
      );
    }

    try {
      const encoded = this.encoder.encode(pcm, this.frameSize, 4000);
      return encoded;
    } catch (error) {
      logger.error('Opus encoding failed', { error });
      throw new BridgeError(
        `Opus encoding failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
        'ENCODING_FAILED',
        500
      );
    }
  }

  /**
   * Set encoder bitrate dynamically
   */
  setBitrate(bitrate: number): void {
    this.encoder.ctl(4034, bitrate);
    logger.debug('Opus encoder bitrate changed', { bitrate });
  }

  /**
   * Get current encoder bitrate
   */
  getBitrate(): number {
    return this.encoder.ctl(4033); // OPUS_GET_BITRATE
  }

  /**
   * Set encoder complexity (0-10, higher = better quality but more CPU)
   */
  setComplexity(complexity: number): void {
    if (complexity < 0 || complexity > 10) {
      throw new BridgeError('Complexity must be between 0 and 10', 'INVALID_COMPLEXITY', 400);
    }
    this.encoder.ctl(4010, complexity); // OPUS_SET_COMPLEXITY
  }

  /**
   * Enable/disable Forward Error Correction
   */
  setFEC(enabled: boolean): void {
    this.encoder.ctl(4014, enabled ? 1 : 0);
  }

  /**
   * Enable/disable Discontinuous Transmission
   */
  setDTX(enabled: boolean): void {
    this.encoder.ctl(4012, enabled ? 1 : 0);
  }

  /**
   * Set expected packet loss percentage (0-100)
   */
  setPacketLoss(percent: number): void {
    if (percent < 0 || percent > 100) {
      throw new BridgeError('Packet loss must be between 0 and 100', 'INVALID_PACKET_LOSS', 400);
    }
    this.encoder.ctl(4016, percent); // OPUS_SET_PACKET_LOSS_PERC
  }

  /**
   * Get encoder sample rate
   */
  getSampleRate(): number {
    return this.sampleRate;
  }

  /**
   * Get encoder frame size
   */
  getFrameSize(): number {
    return this.frameSize;
  }

  /**
   * Get encoder channels
   */
  getChannels(): number {
    return this.channels;
  }

  /**
   * Clean up encoder resources
   */
  destroy(): void {
    this.encoder.delete();
    logger.debug('Opus encoder destroyed');
  }
}

/**
 * Opus Decoder for decoding Opus to PCM
 */
export class OpusDecoderWrapper implements OpusDecoder {
  private decoder: OpusDecoderHandle;
  private sampleRate: number;
  private channels: number;
  private frameSize: number;

  constructor(sampleRate: number, channels: number, frameSize: number) {
    if (!OpusModule) {
      throw new BridgeError('Opus module not loaded. Call loadOpusModule() first.', 'OPUS_NOT_LOADED', 500);
    }

    this.sampleRate = sampleRate;
    this.channels = channels;
    this.frameSize = frameSize;

    this.decoder = new OpusModule.OpusDecoder(this.sampleRate, this.channels);

    // Enable PLC (Packet Loss Concealment)
    this.decoder.ctl(4000, 1); // OPUS_SET_PLC

    logger.info('Opus decoder initialized', {
      sampleRate: this.sampleRate,
      channels: this.channels,
      frameSize: this.frameSize,
    });
  }

  /**
   * Decode Opus frame to PCM
   */
  decode(data: Uint8Array): Float32Array {
    if (data.length === 0) {
      // Generate silence for missing packets (PLC)
      return this.decodeSilence();
    }

    try {
      const decoded = this.decoder.decodeFloat(data, this.frameSize, false);
      return decoded;
    } catch (error) {
      logger.error('Opus decoding failed', { error });
      // Return silence on decode error
      return this.decodeSilence();
    }
  }

  /**
   * Decode Opus frame with Forward Error Correction
   */
  decodeWithFEC(data: Uint8Array): Float32Array {
    if (data.length === 0) {
      return this.decodeSilence();
    }

    try {
      const decoded = this.decoder.decodeFloat(data, this.frameSize, true);
      return decoded;
    } catch (error) {
      logger.error('Opus FEC decoding failed', { error });
      return this.decodeSilence();
    }
  }

  /**
   * Generate silence frame
   */
  private decodeSilence(): Float32Array {
    return new Float32Array(this.frameSize * this.channels);
  }

  /**
   * Reset decoder state
   */
  reset(): void {
    this.decoder.ctl(4028); // OPUS_RESET_STATE
    logger.debug('Opus decoder state reset');
  }

  /**
   * Get decoder sample rate
   */
  getSampleRate(): number {
    return this.sampleRate;
  }

  /**
   * Get decoder frame size
   */
  getFrameSize(): number {
    return this.frameSize;
  }

  /**
   * Get decoder channels
   */
  getChannels(): number {
    return this.channels;
  }

  /**
   * Clean up decoder resources
   */
  destroy(): void {
    this.decoder.delete();
    logger.debug('Opus decoder destroyed');
  }
}

/**
 * Create Opus encoder and decoder pair
 */
export async function createOpusPair(config: AudioConfig): Promise<{
  encoder: OpusEncoderWrapper;
  decoder: OpusDecoderWrapper;
}> {
  await loadOpusModule();

  const encoder = new OpusEncoderWrapper(config);
  const decoder = new OpusDecoderWrapper(config.sampleRate, config.channels, config.frameSize);

  return { encoder, decoder };
}

/**
 * Convert audio format for TeamSpeak compatibility
 * TeamSpeak typically uses 16-bit PCM at 48kHz
 */
export function convertToTSFormat(audio: Float32Array): Int16Array {
  const output = new Int16Array(audio.length);
  for (let i = 0; i < audio.length; i++) {
    const sample = Math.max(-1, Math.min(1, audio[i]));
    output[i] = sample < 0 ? sample * 0x8000 : sample * 0x7FFF;
  }
  return output;
}

/**
 * Convert TeamSpeak 16-bit PCM to Float32
 */
export function convertFromTSFormat(audio: Int16Array): Float32Array {
  const output = new Float32Array(audio.length);
  for (let i = 0; i < audio.length; i++) {
    output[i] = audio[i] / (audio[i] < 0 ? 0x8000 : 0x7FFF);
  }
  return output;
}

/**
 * Resample audio to different sample rate (simple linear interpolation)
 */
export function resample(
  input: Float32Array,
  inputSampleRate: number,
  outputSampleRate: number
): Float32Array {
  if (inputSampleRate === outputSampleRate) {
    return input;
  }

  const ratio = inputSampleRate / outputSampleRate;
  const outputLength = Math.round(input.length / ratio);
  const output = new Float32Array(outputLength);

  for (let i = 0; i < outputLength; i++) {
    const inputIndex = i * ratio;
    const index = Math.floor(inputIndex);
    const fraction = inputIndex - index;

    if (index + 1 < input.length) {
      output[i] = input[index] * (1 - fraction) + input[index + 1] * fraction;
    } else {
      output[i] = input[index];
    }
  }

  return output;
}