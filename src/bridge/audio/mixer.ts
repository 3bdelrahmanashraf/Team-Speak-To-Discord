/**
 * Audio Mixer Module
 * Mixes multiple TeamSpeak client audio streams into single Discord stream
 */

import { createLogger } from '../../shared/utils/logger.js';
import { BridgeError } from '../../shared/utils/errors.js';

const logger = createLogger('bridge:audio:mixer');

export interface MixerConfig {
  sampleRate: number;
  frameSize: number;
  channels: number;
  maxInputs: number;
  enableAGC: boolean;       // Automatic Gain Control
  enableLimiter: boolean;   // Peak limiter
  targetLevel: number;      // Target RMS level (0-1)
}

export interface MixerInput {
  id: string;
  audio: Float32Array;
  volume: number;           // 0-1
  pan: number;              // -1 to 1 (stereo)
  muted: boolean;
  lastActivity: number;
}

export interface MixerOutput {
  audio: Float32Array;
  activeInputs: number;
  peakLevel: number;
  rmsLevel: number;
}

const DEFAULT_CONFIG: MixerConfig = {
  sampleRate: 48000,
  frameSize: 960,
  channels: 2,
  maxInputs: 50,
  enableAGC: true,
  enableLimiter: true,
  targetLevel: 0.3,
};

/**
 * Audio Mixer for combining multiple input streams
 */
export class AudioMixer {
  private config: MixerConfig;
  private inputs: Map<string, MixerInput> = new Map();
  private gainHistory: number[] = [];
  private readonly gainHistorySize: number = 100;
  private currentGain: number = 1.0;
  private limiterThreshold: number = 0.95;
  private frameCount: number = 0;

  constructor(config: Partial<MixerConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    logger.info('Audio mixer initialized', this.config);
  }

  /**
   * Add or update an input stream
   */
  addInput(id: string, volume: number = 1.0, pan: number = 0): void {
    if (this.inputs.size >= this.config.maxInputs && !this.inputs.has(id)) {
      logger.warn('Max inputs reached, cannot add new input', { id, currentInputs: this.inputs.size });
      return;
    }

    this.inputs.set(id, {
      id,
      audio: new Float32Array(this.config.frameSize * this.config.channels),
      volume: Math.max(0, Math.min(1, volume)),
      pan: Math.max(-1, Math.min(1, pan)),
      muted: false,
      lastActivity: Date.now(),
    });

    logger.debug('Mixer input added', { id, totalInputs: this.inputs.size });
  }

  /**
   * Remove an input stream
   */
  removeInput(id: string): boolean {
    const deleted = this.inputs.delete(id);
    if (deleted) {
      logger.debug('Mixer input removed', { id, remainingInputs: this.inputs.size });
    }
    return deleted;
  }

  /**
   * Update input audio data
   */
  updateInput(id: string, audio: Float32Array): void {
    const input = this.inputs.get(id);
    if (!input) {
      // Auto-add if not exists
      this.addInput(id);
      this.updateInput(id, audio);
      return;
    }

    if (audio.length !== this.config.frameSize * this.config.channels) {
      throw new BridgeError(
        `Invalid audio frame size. Expected ${this.config.frameSize * this.config.channels}, got ${audio.length}`,
        'INVALID_FRAME_SIZE',
        400
      );
    }

    input.audio.set(audio);
    input.lastActivity = Date.now();
  }

  /**
   * Set input volume
   */
  setInputVolume(id: string, volume: number): void {
    const input = this.inputs.get(id);
    if (input) {
      input.volume = Math.max(0, Math.min(1, volume));
    }
  }

  /**
   * Set input pan (stereo positioning)
   */
  setInputPan(id: string, pan: number): void {
    const input = this.inputs.get(id);
    if (input) {
      input.pan = Math.max(-1, Math.min(1, pan));
    }
  }

  /**
   * Mute/unmute input
   */
  setInputMuted(id: string, muted: boolean): void {
    const input = this.inputs.get(id);
    if (input) {
      input.muted = muted;
    }
  }

