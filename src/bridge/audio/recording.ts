/**
 * Audio Recording Module
 * Optional session recording to disk
 */

import { createLogger } from '../../shared/utils/logger.js';
import { BridgeError } from '../../shared/utils/errors.js';
import { writeFileSync, mkdirSync, existsSync, appendFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const logger = createLogger('bridge:audio:recording');

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

export interface RecordingConfig {
  outputDir: string;
  sampleRate: number;
  channels: number;
  bitDepth: 16 | 24 | 32;
  format: 'wav' | 'ogg' | 'mp3' | 'flac';
  maxFileSize: number;        // Max size in bytes before rotation
  maxDuration: number;        // Max duration in seconds before rotation
  filenameTemplate: string;   // Template with {date}, {time}, {session}
  enableCompression: boolean;
  compressionLevel: number;   // 0-9 for FLAC/OGG
}

export interface RecordingMetadata {
  sessionId: string;
  startTime: number;
  endTime?: number;
  duration: number;
  sampleRate: number;
  channels: number;
  bitDepth: number;
  format: string;
  fileSize: number;
  filePath: string;
  participants: string[];
}

const DEFAULT_CONFIG: RecordingConfig = {
  outputDir: resolve(__dirname, '../../../data/recordings'),
  sampleRate: 48000,
  channels: 2,
  bitDepth: 16,
  format: 'wav',
  maxFileSize: 100 * 1024 * 1024, // 100 MB
  maxDuration: 3600, // 1 hour
  filenameTemplate: 'recording-{date}-{time}-{session}',
  enableCompression: false,
  compressionLevel: 5,
};

/**
 * WAV File Writer
 * Handles writing PCM audio to WAV format
 */
class WAVWriter {
  private filePath: string;
  private fileHandle: number | null = null;
  private dataSize: number = 0;
  private sampleRate: number;
  private channels: number;
  private bitDepth: number;
  private headerWritten: boolean = false;

  constructor(filePath: string, sampleRate: number, channels: number, bitDepth: number) {
    this.filePath = filePath;
    this.sampleRate = sampleRate;
    this.channels = channels;
    this.bitDepth = bitDepth;
  }

  /**
   * Open file and write WAV header
   */
  open(): void {
    const fs = require('node:fs');
    this.fileHandle = fs.openSync(this.filePath, 'w');
    this.writeHeader();
  }

  /**
   * Write WAV header (placeholder - updated on close)
   */
  private writeHeader(): void {
    const fs = require('node:fs');
    const header = Buffer.alloc(44);

    // RIFF header
    header.write('RIFF', 0);
    header.writeUInt32LE(0, 4); // File size - 8 (placeholder)
    header.write('WAVE', 8);

    // fmt chunk
    header.write('fmt ', 12);
    header.writeUInt32LE(16, 16); // Subchunk size
    header.writeUInt16LE(1, 20); // Audio format (PCM = 1)
    header.writeUInt16LE(this.channels, 22);
    header.writeUInt32LE(this.sampleRate, 24);
    header.writeUInt32LE(this.sampleRate * this.channels * (this.bitDepth / 8), 28); // Byte rate
    header.writeUInt16LE(this.channels * (this.bitDepth / 8), 32); // Block align
    header.writeUInt16LE(this.bitDepth, 34); // Bits per sample

    // data chunk
    header.write('data', 36);
    header.writeUInt32LE(0, 40); // Data size (placeholder)

    fs.writeSync(this.fileHandle!, header, 0, header.length);
    this.headerWritten = true;
  }

  /**
   * Write audio data (Float32Array)
   */
  write(audio: Float32Array): void {
    if (!this.fileHandle) {
      throw new Error('WAV writer not open');
    }

    const fs = require('node:fs');
    const bytesPerSample = this.bitDepth / 8;
    const buffer = Buffer.alloc(audio.length * bytesPerSample);

    for (let i = 0; i < audio.length; i++) {
      let sample = Math.max(-1, Math.min(1, audio[i]));

      if (this.bitDepth === 16) {
        const value = sample < 0 ? sample * 0x8000 : sample * 0x7FFF;
        buffer.writeInt16LE(value, i * 2);
      } else if (this.bitDepth === 24) {
        const value = sample < 0 ? sample * 0x800000 : sample * 0x7FFFFF;
        buffer.writeIntLE(value, i * 3, 3);
      } else if (this.bitDepth === 32) {
        const value = sample < 0 ? sample * 0x80000000 : sample * 0x7FFFFFFF;
        buffer.writeInt32LE(value, i * 4);
      }
    }

    fs.writeSync(this.fileHandle!, buffer);
    this.dataSize += buffer.length;
  }

  /**
   * Close file and update header with correct sizes
   */
  close(): void {
    if (!this.fileHandle) return;

    const fs = require('node:fs');

    // Update RIFF size (file size - 8)
    const riffSize = this.dataSize + 36;
    const riffBuffer = Buffer.alloc(4);
    riffBuffer.writeUInt32LE(riffSize, 0);
    fs.writeSync(this.fileHandle!, riffBuffer, 0, 4, 4);

    // Update data chunk size
    const dataBuffer = Buffer.alloc(4);
    dataBuffer.writeUInt32LE(this.dataSize, 0);
    fs.writeSync(this.fileHandle!, dataBuffer, 0, 4, 40);

    fs.closeSync(this.fileHandle);
    this.fileHandle = null;
  }

  getDataSize(): number {
    return this.dataSize;
  }
}

/**
 * Audio Recorder
 * Manages session recording with automatic rotation
 */
export class AudioRecorder {
  private config: RecordingConfig;
  private writer: WAVWriter | null = null;
  private metadata: RecordingMetadata;
  private isRecording: boolean = false;
  private startTime: number = 0;
  private frameCount: number = 0;
  private sessionId: string;
  private rotationTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(config: Partial<RecordingConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.sessionId = this.generateSessionId();
    this.metadata = this.createMetadata();

    // Ensure output directory exists
    if (!existsSync(this.config.outputDir)) {
      mkdirSync(this.config.outputDir, { recursive: true });
    }

    logger.info('Audio recorder initialized', {
      outputDir: this.config.outputDir,
      format: this.config.format,
      sampleRate: this.config.sampleRate,
    });
  }

  /**
   * Start recording
   */
  start(participants: string[] = []): void {
    if (this.isRecording) {
      logger.warn('Recording already in progress');
      return;
    }

    this.metadata.participants = participants;
    this.startTime = Date.now();
    this.frameCount = 0;

    const filePath = this.generateFilePath();
    this.writer = new WAVWriter(
      filePath,
      this.config.sampleRate,
      this.config.channels,
      this.config.bitDepth
    );

    this.writer.open();
    this.isRecording = true;

    this.metadata.filePath = filePath;
    this.metadata.startTime = this.startTime;

    // Set up rotation timer
    if (this.config.maxDuration > 0) {
      this.rotationTimer = setTimeout(() => {
        this.rotate();
      }, this.config.maxDuration * 1000);
    }

    logger.info('Recording started', {
      filePath,
      participants: participants.length,
    });
  }

  /**
   * Stop recording
   */
  stop(): RecordingMetadata | null {
    if (!this.isRecording || !this.writer) {
      logger.warn('No active recording to stop');
      return null;
    }

    this.writer.close();
    this.isRecording = false;

    if (this.rotationTimer) {
      clearTimeout(this.rotationTimer);
      this.rotationTimer = null;
    }

    const endTime = Date.now();
    this.metadata.endTime = endTime;
    this.metadata.duration = (endTime - this.startTime) / 1000;
    this.metadata.fileSize = this.writer.getDataSize();

    // Save metadata
    this.saveMetadata();

    logger.info('Recording stopped', {
      duration: this.metadata.duration,
      fileSize: this.metadata.fileSize,
      filePath: this.metadata.filePath,
    });

    return { ...this.metadata };
  }

  /**
   * Write audio frame
   */
  write(audio: Float32Array): void {
    if (!this.isRecording || !this.writer) {
      return;
    }

    this.writer.write(audio);
    this.frameCount++;

    // Check file size for rotation
    if (this.writer.getDataSize() >= this.config.maxFileSize) {
      this.rotate();
    }
  }

  /**
   * Rotate recording file
   */
  private rotate(): void {
    logger.info('Rotating recording file');

    const oldMetadata = this.stop();
    this.sessionId = this.generateSessionId();
    this.metadata = this.createMetadata();
    this.metadata.participants = oldMetadata?.participants ?? [];
    this.start(this.metadata.participants);
  }

  /**
   * Get current recording status
   */
  getStatus(): {
    isRecording: boolean;
    duration: number;
    fileSize: number;
    frameCount: number;
    currentFile: string;
  } {
    return {
      isRecording: this.isRecording,
      duration: this.isRecording ? (Date.now() - this.startTime) / 1000 : 0,
      fileSize: this.writer?.getDataSize() ?? 0,
      frameCount: this.frameCount,
      currentFile: this.metadata.filePath,
    };
  }

  /**
   * Pause recording (keeps file open)
   */
  pause(): void {
    if (this.isRecording) {
      this.isRecording = false;
      logger.info('Recording paused');
    }
  }

  /**
   * Resume recording
   */
  resume(): void {
    if (!this.isRecording && this.writer) {
      this.isRecording = true;
      this.startTime = Date.now() - this.metadata.duration * 1000;
      logger.info('Recording resumed');
    }
  }

  private generateSessionId(): string {
    return `session-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }

  private createMetadata(): RecordingMetadata {
    return {
      sessionId: this.sessionId,
      startTime: 0,
      duration: 0,
      sampleRate: this.config.sampleRate,
      channels: this.config.channels,
      bitDepth: this.config.bitDepth,
      format: this.config.format,
      fileSize: 0,
      filePath: '',
      participants: [],
    };
  }

  private generateFilePath(): string {
    const now = new Date();
    const date = now.toISOString().split('T')[0].replace(/-/g, '');
    const time = now.toTimeString().split(' ')[0].replace(/:/g, '');

    const filename = this.config.filenameTemplate
      .replace('{date}', date)
      .replace('{time}', time)
      .replace('{session}', this.sessionId);

    return resolve(this.config.outputDir, `${filename}.${this.config.format}`);
  }

  private saveMetadata(): void {
    const metaPath = this.metadata.filePath.replace(/\.\w+$/, '.json');
    writeFileSync(metaPath, JSON.stringify(this.metadata, null, 2));
  }
}

/**
 * Multi-track Recorder
 * Records each participant separately + mixed output
 */
export interface MultiTrackConfig extends RecordingConfig {
  recordMixed: boolean;
  recordIndividual: boolean;
}

export class MultiTrackRecorder {
  private config: MultiTrackConfig;
  private mixedRecorder: AudioRecorder | null = null;
  private individualRecorders: Map<string, AudioRecorder> = new Map();
  private isRecording: boolean = false;
  private startTime: number = 0;
  private participants: string[] = [];

  constructor(config: Partial<MultiTrackConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config } as MultiTrackConfig;
  }

  start(participants: string[]): void {
    if (this.isRecording) return;

    this.participants = participants;
    this.startTime = Date.now();
    this.isRecording = true;

    if (this.config.recordMixed) {
      this.mixedRecorder = new AudioRecorder(this.config);
      this.mixedRecorder.start(participants);
    }

    if (this.config.recordIndividual) {
      for (const participant of participants) {
        const recorder = new AudioRecorder({
          ...this.config,
          filenameTemplate: `${this.config.filenameTemplate}-${participant}`,
        });
        recorder.start([participant]);
        this.individualRecorders.set(participant, recorder);
      }
    }

    logger.info('Multi-track recording started', {
      participants: participants.length,
      mixed: this.config.recordMixed,
      individual: this.config.recordIndividual,
    });
  }

  writeMixed(audio: Float32Array): void {
    this.mixedRecorder?.write(audio);
  }

  writeIndividual(participantId: string, audio: Float32Array): void {
    const recorder = this.individualRecorders.get(participantId);
    recorder?.write(audio);
  }

  stop(): {
    mixed?: RecordingMetadata;
    individual: RecordingMetadata[];
  } {
    this.isRecording = false;

    const mixed = this.mixedRecorder?.stop();
    const individual: RecordingMetadata[] = [];

    for (const [participant, recorder] of this.individualRecorders) {
      const meta = recorder.stop();
      if (meta) individual.push(meta);
    }

    this.individualRecorders.clear();
    this.mixedRecorder = null;

    logger.info('Multi-track recording stopped', {
      mixed: !!mixed,
      individualTracks: individual.length,
    });

    return { mixed, individual };
  }

  getStatus(): {
    isRecording: boolean;
    duration: number;
    tracks: { participant: string; duration: number; fileSize: number }[];
  } {
    const tracks: { participant: string; duration: number; fileSize: number }[] = [];

    for (const [participant, recorder] of this.individualRecorders) {
      const status = recorder.getStatus();
      tracks.push({
        participant,
        duration: status.duration,
        fileSize: status.fileSize,
      });
    }

    if (this.mixedRecorder) {
      const status = this.mixedRecorder.getStatus();
      tracks.unshift({
        participant: 'MIXED',
        duration: status.duration,
        fileSize: status.fileSize,
      });
    }

    return {
      isRecording: this.isRecording,
      duration: this.isRecording ? (Date.now() - this.startTime) / 1000 : 0,
      tracks,
    };
  }
}

/**
 * Recording Manager - High-level interface for managing recordings
 */
export class RecordingManager {
  private config: RecordingConfig;
  private currentRecorder: AudioRecorder | null = null;
  private multiTrackRecorder: MultiTrackRecorder | null = null;
  private recordingHistory: RecordingMetadata[] = [];

  constructor(config: Partial<RecordingConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * Start simple recording
   */
  startRecording(participants: string[] = []): void {
    this.currentRecorder = new AudioRecorder(this.config);
    this.currentRecorder.start(participants);
  }

  /**
   * Start multi-track recording
   */
  startMultiTrack(participants: string[]): void {
    this.multiTrackRecorder = new MultiTrackRecorder({
      ...this.config,
      recordMixed: true,
      recordIndividual: true,
    });
    this.multiTrackRecorder.start(participants);
  }

  /**
   * Write mixed audio
   */
  writeMixed(audio: Float32Array): void {
    this.currentRecorder?.write(audio);
    this.multiTrackRecorder?.writeMixed(audio);
  }

  /**
   * Write individual participant audio
   */
  writeIndividual(participantId: string, audio: Float32Array): void {
    this.multiTrackRecorder?.writeIndividual(participantId, audio);
  }

  /**
   * Stop current recording
   */
  stopRecording(): RecordingMetadata | null {
    const metadata = this.currentRecorder?.stop();
    if (metadata) {
      this.recordingHistory.push(metadata);
    }
    this.currentRecorder = null;
    return metadata ?? null;
  }

  /**
   * Stop multi-track recording
   */
  stopMultiTrack(): { mixed?: RecordingMetadata; individual: RecordingMetadata[] } | null {
    const result = this.multiTrackRecorder?.stop();
    if (result?.mixed) {
      this.recordingHistory.push(result.mixed);
    }
    if (result?.individual) {
      this.recordingHistory.push(...result.individual);
    }
    this.multiTrackRecorder = null;
    return result ?? null;
  }

  /**
   * Get recording history
   */
  getHistory(): RecordingMetadata[] {
    return [...this.recordingHistory];
  }

  /**
   * Get current status
   */
  getStatus(): {
    simpleRecording: ReturnType<AudioRecorder['getStatus']> | null;
    multiTrack: ReturnType<MultiTrackRecorder['getStatus']> | null;
  } {
    return {
      simpleRecording: this.currentRecorder?.getStatus() ?? null,
      multiTrack: this.multiTrackRecorder?.getStatus() ?? null,
    };
  }
}