/**
 * Voice Activity Detection (VAD) Module
 * Silero VAD integration for detecting speech in audio streams
 */

import { createLogger } from '../../shared/utils/logger.js';
import { BridgeError } from '../../shared/utils/errors.js';

const logger = createLogger('bridge:audio:vad');

export interface VADConfig {
  sampleRate: number;
  frameSize: number;
  threshold?: number;        // Speech probability threshold (0-1)
  minSpeechFrames?: number;  // Minimum consecutive speech frames
  minSilenceFrames?: number; // Minimum consecutive silence frames
  paddingFrames?: number;    // Padding frames around speech
}

export interface VADResult {
  isSpeech: boolean;
  probability: number;
  audio: Float32Array;
}

interface SileroVADModule {
  load: () => Promise<{
    model: any;
    utils: {
      getSpeechTimestamps: (audio: Float32Array, model: any, options: any) => any[];
      saveAudio: (audio: Float32Array, path: string) => void;
      readAudio: (path: string) => Float32Array;
      VADIterator: new (model: any, options: any) => any;
    };
  }>;
}

let SileroModule: SileroVADModule | null = null;
let SileroModel: any = null;
let SileroUtils: any = null;

async function loadSileroVAD(): Promise<void> {
  if (SileroModel && SileroUtils) return;

  try {
    // Try to load from @silero/vad or use the official Silero VAD via ONNX
    // For now, we'll use a simple WebAssembly-based approach or fallback
    const silero = await import('@silero/vad');
    SileroModule = silero;

    const loaded = await silero.load();
    SileroModel = loaded.model;
    SileroUtils = loaded.utils;

    logger.info('Silero VAD model loaded successfully');
  } catch (error) {
    logger.warn('Silero VAD not available, using fallback', { error });
    // Silero VAD is optional - we'll use a fallback energy-based VAD
    SileroModule = null;
    SileroModel = null;
    SileroUtils = null;
  }
}

/**
 * Fallback energy-based VAD
 * Simple but effective for basic voice activity detection
 */
export class EnergyVAD {
  private config: Required<VADConfig>;
  private speechFrames: number = 0;
  private silenceFrames: number = 0;
  private isSpeechState: boolean = false;
  private ringBuffer: Float32Array[] = [];
  private readonly ringBufferSize: number;

  constructor(config: VADConfig) {
    this.config = {
      sampleRate: config.sampleRate,
      frameSize: config.frameSize,
      threshold: config.threshold ?? 0.02,
      minSpeechFrames: config.minSpeechFrames ?? 3,
      minSilenceFrames: config.minSilenceFrames ?? 10,
      paddingFrames: config.paddingFrames ?? 5,
    };

    this.ringBufferSize = this.config.paddingFrames * 2;
  }

  /**
   * Calculate RMS energy of audio frame
   */
  private calculateEnergy(audio: Float32Array): number {
    let sum = 0;
    for (let i = 0; i < audio.length; i++) {
      sum += audio[i] * audio[i];
    }
    return Math.sqrt(sum / audio.length);
  }

  /**
   * Process audio frame and return VAD result
   */
  process(audio: Float32Array): VADResult {
    if (audio.length !== this.config.frameSize) {
      throw new BridgeError(
        `Invalid frame size. Expected ${this.config.frameSize}, got ${audio.length}`,
        'INVALID_FRAME_SIZE',
        400
      );
    }

    const energy = this.calculateEnergy(audio);
    const normalizedEnergy = Math.min(energy / 0.1, 1.0); // Normalize to 0-1
    const isSpeech = normalizedEnergy > this.config.threshold;

    // State machine for speech/silence detection
    if (isSpeech) {
      this.speechFrames++;
      this.silenceFrames = 0;

      if (this.speechFrames >= this.config.minSpeechFrames) {
        this.isSpeechState = true;
      }
    } else {
      this.silenceFrames++;
      this.speechFrames = 0;

      if (this.silenceFrames >= this.config.minSilenceFrames) {
        this.isSpeechState = false;
      }
    }

    // Add to ring buffer for padding
    this.ringBuffer.push(new Float32Array(audio));
    if (this.ringBuffer.length > this.ringBufferSize) {
      this.ringBuffer.shift();
    }

    return {
      isSpeech: this.isSpeechState,
      probability: normalizedEnergy,
      audio: new Float32Array(audio),
    };
  }

  /**
   * Get buffered audio with padding
   */
  getBufferedAudio(): Float32Array {
    const totalLength = this.ringBuffer.reduce((sum, frame) => sum + frame.length, 0);
    const output = new Float32Array(totalLength);
    let offset = 0;
    for (const frame of this.ringBuffer) {
      output.set(frame, offset);
      offset += frame.length;
    }
    return output;
  }

  /**
   * Reset VAD state
   */
  reset(): void {
    this.speechFrames = 0;
    this.silenceFrames = 0;
    this.isSpeechState = false;
    this.ringBuffer = [];
  }

