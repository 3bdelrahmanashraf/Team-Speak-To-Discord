/**
 * Audio Pipeline Module
 * Main entry point for audio processing pipeline
 */

export * from './opus.js';
export * from './vad.js';
export * from './noise-suppression.js';
export * from './adaptive-bitrate.js';
export * from './mixer.js';
export * from './jitter-buffer.js';
export * from './recording.js';

// ========================================================================
// Audio Pipeline Types
// ========================================================================

export interface AudioPipelineConfig {
  sampleRate: number;
  frameSize: number;
  channels: number;
  bitrate: number;
  opus: {
    application: 'voip' | 'audio' | 'restricted-lowdelay';
    fec: boolean;
    dtx: boolean;
    complexity: number;
    packetLoss: number;
  };
  vad: {
    enabled: boolean;
    threshold: number;
    minSpeechFrames: number;
    minSilenceFrames: number;
    adaptive: boolean;
  };
  noiseSuppression: {
    enabled: boolean;
    mode: 'rnnoise' | 'webrtc' | 'spectral' | 'auto';
    strength: number;
  };
  adaptiveBitrate: {
    enabled: boolean;
    minBitrate: number;
    maxBitrate: number;
    initialBitrate: number;
  };
  mixer: {
    enabled: boolean;
    maxInputs: number;
    agc: boolean;
    limiter: boolean;
    vadAware: boolean;
    maxActiveSpeakers: number;
  };
  jitterBuffer: {
    enabled: boolean;
    minBufferSize: number;
    maxBufferSize: number;
    targetBufferSize: number;
    adaptive: boolean;
    concealment: boolean;
  };
  recording: {
    enabled: boolean;
    format: 'wav' | 'ogg' | 'mp3' | 'flac';
    multiTrack: boolean;
    maxFileSize: number;
    maxDuration: number;
  };
}

export const DEFAULT_AUDIO_CONFIG: AudioPipelineConfig = {
  sampleRate: 48000,
  frameSize: 960,
  channels: 2,
  bitrate: 64000,
  opus: {
    application: 'voip',
    fec: true,
    dtx: true,
    complexity: 10,
    packetLoss: 0,
  },
  vad: {
    enabled: true,
    threshold: 0.5,
    minSpeechFrames: 3,
    minSilenceFrames: 10,
    adaptive: true,
  },
  noiseSuppression: {
    enabled: true,
    mode: 'auto',
    strength: 50,
  },
  adaptiveBitrate: {
    enabled: true,
    minBitrate: 16000,
    maxBitrate: 128000,
    initialBitrate: 64000,
  },
  mixer: {
    enabled: true,
    maxInputs: 50,
    agc: true,
    limiter: true,
    vadAware: true,
    maxActiveSpeakers: 3,
  },
  jitterBuffer: {
    enabled: true,
    minBufferSize: 3,
    maxBufferSize: 50,
    targetBufferSize: 10,
    adaptive: true,
    concealment: true,
  },
  recording: {
    enabled: false,
    format: 'wav',
    multiTrack: true,
    maxFileSize: 100 * 1024 * 1024,
    maxDuration: 3600,
  },
};

// ========================================================================
// Audio Pipeline Factory
// ========================================================================

import { createLogger } from '../../shared/utils/logger.js';

const logger = createLogger('bridge:audio:pipeline');

export class AudioPipeline {
  private config: AudioPipelineConfig;
  private opusEncoder: any = null;
  private opusDecoder: any = null;
  private vad: any = null;
  private noiseSuppression: any = null;
  private adaptiveBitrate: any = null;
  private mixer: any = null;
  private jitterBuffer: any = null;
  private recorder: any = null;
  private networkMonitor: any = null;
  private initialized: boolean = false;

  constructor(config: Partial<AudioPipelineConfig> = {}) {
    this.config = { ...DEFAULT_AUDIO_CONFIG, ...config };
  }