  /**
   * Mix all active inputs into single output
   */
  mix(): MixerOutput {
    const outputSize = this.config.frameSize * this.config.channels;
    const output = new Float32Array(outputSize);
    let activeInputs = 0;
    let peakLevel = 0;
    let rmsSum = 0;

    // Clean up inactive inputs (no activity for 5 seconds)
    const now = Date.now();
    for (const [id, input] of this.inputs) {
      if (now - input.lastActivity > 5000) {
        this.inputs.delete(id);
        logger.debug('Removed inactive mixer input', { id });
      }
    }

    // Mix all active inputs
    for (const input of this.inputs.values()) {
      if (input.muted) continue;

      const inputAudio = input.audio;
      const volume = input.volume;

      if (this.config.channels === 2) {
        // Stereo mixing with panning
        const leftGain = volume * (1 - Math.max(0, input.pan)) * 0.707;
        const rightGain = volume * (1 + Math.min(0, input.pan)) * 0.707;

        for (let i = 0; i < outputSize; i += 2) {
          output[i] += inputAudio[i] * leftGain;
          output[i + 1] += inputAudio[i + 1] * rightGain;
        }
      } else {
        // Mono mixing
        for (let i = 0; i < outputSize; i++) {
          output[i] += inputAudio[i] * volume;
        }
      }

      activeInputs++;
    }

    // Apply Automatic Gain Control (AGC)
    if (this.config.enableAGC && activeInputs > 0) {
      this.applyAGC(output);
    }

    // Apply limiter
    if (this.config.enableLimiter) {
      this.applyLimiter(output);
    }

    // Calculate output levels
    for (let i = 0; i < outputSize; i++) {
      const abs = Math.abs(output[i]);
      peakLevel = Math.max(peakLevel, abs);
      rmsSum += output[i] * output[i];
    }

    const rmsLevel = Math.sqrt(rmsSum / outputSize);

    this.frameCount++;

    return {
      audio: output,
      activeInputs,
      peakLevel,
      rmsLevel,
    };
  }

  /**
   * Automatic Gain Control - maintains consistent output level
   */
  private applyAGC(output: Float32Array): void {
    // Calculate current RMS
    let rmsSum = 0;
    for (let i = 0; i < output.length; i++) {
      rmsSum += output[i] * output[i];
    }
    const currentRMS = Math.sqrt(rmsSum / output.length);

    if (currentRMS > 0.001) {
      // Calculate desired gain
      const targetGain = this.config.targetLevel / currentRMS;

      // Smooth gain changes
      const smoothedGain = this.currentGain * 0.99 + targetGain * 0.01;

      // Clamp gain
      this.currentGain = Math.max(0.1, Math.min(10, smoothedGain));

      // Apply gain
      for (let i = 0; i < output.length; i++) {
        output[i] *= this.currentGain;
      }

      // Track gain history
      this.gainHistory.push(this.currentGain);
      if (this.gainHistory.length > this.gainHistorySize) {
        this.gainHistory.shift();
      }
    }
  }

  /**
   * Peak limiter - prevents clipping
   */
  private applyLimiter(output: Float32Array): void {
    for (let i = 0; i < output.length; i++) {
      if (output[i] > this.limiterThreshold) {
        output[i] = this.limiterThreshold;
      } else if (output[i] < -this.limiterThreshold) {
        output[i] = -this.limiterThreshold;
      }
    }
  }

  /**
   * Get current mixer status
   */
  getStatus(): {
    activeInputs: number;
    totalInputs: number;
    currentGain: number;
    limiterThreshold: number;
    frameCount: number;
  } {
    let active = 0;
    for (const input of this.inputs.values()) {
      if (!input.muted) active++;
    }

    return {
      activeInputs: active,
      totalInputs: this.inputs.size,
      currentGain: this.currentGain,
      limiterThreshold: this.limiterThreshold,
      frameCount: this.frameCount,
    };
  }

  /**
   * Clear all inputs
   */
  clear(): void {
    this.inputs.clear();
    this.currentGain = 1.0;
    this.gainHistory = [];
    this.frameCount = 0;
    logger.debug('Audio mixer cleared');
  }

