/**
 * Adaptive Bitrate Module
 * Dynamic quality adjustment based on network conditions
 */

import { createLogger } from '../../shared/utils/logger.js';

const logger = createLogger('bridge:audio:adaptive-bitrate');

export interface NetworkStats {
  rtt: number;              // Round-trip time in ms
  jitter: number;           // Jitter in ms
  packetLoss: number;       // Packet loss percentage (0-100)
  bandwidth: number;        // Estimated bandwidth in kbps
  timestamp: number;
}

export interface BitrateConfig {
  minBitrate: number;       // Minimum bitrate in bps
  maxBitrate: number;       // Maximum bitrate in bps
  initialBitrate: number;   // Starting bitrate in bps
  stepSize: number;         // Bitrate adjustment step in bps
  rttThreshold: number;     // RTT threshold in ms
  jitterThreshold: number;  // Jitter threshold in ms
  lossThreshold: number;    // Packet loss threshold %
  updateInterval: number;   // Update interval in ms
}

export interface AdaptiveBitrateResult {
  bitrate: number;
  reason: string;
  networkQuality: 'excellent' | 'good' | 'fair' | 'poor';
}

const DEFAULT_CONFIG: BitrateConfig = {
  minBitrate: 16000,      // 16 kbps
  maxBitrate: 128000,     // 128 kbps
  initialBitrate: 64000,  // 64 kbps
  stepSize: 8000,         // 8 kbps steps
  rttThreshold: 150,      // 150 ms
  jitterThreshold: 30,    // 30 ms
  lossThreshold: 2,       // 2% packet loss
  updateInterval: 5000,   // 5 seconds
};

/**
 * Adaptive Bitrate Controller
 * Adjusts Opus bitrate based on network conditions
 */
export class AdaptiveBitrateController {
  private config: BitrateConfig;
  private currentBitrate: number;
  private networkHistory: NetworkStats[] = [];
  private readonly maxHistorySize: number = 20;
  private lastUpdate: number = 0;
  private consecutiveGood: number = 0;
  private consecutiveBad: number = 0;
  private stabilityCounter: number = 0;

  constructor(config: Partial<BitrateConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.currentBitrate = this.config.initialBitrate;
    logger.info('Adaptive bitrate controller initialized', this.config);
  }

  /**
   * Update network statistics and adjust bitrate
   */
  update(stats: NetworkStats): AdaptiveBitrateResult {
    this.networkHistory.push(stats);
    if (this.networkHistory.length > this.maxHistorySize) {
      this.networkHistory.shift();
    }

    const now = Date.now();
    if (now - this.lastUpdate < this.config.updateInterval) {
      return this.getCurrentResult('interval not reached');
    }

    this.lastUpdate = now;
    return this.adjustBitrate(stats);
  }

