/**
 * Noise Suppression Module
 * RNNoise / WebRTC noise suppression integration
 */

import { createLogger } from '../../shared/utils/logger.js';
import { BridgeError } from '../../shared/utils/errors.js';

const logger = createLogger('bridge:audio:noise-suppression');

export interface NoiseSuppressionConfig {
  sampleRate: number;
  frameSize: number;
  mode?: 'rnnoise' | 'webrtc' | 'auto';
  strength?: number; // 0-100, higher = more aggressive
}

export interface NoiseSuppressionResult {
  audio: Float32Array;
  noiseLevel: number;
  speechProbability: number;
}

// RNNoise native module (if available)
let RNNoiseModule: {
  createDenoiser: (sampleRate: number) => {
    process: (input: Float32Array) => Float32Array;
    destroy: () => void;
    getNoiseLevel: () => number;
  };
} | null = null;

async function loadRNNoise(): Promise<boolean> {
  try {
    // Try to load rnnoise-wasm or similar
    const rnnoise = await import('rnnoise-wasm');
    RNNoiseModule = rnnoise;
    logger.info('RNNoise module loaded successfully');
    return true;
  } catch {
    logger.debug('RNNoise not available');
    return false;
  }
}

// WebRTC noise suppression (via @discordjs/opus or native)
let WebRTCNoiseModule: {
  createProcessor: (config: { sampleRate: number; frameSize: number }) => {
    process: (input: Float32Array) => Float32Array;
    destroy: () => void;
  };
} | null = null;

async function loadWebRTCNoise(): Promise<boolean> {
  try {
    // WebRTC noise suppression is typically available via browser APIs
    // In Node.js, we might use a native binding or fallback
    logger.debug('WebRTC noise suppression not available in Node.js');
    return false;
  } catch {
    return false;
  }
}

/**
 * Simple spectral gating noise suppression (fallback)
 * Basic but effective for reducing stationary noise
 */
export class SpectralGateNoiseSuppression {
  private config: Required<NoiseSuppressionConfig>;
  private noiseProfile: Float32Array | null = null;
  private learningFrames: number = 0;
  private readonly maxLearningFrames: number = 100;
  private smoothingFactor: number = 0.9;
  private frameCount: number = 0;

  constructor(config: NoiseSuppressionConfig) {
    this.config = {
      sampleRate: config.sampleRate,
      frameSize: config.frameSize,
      mode: config.mode ?? 'auto',
      strength: config.strength ?? 50,
    };
  }

  /**
   * Process audio frame with noise suppression
   */
  process(audio: Float32Array): NoiseSuppressionResult {
    if (audio.length !== this.config.frameSize) {
      throw new BridgeError(
        `Invalid frame size. Expected ${this.config.frameSize}, got ${audio.length}`,
        'INVALID_FRAME_SIZE',
        400
      );
    }

    // Learn noise profile during initial frames
    if (this.learningFrames < this.maxLearningFrames) {
      this.updateNoiseProfile(audio);
      this.learningFrames++;
      return {
        audio: new Float32Array(audio),
        noiseLevel: this.estimateNoiseLevel(audio),
        speechProbability: 0.5,
      };
    }

    // Apply spectral gating
    const processed = this.applySpectralGate(audio);
    const noiseLevel = this.estimateNoiseLevel(audio);
    const speechProbability = this.estimateSpeechProbability(audio);

    return {
      audio: processed,
      noiseLevel,
      speechProbability,
    };
  }

  /**
   * Update noise profile during learning phase
   */
  private updateNoiseProfile(audio: Float32Array): void {
    if (!this.noiseProfile) {
      this.noiseProfile = new Float32Array(audio.length);
      this.noiseProfile.set(audio);
    } else {
      // Exponential moving average
      for (let i = 0; i < audio.length; i++) {
        this.noiseProfile[i] = this.smoothingFactor * this.noiseProfile[i] + (1 - this.smoothingFactor) * Math.abs(audio[i]);
      }
    }
  }

  /**
   * Apply spectral gate to reduce noise
   */
  private applySpectralGate(audio: Float32Array): Float32Array {
    if (!this.noiseProfile) {
      return new Float32Array(audio);
    }

    const output = new Float32Array(audio.length);
    const strength = this.config.strength / 100; // 0-1

    for (let i = 0; i < audio.length; i++) {
      const signalLevel = Math.abs(audio[i]);
      const noiseLevel = this.noiseProfile[i];

      // Calculate gate threshold
      const threshold = noiseLevel * (1 + strength * 2);

      if (signalLevel > threshold) {
        // Signal above threshold - pass through with slight attenuation
        const attenuation = Math.max(0.1, 1 - (noiseLevel / signalLevel) * strength);
        output[i] = audio[i] * attenuation;
      } else {
        // Signal below threshold - suppress
        output[i] = audio[i] * (1 - strength) * 0.1;
      }
    }

    return output;
  }

  /**
   * Estimate current noise level
   */
  private estimateNoiseLevel(audio: Float32Array): number {
    let sum = 0;
    for (let i = 0; i < audio.length; i++) {
      sum += Math.abs(audio[i]);
    }
    return sum / audio.length;
  }