  /**
   * Get list of input IDs
   */
  getInputIds(): string[] {
    return Array.from(this.inputs.keys());
  }

  /**
   * Get input info
   */
  getInputInfo(id: string): MixerInput | undefined {
    return this.inputs.get(id);
  }
}

/**
 * Voice Activity aware mixer - only mixes active speakers
 */
export class VADAwareMixer extends AudioMixer {
  private vadThreshold: number = 0.01;
  private maxActiveSpeakers: number = 3;

  constructor(config: Partial<MixerConfig> = {}) {
    super(config);
  }

  /**
   * Set VAD threshold for determining active speakers
   */
  setVADThreshold(threshold: number): void {
    this.vadThreshold = Math.max(0, Math.min(1, threshold));
  }

  /**
   * Set maximum number of simultaneous speakers to mix
   */
  setMaxActiveSpeakers(max: number): void {
    this.maxActiveSpeakers = Math.max(1, max);
  }

  /**
   * Mix with VAD awareness - only mix top N active speakers
   */
  mixWithVAD(vadResults: Map<string, { isSpeech: boolean; probability: number }>): MixerOutput {
    // Sort inputs by speech probability
    const sortedInputs = Array.from(this.inputs.entries())
      .filter(([id]) => {
        const vad = vadResults.get(id);
        return vad?.isSpeech ?? true; // Default to active if no VAD data
      })
      .sort((a, b) => {
        const probA = vadResults.get(a[0])?.probability ?? 0;
        const probB = vadResults.get(b[0])?.probability ?? 0;
        return probB - probA; // Descending
      });

    // Temporarily mute inputs beyond maxActiveSpeakers
    const mutedIds: string[] = [];
    for (let i = this.maxActiveSpeakers; i < sortedInputs.length; i++) {
      const input = this.inputs.get(sortedInputs[i][0]);
      if (input && !input.muted) {
        input.muted = true;
        mutedIds.push(sortedInputs[i][0]);
      }
    }

    // Mix
    const result = this.mix();

    // Restore muted state
    for (const id of mutedIds) {
      const input = this.inputs.get(id);
      if (input) input.muted = false;
    }

    return result;
  }
}

/**
 * Audio Router - routes mixed audio to Discord voice connection
 */
export interface RouterConfig {
  sampleRate: number;
  frameSize: number;
  channels: number;
}

export class AudioRouter {
  private config: RouterConfig;
  private outputCallback: ((audio: Float32Array) => void) | null = null;
  private discordEncoder: any = null; // Opus encoder for Discord
  private stats: {
    framesSent: number;
    bytesSent: number;
    errors: number;
  } = { framesSent: 0, bytesSent: 0, errors: 0 };

  constructor(config: RouterConfig) {
    this.config = config;
  }

  /**
   * Set output callback (e.g., Discord voice sender)
   */
  setOutputCallback(callback: (audio: Float32Array) => void): void {
    this.outputCallback = callback;
  }

  /**
   * Set Discord Opus encoder
   */
  setDiscordEncoder(encoder: any): void {
    this.discordEncoder = encoder;
  }

  /**
   * Route mixed audio to output
   */
  route(mixerOutput: { audio: Float32Array; activeInputs: number }): void {
    if (!this.outputCallback) {
      return;
    }

    try {
      const audio = mixerOutput.audio;

      // Encode to Opus if encoder available
      if (this.discordEncoder && this.discordEncoder.encode) {
        const opusData = this.discordEncoder.encode(audio);
        // Discord expects Opus frames
        // This would be handled by the Discord voice connection
      }

      this.outputCallback(audio);
      this.stats.framesSent++;
      this.stats.bytesSent += audio.length * 4; // Float32 = 4 bytes
    } catch (error) {
      this.stats.errors++;
      logger.error('Audio routing error', { error });
    }
  }

  /**
   * Get router statistics
   */
  getStats(): typeof this.stats {
    return { ...this.stats };
  }

  reset(): void {
    this.stats = { framesSent: 0, bytesSent: 0, errors: 0 };
  }
}