  /**
   * Initialize all audio components
   */
  async initialize(): Promise<void> {
    if (this.initialized) {
      logger.warn('Audio pipeline already initialized');
      return;
    }

    logger.info('Initializing audio pipeline...', {
      sampleRate: this.config.sampleRate,
      frameSize: this.config.frameSize,
      channels: this.config.channels,
    });

    // Load Opus module
    const { loadOpusModule, createOpusPair } = await import('./opus.js');
    await loadOpusModule();

    // Create Opus encoder/decoder
    const { encoder, decoder } = await createOpusPair({
      sampleRate: this.config.sampleRate,
      channels: this.config.channels,
      frameSize: this.config.frameSize,
      bitrate: this.config.bitrate,
    });

    this.opusEncoder = encoder;
    this.opusDecoder = decoder;

    // Configure Opus
    this.opusEncoder.setComplexity(this.config.opus.complexity);
    this.opusEncoder.setFEC(this.config.opus.fec);
    this.opusEncoder.setDTX(this.config.opus.dtx);
    this.opusEncoder.setPacketLoss(this.config.opus.packetLoss);

    // Initialize VAD
    if (this.config.vad.enabled) {
      const { createVAD } = await import('./vad.js');
      this.vad = await createVAD({
        sampleRate: this.config.sampleRate,
        frameSize: this.config.frameSize,
        threshold: this.config.vad.threshold,
        minSpeechFrames: this.config.vad.minSpeechFrames,
        minSilenceFrames: this.config.vad.minSilenceFrames,
      });
    }

    // Initialize Noise Suppression
    if (this.config.noiseSuppression.enabled) {
      const { createNoiseSuppression } = await import('./noise-suppression.js');
      this.noiseSuppression = await createNoiseSuppression({
        sampleRate: this.config.sampleRate,
        frameSize: this.config.frameSize,
        mode: this.config.noiseSuppression.mode,
        strength: this.config.noiseSuppression.strength,
      });
    }

    // Initialize Adaptive Bitrate
    if (this.config.adaptiveBitrate.enabled) {
      const { AdaptiveBitrateController, NetworkMonitor } = await import('./adaptive-bitrate.js');
      this.adaptiveBitrate = new AdaptiveBitrateController({
        minBitrate: this.config.adaptiveBitrate.minBitrate,
        maxBitrate: this.config.adaptiveBitrate.maxBitrate,
        initialBitrate: this.config.adaptiveBitrate.initialBitrate,
      });
      this.networkMonitor = new NetworkMonitor();
    }

    // Initialize Mixer
    if (this.config.mixer.enabled) {
      const { AudioMixer, VADAwareMixer } = await import('./mixer.js');
      if (this.config.mixer.vadAware) {
        this.mixer = new VADAwareMixer({
          sampleRate: this.config.sampleRate,
          frameSize: this.config.frameSize,
          channels: this.config.channels,
          maxInputs: this.config.mixer.maxInputs,
          enableAGC: this.config.mixer.agc,
          enableLimiter: this.config.mixer.limiter,
        });
        this.mixer.setMaxActiveSpeakers(this.config.mixer.maxActiveSpeakers);
      } else {
        this.mixer = new AudioMixer({
          sampleRate: this.config.sampleRate,
          frameSize: this.config.frameSize,
          channels: this.config.channels,
          maxInputs: this.config.mixer.maxInputs,
          enableAGC: this.config.mixer.agc,
          enableLimiter: this.config.mixer.limiter,
        });
      }
    }

    // Initialize Jitter Buffer
    if (this.config.jitterBuffer.enabled) {
      const { JitterBuffer, PlaybackJitterBuffer } = await import('./jitter-buffer.js');
      this.jitterBuffer = new PlaybackJitterBuffer({
        sampleRate: this.config.sampleRate,
        frameSize: this.config.frameSize,
        channels: this.config.channels,
        minBufferSize: this.config.jitterBuffer.minBufferSize,
        maxBufferSize: this.config.jitterBuffer.maxBufferSize,
        targetBufferSize: this.config.jitterBuffer.targetBufferSize,
        adaptive: this.config.jitterBuffer.adaptive,
        concealment: this.config.jitterBuffer.concealment,
      });
    }

    // Initialize Recorder
    if (this.config.recording.enabled) {
      const { AudioRecorder, MultiTrackRecorder } = await import('./recording.js');
      if (this.config.recording.multiTrack) {
        this.recorder = new (await import('./recording.js')).MultiTrackRecorder({
          ...this.config,
          ...this.config.recording,
        });
      } else {
        this.recorder = new (await import('./recording.js')).AudioRecorder({
          ...this.config,
          ...this.config.recording,
        });
      }
    }

    this.initialized = true;
    logger.info('Audio pipeline initialized successfully');
  }

  /**
   * Process incoming TeamSpeak audio frame
   */
  async processTSFrame(
    clientId: string,
    pcm: Float32Array,
    sequence?: number,
    timestamp?: number
  ): Promise<Float32Array | null> {
    if (!this.initialized) {
      throw new Error('Audio pipeline not initialized');
    }

    // Add to mixer
    if (this.mixer) {
      this.mixer.updateInput(clientId, pcm);
    }

    // Add to jitter buffer for Discord output
    if (this.jitterBuffer) {
      this.jitterBuffer.push(pcm, sequence, timestamp);
    }

    // Record if enabled
    if (this.recorder) {
      this.recorder.writeIndividual(clientId, pcm);
    }

    return pcm;
  }

  /**
   * Process incoming Discord Opus frame
   */
  async processDiscordFrame(
    userId: string,
    opusData: Uint8Array,
    sequence?: number
  ): Promise<Float32Array | null> {
    if (!this.initialized) {
      throw new Error('Audio pipeline not initialized');
    }

    // Decode Opus
    let pcm: Float32Array;
    try {
      pcm = this.opusDecoder.decode(opusData);
    } catch (error) {
      logger.error('Opus decode failed', { error });
      return null;
    }

    // Add to mixer
    if (this.mixer) {
      this.mixer.updateInput(userId, pcm);
    }

    return pcm;
  }