  /**
   * Get current speech state
   */
  getState(): boolean {
    return this.isSpeechState;
  }

  /**
   * Update threshold dynamically
   */
  setThreshold(threshold: number): void {
    this.config.threshold = Math.max(0, Math.min(1, threshold));
  }
}

/**
 * Silero VAD Wrapper (when available)
 */
export class SileroVADWrapper {
  private config: Required<VADConfig>;
  private vadIterator: any;
  private sampleRate: number;
  private frameSize: number;

  constructor(config: VADConfig) {
    if (!SileroModel || !SileroUtils) {
      throw new BridgeError('Silero VAD not loaded. Call loadSileroVAD() first.', 'SILERO_NOT_LOADED', 500);
    }

    this.config = {
      sampleRate: config.sampleRate,
      frameSize: config.frameSize,
      threshold: config.threshold ?? 0.5,
      minSpeechFrames: config.minSpeechFrames ?? 3,
      minSilenceFrames: config.minSilenceFrames ?? 10,
      paddingFrames: config.paddingFrames ?? 5,
    };

    this.sampleRate = config.sampleRate;
    this.frameSize = config.frameSize;

    // Create VAD iterator
    this.vadIterator = new SileroUtils.VADIterator(SileroModel, {
      threshold: this.config.threshold,
      sampling_rate: this.sampleRate,
      min_silence_duration_ms: (this.config.minSilenceFrames * this.frameSize * 1000) / this.sampleRate,
      speech_pad_ms: (this.config.paddingFrames * this.frameSize * 1000) / this.sampleRate,
    });
  }

  /**
   * Process audio frame
   */
  process(audio: Float32Array): VADResult {
    if (audio.length !== this.frameSize) {
      throw new BridgeError(
        `Invalid frame size. Expected ${this.frameSize}, got ${audio.length}`,
        'INVALID_FRAME_SIZE',
        400
      );
    }

    // Convert to format expected by Silero (Int16)
    const int16Audio = new Int16Array(audio.length);
    for (let i = 0; i < audio.length; i++) {
      const sample = Math.max(-1, Math.min(1, audio[i]));
      int16Audio[i] = sample < 0 ? sample * 0x8000 : sample * 0x7FFF;
    }

    const result = this.vadIterator(int16Audio);

    return {
      isSpeech: result !== null,
      probability: result ? 1.0 : 0.0,
      audio: new Float32Array(audio),
    };
  }

  /**
   * Reset VAD iterator
   */
  reset(): void {
    this.vadIterator.reset_states();
  }
}

/**
 * Factory function to create best available VAD
 */
export async function createVAD(config: VADConfig): Promise<EnergyVAD | SileroVADWrapper> {
  await loadSileroVAD();

  if (SileroModel && SileroUtils) {
    logger.info('Using Silero VAD for voice activity detection');
    return new SileroVADWrapper(config);
  } else {
    logger.info('Using Energy-based VAD (fallback)');
    return new EnergyVAD(config);
  }
}

/**
 * Voice Activity Detector with adaptive threshold
 * Automatically adjusts threshold based on noise floor
 */
export class AdaptiveVAD {
  private vad: EnergyVAD;
  private noiseFloor: number = 0.01;
  private signalPeak: number = 0.1;
  private adaptationRate: number = 0.001;
  private frameCount: number = 0;

  constructor(config: VADConfig) {
    this.vad = new EnergyVAD(config);
  }

  process(audio: Float32Array): VADResult {
    const energy = this.calculateEnergy(audio);

    // Update noise floor and signal peak
    this.frameCount++;
    if (this.frameCount < 100) {
      // Initial learning phase
      this.noiseFloor = Math.max(this.noiseFloor, energy * 1.5);
      this.signalPeak = Math.max(this.signalPeak, energy);
    } else {
      // Continuous adaptation
      if (energy < this.noiseFloor * 2) {
        // Likely noise - update noise floor
        this.noiseFloor += (energy - this.noiseFloor) * this.adaptationRate;
      } else if (energy > this.signalPeak * 0.5) {
        // Likely speech - update signal peak
        this.signalPeak += (energy - this.signalPeak) * this.adaptationRate;
      }
    }

    // Set adaptive threshold between noise floor and signal peak
    const threshold = this.noiseFloor + (this.signalPeak - this.noiseFloor) * 0.3;
    this.vad.setThreshold(Math.max(0.005, Math.min(0.1, threshold)));

    return this.vad.process(audio);
  }

  private calculateEnergy(audio: Float32Array): number {
    let sum = 0;
    for (let i = 0; i < audio.length; i++) {
      sum += audio[i] * audio[i];
    }
    return Math.sqrt(sum / audio.length);
  }

  reset(): void {
    this.vad.reset();
    this.noiseFloor = 0.01;
    this.signalPeak = 0.1;
    this.frameCount = 0;
  }

  getState(): boolean {
    return this.vad.getState();
  }
}