  /**
   * Adjust bitrate based on current network conditions
   */
  private adjustBitrate(stats: NetworkStats): AdaptiveBitrateResult {
    const quality = this.assessNetworkQuality(stats);
    let newBitrate = this.currentBitrate;
    let reason = '';

    switch (quality) {
      case 'excellent':
        this.consecutiveGood++;
        this.consecutiveBad = 0;

        // Increase bitrate more aggressively after sustained good quality
        if (this.consecutiveGood >= 3) {
          newBitrate = Math.min(this.currentBitrate + this.config.stepSize * 2, this.config.maxBitrate);
          reason = 'sustained excellent quality';
        } else {
          newBitrate = Math.min(this.currentBitrate + this.config.stepSize, this.config.maxBitrate);
          reason = 'excellent quality';
        }
        break;

      case 'good':
        this.consecutiveGood++;
        this.consecutiveBad = 0;

        if (this.consecutiveGood >= 5) {
          newBitrate = Math.min(this.currentBitrate + this.config.stepSize, this.config.maxBitrate);
          reason = 'sustained good quality';
        } else {
          reason = 'good quality (stable)';
        }
        break;

      case 'fair':
        this.consecutiveBad++;
        this.consecutiveGood = 0;

        if (this.consecutiveBad >= 2) {
          newBitrate = Math.max(this.currentBitrate - this.config.stepSize, this.config.minBitrate);
          reason = 'degrading quality';
        } else {
          reason = 'fair quality (stable)';
        }
        break;

      case 'poor':
        this.consecutiveBad++;
        this.consecutiveGood = 0;

        // Aggressive reduction for poor quality
        newBitrate = Math.max(this.currentBitrate - this.config.stepSize * 2, this.config.minBitrate);
        reason = 'poor quality';
        break;
    }

    // Stability check - avoid rapid oscillations
    if (newBitrate !== this.currentBitrate) {
      this.stabilityCounter++;
      if (this.stabilityCounter < 2) {
        // Wait for confirmation before applying change
        return this.getCurrentResult('stabilizing');
      }
      this.stabilityCounter = 0;
    } else {
      this.stabilityCounter = 0;
    }

    const oldBitrate = this.currentBitrate;
    this.currentBitrate = newBitrate;

    logger.info('Bitrate adjusted', {
      oldBitrate,
      newBitrate,
      quality,
      rtt: stats.rtt,
      jitter: stats.jitter,
      packetLoss: stats.packetLoss,
      reason,
    });

    return {
      bitrate: this.currentBitrate,
      reason,
      networkQuality: quality,
    };
  }

  /**
   * Assess network quality based on statistics
   */
  private assessNetworkQuality(stats: NetworkStats): 'excellent' | 'good' | 'fair' | 'poor' {
    const rttScore = this.scoreRTT(stats.rtt);
    const jitterScore = this.scoreJitter(stats.jitter);
    const lossScore = this.scorePacketLoss(stats.packetLoss);

    // Weighted average
    const avgScore = (rttScore * 0.3 + jitterScore * 0.3 + lossScore * 0.4);

    if (avgScore >= 0.85) return 'excellent';
    if (avgScore >= 0.65) return 'good';
    if (avgScore >= 0.4) return 'fair';
    return 'poor';
  }

  private scoreRTT(rtt: number): number {
    if (rtt <= 50) return 1.0;
    if (rtt <= 100) return 0.9;
    if (rtt <= 150) return 0.7;
    if (rtt <= 250) return 0.5;
    if (rtt <= 400) return 0.3;
    return 0.1;
  }

  private scoreJitter(jitter: number): number {
    if (jitter <= 10) return 1.0;
    if (jitter <= 20) return 0.9;
    if (jitter <= 30) return 0.7;
    if (jitter <= 50) return 0.5;
    if (jitter <= 100) return 0.3;
    return 0.1;
  }

  private scorePacketLoss(loss: number): number {
    if (loss <= 0.1) return 1.0;
    if (loss <= 0.5) return 0.9;
    if (loss <= 1) return 0.8;
    if (loss <= 2) return 0.6;
    if (loss <= 5) return 0.3;
    if (loss <= 10) return 0.15;
    return 0.05;
  }

  private getCurrentResult(reason: string): AdaptiveBitrateResult {
    return {
      bitrate: this.currentBitrate,
      reason,
      networkQuality: this.assessNetworkQuality(this.getAverageStats()),
    };
  }

  private getAverageStats(): NetworkStats {
    if (this.networkHistory.length === 0) {
      return { rtt: 100, jitter: 20, packetLoss: 1, bandwidth: 1000, timestamp: Date.now() };
    }

    const sum = this.networkHistory.reduce(
      (acc, s) => ({
        rtt: acc.rtt + s.rtt,
        jitter: acc.jitter + s.jitter,
        packetLoss: acc.packetLoss + s.packetLoss,
        bandwidth: acc.bandwidth + s.bandwidth,
        timestamp: 0,
      }),
      { rtt: 0, jitter: 0, packetLoss: 0, bandwidth: 0, timestamp: 0 }
    );

    const len = this.networkHistory.length;
    return {
      rtt: sum.rtt / len,
      jitter: sum.jitter / len,
      packetLoss: sum.packetLoss / len,
      bandwidth: sum.bandwidth / len,
      timestamp: Date.now(),
    };
  }