  /**
   * Estimate speech probability based on signal characteristics
   */
  private estimateSpeechProbability(audio: Float32Array): number {
    // Simple heuristic: high zero-crossing rate + energy variation = likely speech
    let zeroCrossings = 0;
    let energy = 0;
    let prevSample = audio[0];

    for (let i = 1; i < audio.length; i++) {
      if ((prevSample >= 0 && audio[i] < 0) || (prevSample < 0 && audio[i] >= 0)) {
        zeroCrossings++;
      }
      energy += audio[i] * audio[i];
      prevSample = audio[i];
    }

    const zcr = zeroCrossings / audio.length;
    const rms = Math.sqrt(energy / audio.length);

    // Normalize and combine metrics
    const zcrScore = Math.min(zcr * 10, 1); // Typical speech ZCR ~0.1-0.3
    const energyScore = Math.min(rms * 20, 1);

    return (zcrScore + energyScore) / 2;
  }

  /**
   * Reset noise profile
   */
  reset(): void {
    this.noiseProfile = null;
    this.learningFrames = 0;
  }

  /**
   * Update suppression strength
   */
  setStrength(strength: number): void {
    this.config.strength = Math.max(0, Math.min(100, strength));
  }
}

/**
 * RNNoise Wrapper (when available)
 */
export class RNNoiseWrapper {
  private denoiser: any;
  private config: Required<NoiseSuppressionConfig>;

  constructor(config: NoiseSuppressionConfig) {
    if (!RNNoiseModule) {
      throw new BridgeError('RNNoise module not loaded. Call loadRNNoise() first.', 'RNNOISE_NOT_LOADED', 500);
    }

    this.config = {
      sampleRate: config.sampleRate,
      frameSize: config.frameSize,
      mode: config.mode ?? 'rnnoise',
      strength: config.strength ?? 50,
    };

    this.denoiser = RNNoiseModule.createDenoiser(config.sampleRate);
    logger.info('RNNoise denoiser created', { sampleRate: config.sampleRate });
  }

  process(audio: Float32Array): NoiseSuppressionResult {
    if (audio.length !== this.config.frameSize) {
      throw new BridgeError(
        `Invalid frame size. Expected ${this.config.frameSize}, got ${audio.length}`,
        'INVALID_FRAME_SIZE',
        400
      );
    }

    try {
      const processed = this.denoiser.process(audio);
      const noiseLevel = this.denoiser.getNoiseLevel?.() ?? 0;

      return {
        audio: processed,
        noiseLevel,
        speechProbability: noiseLevel < 0.1 ? 0.8 : 0.3,
      };
    } catch (error) {
      logger.error('RNNoise processing failed', { error });
      return {
        audio: new Float32Array(audio),
        noiseLevel: 0,
        speechProbability: 0.5,
      };
    }
  }

  destroy(): void {
    this.denoiser?.destroy();
    logger.debug('RNNoise denoiser destroyed');
  }
}

/**
 * Factory function to create best available noise suppression
 */
export async function createNoiseSuppression(config: NoiseSuppressionConfig): Promise<SpectralGateNoiseSuppression | RNNoiseWrapper> {
  const hasRNNoise = await loadRNNoise();

  if (hasRNNoise && config.mode !== 'webrtc') {
    logger.info('Using RNNoise for noise suppression');
    return new RNNoiseWrapper(config);
  }

  const hasWebRTC = await loadWebRTCNoise();
  if (hasWebRTC && config.mode !== 'rnnoise') {
    logger.info('Using WebRTC noise suppression');
    // Would return WebRTC wrapper here
  }

  logger.info('Using Spectral Gate noise suppression (fallback)');
  return new SpectralGateNoiseSuppression(config);
}

/**
 * Combined Noise Suppression + VAD Pipeline
 * Processes audio through both noise suppression and VAD
 */
export interface AudioProcessorConfig {
  sampleRate: number;
  frameSize: number;
  vadConfig?: any;
  noiseConfig?: NoiseSuppressionConfig;
}

export interface ProcessedAudioFrame {
  audio: Float32Array;
  isSpeech: boolean;
  vadProbability: number;
  noiseLevel: number;
  speechProbability: number;
}

export class AudioProcessor {
  private vad: any;
  private noiseSuppression: SpectralGateNoiseSuppression | RNNoiseWrapper;
  private config: AudioProcessorConfig;

  constructor(config: AudioProcessorConfig) {
    this.config = config;
  }

  async initialize(): Promise<void> {
    const { createVAD } = await import('./vad.js');
    const { createNoiseSuppression } = await import('./noise-suppression.js');

    this.vad = await createVAD({
      sampleRate: this.config.sampleRate,
      frameSize: this.config.frameSize,
      ...this.config.vadConfig,
    });

    this.noiseSuppression = await createNoiseSuppression({
      sampleRate: this.config.sampleRate,
      frameSize: this.config.frameSize,
      ...this.config.noiseConfig,
    });

    logger.info('Audio processor initialized', {
      sampleRate: this.config.sampleRate,
      frameSize: this.config.frameSize,
    });
  }

  process(audio: Float32Array): ProcessedAudioFrame {
    // Apply noise suppression first
    const noiseResult = this.noiseSuppression.process(audio);

    // Then apply VAD on cleaned audio
    const vadResult = this.vad.process(noiseResult.audio);

    return {
      audio: vadResult.audio,
      isSpeech: vadResult.isSpeech,
      vadProbability: vadResult.probability,
      noiseLevel: noiseResult.noiseLevel,
      speechProbability: noiseResult.speechProbability,
    };
  }

  reset(): void {
    this.vad?.reset();
    this.noiseSuppression?.reset?.();
  }
}