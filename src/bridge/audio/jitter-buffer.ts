/**
 * Jitter Buffer Module
 * Smooths playback under network variance
 */

import { createLogger } from '../../shared/utils/logger.js';
import { BridgeError } from '../../shared/utils/errors.js';

const logger = createLogger('bridge:audio:jitter-buffer');

export interface JitterBufferConfig {
  sampleRate: number;
  frameSize: number;
  channels: number;
  minBufferSize: number;     // Minimum frames to buffer
  maxBufferSize: number;     // Maximum frames to buffer
  targetBufferSize: number;  // Target buffer size
  adaptive: boolean;         // Enable adaptive sizing
  concealment: boolean;      // Enable packet loss concealment
}

export interface JitterBufferStats {
  currentSize: number;
  targetSize: number;
  underruns: number;
  overruns: number;
  concealedFrames: number;
  avgJitter: number;
}

const DEFAULT_CONFIG: JitterBufferConfig = {
  sampleRate: 48000,
  frameSize: 960,
  channels: 2,
  minBufferSize: 3,
  maxBufferSize: 50,
  targetBufferSize: 10,
  adaptive: true,
  concealment: true,
};

/**
 * Jitter Buffer for smoothing network audio delivery
 */
export class JitterBuffer {
  private config: JitterBufferConfig;
  private buffer: Float32Array[] = [];
  private sequence: number = 0;
  private expectedSequence: number = 0;
  private stats: JitterBufferStats = {
    currentSize: 0,
    targetSize: 0,
    underruns: 0,
    overruns: 0,
    concealedFrames: 0,
    avgJitter: 0,
  };
  private jitterSamples: number[] = [];
  private readonly maxJitterSamples: number = 100;
  private lastTimestamp: number = 0;
  private firstPacket: boolean = true;

  constructor(config: Partial<JitterBufferConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.stats.targetSize = this.config.targetBufferSize;
    logger.info('Jitter buffer initialized', this.config);
  }

  /**
   * Push audio frame into buffer
   */
  push(frame: Float32Array, sequence?: number, timestamp?: number): void {
    if (frame.length !== this.config.frameSize * this.config.channels) {
      throw new BridgeError(
        `Invalid frame size. Expected ${this.config.frameSize * this.config.channels}, got ${frame.length}`,
        'INVALID_FRAME_SIZE',
        400
      );
    }

    // Handle sequence numbering
    if (sequence !== undefined) {
      if (this.firstPacket) {
        this.expectedSequence = sequence;
        this.firstPacket = false;
      } else if (sequence < this.expectedSequence) {
        // Late packet - discard
        logger.debug('Late packet discarded', { sequence, expected: this.expectedSequence });
        return;
      } else if (sequence > this.expectedSequence) {
        // Gap detected - insert concealment frames
        const gap = sequence - this.expectedSequence;
        this.handleGap(gap);
      }
      this.expectedSequence = sequence + 1;
    }

    // Add to buffer
    this.buffer.push(new Float32Array(frame));
    this.stats.currentSize = this.buffer.length;

    // Handle buffer overflow
    if (this.buffer.length > this.config.maxBufferSize) {
      // Remove oldest frames
      const overflow = this.buffer.length - this.config.maxBufferSize;
      this.buffer.splice(0, overflow);
      this.stats.overruns += overflow;
      logger.debug('Jitter buffer overflow', { overflow, newSize: this.buffer.length });
    }

    // Calculate jitter from timestamp
    if (timestamp !== undefined && this.lastTimestamp > 0) {
      const transitTime = Date.now() - timestamp;
      const jitter = Math.abs(transitTime - (this.lastTimestamp - timestamp));
      this.jitterSamples.push(jitter);
      if (this.jitterSamples.length > this.maxJitterSamples) {
        this.jitterSamples.shift();
      }
    }
    this.lastTimestamp = timestamp ?? Date.now();

    // Adaptive buffer sizing
    if (this.config.adaptive && this.buffer.length > this.config.minBufferSize) {
      this.adaptBufferSize();
    }
  }

  /**
   * Pop next audio frame from buffer
   */
  pop(): Float32Array | null {
    if (this.buffer.length === 0) {
      // Buffer underrun - generate concealment frame
      this.stats.underruns++;
      this.stats.concealedFrames++;
      logger.debug('Jitter buffer underrun', { totalUnderruns: this.stats.underruns });
      return this.concealFrame();
    }

    if (this.buffer.length < this.config.minBufferSize) {
      // Not enough buffered - wait
      return null;
    }

    const frame = this.buffer.shift()!;
    this.stats.currentSize = this.buffer.length;
    return frame;
  }

  /**
   * Pop frame or generate silence if empty
   */
  popOrSilence(): Float32Array {
    const frame = this.pop();
    if (frame) return frame;

    // Return silence
    return new Float32Array(this.config.frameSize * this.config.channels);
  }

  /**
   * Handle sequence gap with concealment
   */
  private handleGap(gap: number): void {
    logger.debug('Sequence gap detected', { gap, bufferSize: this.buffer.length });

    for (let i = 0; i < gap; i++) {
      this.stats.concealedFrames++;
      const concealed = this.concealFrame();
      this.buffer.push(concealed);
    }

    // Limit buffer size after gap filling
    if (this.buffer.length > this.config.maxBufferSize) {
      const overflow = this.buffer.length - this.config.maxBufferSize;
      this.buffer.splice(0, overflow);
      this.stats.overruns += overflow;
    }

    this.stats.currentSize = this.buffer.length;
  }