  /**
   * Get current bitrate
   */
  getBitrate(): number {
    return this.currentBitrate;
  }

  /**
   * Set bitrate manually (override adaptive)
   */
  setBitrate(bitrate: number): void {
    this.currentBitrate = Math.max(this.config.minBitrate, Math.min(this.config.maxBitrate, bitrate));
    this.consecutiveGood = 0;
    this.consecutiveBad = 0;
    logger.info('Bitrate manually set', { bitrate: this.currentBitrate });
  }

  /**
   * Reset controller to initial state
   */
  reset(): void {
    this.currentBitrate = this.config.initialBitrate;
    this.networkHistory = [];
    this.consecutiveGood = 0;
    this.consecutiveBad = 0;
    this.stabilityCounter = 0;
    this.lastUpdate = 0;
    logger.info('Adaptive bitrate controller reset');
  }

  /**
   * Get network quality stats
   */
  getStats(): {
    currentBitrate: number;
    networkQuality: 'excellent' | 'good' | 'fair' | 'poor';
    averageStats: NetworkStats;
    historySize: number;
  } {
    return {
      currentBitrate: this.currentBitrate,
      networkQuality: this.assessNetworkQuality(this.getAverageStats()),
      averageStats: this.getAverageStats(),
      historySize: this.networkHistory.length,
    };
  }
}

/**
 * Network Monitor for collecting statistics
 * Integrates with Discord voice connection and TeamSpeak
 */
export class NetworkMonitor {
  private rttSamples: number[] = [];
  private jitterSamples: number[] = [];
  private packetLossCount: number = 0;
  private totalPackets: number = 0;
  private lastSequence: number = -1;
  private lastTimestamp: number = Date.now();
  private readonly maxSamples: number = 50;

  /**
   * Record received packet for jitter/loss calculation
   */
  recordPacket(sequence: number, timestamp: number): void {
    if (this.lastSequence >= 0) {
      const expected = this.lastSequence + 1;
      if (sequence > expected) {
        this.packetLossCount += sequence - expected;
      }
      this.totalPackets += sequence - this.lastSequence;
    }
    this.lastSequence = sequence;

    // Calculate RTT if we have a timestamp
    const now = Date.now();
    const rtt = now - timestamp;
    if (rtt > 0 && rtt < 2000) {
      this.rttSamples.push(rtt);
      if (this.rttSamples.length > this.maxSamples) {
        this.rttSamples.shift();
      }
    }

    this.lastTimestamp = now;
  }

  /**
   * Get current network statistics
   */
  getStats(): NetworkStats {
    const rtt = this.rttSamples.length > 0
      ? this.rttSamples.reduce((a, b) => a + b, 0) / this.rttSamples.length
      : 100;

    // Calculate jitter as mean absolute deviation
    let jitter = 0;
    if (this.rttSamples.length > 1) {
      const diffs = [];
      for (let i = 1; i < this.rttSamples.length; i++) {
        diffs.push(Math.abs(this.rttSamples[i] - this.rttSamples[i - 1]));
      }
      jitter = diffs.reduce((a, b) => a + b, 0) / diffs.length;
    }

    const packetLoss = this.totalPackets > 0
      ? (this.packetLossCount / this.totalPackets) * 100
      : 0;

    return {
      rtt,
      jitter,
      packetLoss: Math.min(packetLoss, 100),
      bandwidth: this.estimateBandwidth(),
      timestamp: Date.now(),
    };
  }

  private estimateBandwidth(): number {
    // Rough estimate based on RTT and packet size
    // Assuming Opus frames of ~400 bytes at 50fps = ~160 kbps max
    return 128; // kbps
  }

  reset(): void {
    this.rttSamples = [];
    this.jitterSamples = [];
    this.packetLossCount = 0;
    this.totalPackets = 0;
    this.lastSequence = -1;
  }
}