  /**
   * Get mixed output for Discord
   */
  getMixedOutput(vadResults?: Map<string, { isSpeech: boolean; probability: number }>): Float32Array | null {
    if (!this.mixer) return null;

    let output: any;
    if (vadResults && this.mixer.mixWithVAD) {
      output = this.mixer.mixWithVAD(vadResults);
    } else {
      output = this.mixer.mix();
    }

    // Record mixed output
    if (this.recorder && this.recorder.writeMixed) {
      this.recorder.writeMixed(output.audio);
    }

    // Push to jitter buffer for Discord
    if (this.jitterBuffer) {
      this.jitterBuffer.push(output.audio);
    }

    return output.audio;
  }

  /**
   * Get next frame from jitter buffer for Discord playback
   */
  getPlaybackFrame(): Float32Array | null {
    if (!this.jitterBuffer) return null;
    return this.jitterBuffer.popOrSilence();
  }

  /**
   * Encode mixed audio to Opus for Discord
   */
  encodeToOpus(pcm: Float32Array): Uint8Array {
    if (!this.opusEncoder) {
      throw new Error('Opus encoder not initialized');
    }
    return this.opusEncoder.encode(pcm);
  }

  /**
   * Update network statistics for adaptive bitrate
   */
  updateNetworkStats(stats: {
    rtt: number;
    jitter: number;
    packetLoss: number;
    bandwidth: number;
  }): void {
    if (this.adaptiveBitrate) {
      const result = this.adaptiveBitrate.update({
        ...stats,
        timestamp: Date.now(),
      });

      if (result.bitrate !== this.opusEncoder?.getBitrate()) {
        this.opusEncoder?.setBitrate(result.bitrate);
        logger.debug('Bitrate adapted', { bitrate: result.bitrate, quality: result.networkQuality });
      }
    }

    if (this.networkMonitor) {
      // NetworkMonitor expects packet sequence/timestamp
    }
  }

  /**
   * Record network packet for monitoring
   */
  recordPacket(sequence: number, timestamp: number): void {
    this.networkMonitor?.recordPacket(sequence, timestamp);
  }

  /**
   * Start recording
   */
  startRecording(participants: string[] = []): void {
    if (this.recorder) {
      if (this.recorder.start) {
        this.recorder.start(participants);
      } else if (this.recorder.startRecording) {
        this.recorder.startRecording(participants);
      }
    }
  }

  /**
   * Stop recording
   */
  stopRecording(): any {
    if (!this.recorder) return null;
    if (this.recorder.stop) {
      return this.recorder.stop();
    } else if (this.recorder.stopRecording) {
      return this.recorder.stopRecording();
    }
    return null;
  }

  /**
   * Start playback jitter buffer
   */
  startPlayback(): void {
    if (this.jitterBuffer && this.jitterBuffer.startPull) {
      this.jitterBuffer.startPull();
    }
  }

  /**
   * Stop playback jitter buffer
   */
  stopPlayback(): void {
    if (this.jitterBuffer && this.jitterBuffer.stopPull) {
      this.jitterBuffer.stopPull();
    }
  }

  /**
   * Get pipeline statistics
   */
  getStats(): any {
    return {
      initialized: this.initialized,
      config: this.config,
      opus: {
        encoder: this.opusEncoder ? {
          bitrate: this.opusEncoder.getBitrate(),
          sampleRate: this.opusEncoder.getSampleRate(),
          frameSize: this.opusEncoder.getFrameSize(),
          channels: this.opusEncoder.getChannels(),
        } : null,
        decoder: this.opusDecoder ? {
          sampleRate: this.opusDecoder.getSampleRate(),
          frameSize: this.opusDecoder.getFrameSize(),
          channels: this.opusDecoder.getChannels(),
        } : null,
      },
      vad: this.vad ? this.vad.getState?.() : null,
      noiseSuppression: this.noiseSuppression ? this.noiseSuppression.getState?.() : null,
      adaptiveBitrate: this.adaptiveBitrate ? this.adaptiveBitrate.getStats() : null,
      mixer: this.mixer ? this.mixer.getStatus() : null,
      jitterBuffer: this.jitterBuffer ? this.jitterBuffer.getStats() : null,
      networkMonitor: this.networkMonitor ? this.networkMonitor.getStats() : null,
      recorder: this.recorder ? this.recorder.getStatus?.() : null,
    };
  }

  /**
   * Clean up resources
   */
  destroy(): void {
    this.opusEncoder?.destroy();
    this.opusDecoder?.destroy();
    this.vad?.reset?.();
    this.noiseSuppression?.reset?.();
    this.adaptiveBitrate?.reset?.();
    this.mixer?.clear?.();
    this.jitterBuffer?.clear?.();
    this.jitterBuffer?.stopPull?.();
    this.networkMonitor?.reset?.();
    this.recorder?.stopRecording?.();
    this.recorder?.stop?.();

    this.initialized = false;
    logger.info('Audio pipeline destroyed');
  }
}

/**
 * Create audio pipeline with default config
 */
export async function createAudioPipeline(config?: Partial<AudioPipelineConfig>): Promise<AudioPipeline> {
  const pipeline = new AudioPipeline(config);
  await pipeline.initialize();
  return pipeline;
}