  /**
   * Generate concealment frame (packet loss concealment)
   */
  private concealFrame(): Float32Array {
    if (!this.config.concealment) {
      return new Float32Array(this.config.frameSize * this.config.channels);
    }

    // Simple waveform substitution - repeat last frame with fade
    if (this.buffer.length > 0) {
      const lastFrame = this.buffer[this.buffer.length - 1];
      const concealed = new Float32Array(lastFrame.length);
      const fade = 0.8; // Fade factor

      for (let i = 0; i < lastFrame.length; i++) {
        concealed[i] = lastFrame[i] * fade;
      }

      return concealed;
    }

    // No history - return silence
    return new Float32Array(this.config.frameSize * this.config.channels);
  }

  /**
   * Adaptive buffer sizing based on network jitter
   */
  private adaptBufferSize(): void {
    if (this.jitterSamples.length < 10) return;

    const avgJitter = this.jitterSamples.reduce((a, b) => a + b, 0) / this.jitterSamples.length;
    this.stats.avgJitter = avgJitter;

    // Convert jitter (ms) to frames
    const frameDuration = (this.config.frameSize / this.config.sampleRate) * 1000; // ms
    const jitterFrames = Math.ceil(avgJitter / frameDuration);

    // Target buffer = jitter frames + safety margin
    const newTarget = Math.max(
      this.config.minBufferSize,
      Math.min(this.config.maxBufferSize, jitterFrames + 3)
    );

    if (Math.abs(newTarget - this.stats.targetSize) > 1) {
      this.stats.targetSize = newTarget;
      logger.debug('Jitter buffer target adjusted', {
        targetSize: this.stats.targetSize,
        avgJitter,
        jitterFrames,
      });
    }
  }

  /**
   * Get current buffer statistics
   */
  getStats(): JitterBufferStats {
    return { ...this.stats };
  }

  /**
   * Clear buffer
   */
  clear(): void {
    this.buffer = [];
    this.sequence = 0;
    this.expectedSequence = 0;
    this.firstPacket = true;
    this.jitterSamples = [];
    this.stats = {
      currentSize: 0,
      targetSize: this.config.targetBufferSize,
      underruns: 0,
      overruns: 0,
      concealedFrames: 0,
      avgJitter: 0,
    };
    logger.debug('Jitter buffer cleared');
  }

  /**
   * Reset statistics
   */
  resetStats(): void {
    this.stats = {
      currentSize: this.buffer.length,
      targetSize: this.config.targetBufferSize,
      underruns: 0,
      overruns: 0,
      concealedFrames: 0,
      avgJitter: 0,
    };
  }

  /**
   * Check if buffer is ready for playback
   */
  isReady(): boolean {
    return this.buffer.length >= this.config.minBufferSize;
  }

  /**
   * Get current buffer depth in milliseconds
   */
  getBufferDepthMs(): number {
    const frameDuration = (this.config.frameSize / this.config.sampleRate) * 1000;
    return this.buffer.length * frameDuration;
  }

  /**
   * Set target buffer size manually
   */
  setTargetSize(size: number): void {
    this.stats.targetSize = Math.max(
      this.config.minBufferSize,
      Math.min(this.config.maxBufferSize, size)
    );
  }
}

/**
 * Network Jitter Buffer with RTP timestamp support
 */
export class RTPJitterBuffer extends JitterBuffer {
  private rtpTimestamp: number = 0;
  private sampleRate: number;

  constructor(config: Partial<JitterBufferConfig> = {}) {
    super(config);
    this.sampleRate = config.sampleRate ?? 48000;
  }

  /**
   * Push frame with RTP timestamp
   */
  pushRTP(frame: Float32Array, rtpTimestamp: number, sequence: number): void {
    // Calculate expected timestamp
    const frameDuration = this.config.frameSize;
    const expectedTimestamp = this.rtpTimestamp + frameDuration;

    if (this.firstPacket) {
      this.rtpTimestamp = rtpTimestamp;
    } else {
      const timestampDiff = rtpTimestamp - this.rtpTimestamp;
      const expectedDiff = expectedTimestamp - this.rtpTimestamp;

      if (timestampDiff > expectedDiff + frameDuration) {
        // Gap in RTP timestamps
        const gapFrames = Math.floor((timestampDiff - expectedDiff) / frameDuration);
        this.handleGap(gapFrames);
      } else if (timestampDiff < expectedDiff - frameDuration) {
        // Late or reordered packet
        logger.debug('Late RTP packet', { diff: timestampDiff - expectedDiff });
      }
    }

    this.rtpTimestamp = rtpTimestamp;
    this.push(frame, sequence);
  }
}

/**
 * Playback Jitter Buffer - optimized for output side
 */
export class PlaybackJitterBuffer extends JitterBuffer {
  private pullTimer: ReturnType<typeof setInterval> | null = null;
  private onFrameCallback: ((frame: Float32Array) => void) | null = null;

  constructor(config: Partial<JitterBufferConfig> = {}) {
    super(config);
  }

  /**
   * Set callback for frame delivery
   */
  setFrameCallback(callback: (frame: Float32Array) => void): void {
    this.onFrameCallback = callback;
  }

  /**
   * Start automatic frame pulling at sample rate
   */
  startPull(): void {
    if (this.pullTimer) return;

    const frameDuration = (this.config.frameSize / this.config.sampleRate) * 1000;

    this.pullTimer = setInterval(() => {
      const frame = this.popOrSilence();
      if (this.onFrameCallback) {
        this.onFrameCallback(frame);
      }
    }, frameDuration);

    logger.debug('Playback jitter buffer started');
  }

  /**
   * Stop automatic frame pulling
   */
  stopPull(): void {
    if (this.pullTimer) {
      clearInterval(this.pullTimer);
      this.pullTimer = null;
      logger.debug('Playback jitter buffer stopped');
    }
  }
}