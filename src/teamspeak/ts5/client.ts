/**
 * TeamSpeak 5 WebSocket Client
 * Modern WebSocket-based connection to TeamSpeak 5 Server
 */

import { EventEmitter } from 'node:events';
import WebSocket from 'ws';
import { createLogger } from '../../shared/utils/logger.js';
import { BridgeError, ConnectionError, TeamSpeakError } from '../../shared/utils/errors.js';
import type {
  TS5WebSocketConfig,
  TS5WebSocketMessage,
  TS5AuthMessage,
  TS5SubscribeMessage,
  TS5EventMessage,
  TS5Event,
  TS5ClientConnectEvent,
  TS5ClientDisconnectEvent,
  TS5ClientMoveEvent,
  TS5ClientTalkEvent,
  TS5TextMessageEvent,
  TSConnectionState,
  TSConnectionStatus,
} from '../types.js';
import { tsEventEmitter } from '../events/index.js';

const logger = createLogger('teamspeak:ts5');

interface PendingRequest {
  resolve: (value: unknown) => void;
  reject: (error: Error) => void;
  timeout: ReturnType<typeof setTimeout>;
}

export class TS5WebSocketClient extends EventEmitter {
  private ws: WebSocket | null = null;
  private config: TS5WebSocketConfig;
  private state: TSConnectionState = 'disconnected';
  private status: TSConnectionStatus;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private heartbeatTimer: ReturnType<typeof setTimeout> | null = null;
  private requestId: number = 0;
  private pendingRequests: Map<string, PendingRequest> = new Map();
  private isShuttingDown: boolean = false;
  private authenticated: boolean = false;
  private serverVersion: string = '';
  private serverName: string = '';

  constructor(config: TS5WebSocketConfig) {
    super();
    this.config = config;
    this.status = {
      state: 'disconnected',
      reconnectAttempts: 0,
    };
  }

  // ========================================================================
  // Public API
  // ========================================================================

  getState(): TSConnectionState {
    return this.state;
  }

  getStatus(): TSConnectionStatus {
    return { ...this.status };
  }

  getConfig(): TS5WebSocketConfig {
    return { ...this.config };
  }

  getServerInfo() {
    return {
      version: this.serverVersion,
      name: this.serverName,
    };
  }

  isConnected(): boolean {
    return this.state === 'connected' && this.ws !== null && this.ws.readyState === WebSocket.OPEN && this.authenticated;
  }

  isAuthenticated(): boolean {
    return this.authenticated;
  }

  // ========================================================================
  // Connection Management
  // ========================================================================

  async connect(): Promise<void> {
    if (this.state === 'connecting' || this.isConnected()) {
      logger.warn('Already connecting or connected');
      return;
    }

    this.isShuttingDown = false;
    this.authenticated = false;
    this.setState('connecting');
    logger.info('Connecting to TeamSpeak 5 WebSocket', {
      host: this.config.host,
      port: this.config.port,
    });

    return new Promise((resolve, reject) => {
      const url = `ws://${this.config.host}:${this.config.port}`;
      this.ws = new WebSocket(url);

      this.ws.on('open', () => this.onOpen(resolve));
      this.ws.on('error', (error) => this.onError(error, reject));
      this.ws.on('close', (code, reason) => this.onClose(code, reason));
      this.ws.on('message', (data) => this.onMessage(data));
    });
  }

  async disconnect(): Promise<void> {
    this.isShuttingDown = true;
    this.clearTimers();

    if (this.ws) {
      if (this.isConnected()) {
        try {
          await this.sendRequest('disconnect', {});
        } catch {
          // Ignore errors during shutdown
        }
      }

      this.ws.close();
      this.ws = null;
    }

    this.clearPendingRequests(new Error('Disconnected'));
    this.authenticated = false;
    this.setState('disconnected');
    logger.info('Disconnected from TeamSpeak 5 WebSocket');
  }

  async reconnect(): Promise<void> {
    if (this.isShuttingDown) return;

    this.clearTimers();
    this.status.reconnectAttempts++;

    if (this.status.reconnectAttempts > this.config.maxReconnectAttempts) {
      logger.error('Max reconnect attempts reached');
      this.setState('error');
      this.emit('error', new ConnectionError(
        'Max reconnect attempts reached',
        this.config.host,
        this.config.port,
        false
      ));
      return;
    }

    this.setState('reconnecting');
    logger.info('Reconnecting...', {
      attempt: this.status.reconnectAttempts,
      maxAttempts: this.config.maxReconnectAttempts,
    });

    tsEventEmitter.emit('connection:reconnecting', this.status.reconnectAttempts, this.config.maxReconnectAttempts);

    this.reconnectTimer = setTimeout(async () => {
      try {
        await this.connect();
      } catch (error) {
        logger.error('Reconnection failed', { error });
      }
    }, this.config.reconnectInterval);
  }

  // ========================================================================
  // Request/Response
  // ========================================================================

  async sendRequest(method: string, params: Record<string, unknown> = {}): Promise<unknown> {
    if (!this.isConnected()) {
      throw new ConnectionError('Not connected or not authenticated', this.config.host, this.config.port, true);
    }

    const id = `req_${++this.requestId}_${Date.now()}`;

    logger.debug('Sending request', { method, id });

    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.pendingRequests.delete(id);
        reject(new BridgeError(`Request timeout: ${method}`, 'REQUEST_TIMEOUT', 504, { method, id }));
      }, 30000);

      const pending: PendingRequest = { resolve, reject, timeout };
      this.pendingRequests.set(id, pending);

      const message: TS5WebSocketMessage = {
        type: 'request',
        requestId: id,
        payload: { method, params },
      };

      this.sendMessage(message);
    });
  }

  async sendNotification(method: string, params: Record<string, unknown> = {}): Promise<void> {
    if (!this.isConnected()) {
      throw new ConnectionError('Not connected or not authenticated', this.config.host, this.config.port, true);
    }

    const message: TS5WebSocketMessage = {
      type: 'notification',
      payload: { method, params },
    };

    this.sendMessage(message);
  }

  private sendMessage(message: TS5WebSocketMessage): void {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(message));
    }
  }

  // ========================================================================
  // High-level Methods
  // ========================================================================

  async authenticate(token: string): Promise<void> {
    const response = await this.sendRequest('authenticate', { token });

    if (response && typeof response === 'object' && 'error' in response) {
      const error = response as { error: { code: number; message: string } };
      throw new TeamSpeakError(
        `Authentication failed: ${error.error.message}`,
        error.error.code
      );
    }

    this.authenticated = true;
    logger.info('Authenticated successfully');
  }

  async subscribe(events: string[]): Promise<void> {
    const response = await this.sendRequest('subscribe', { events });

    if (response && typeof response === 'object' && 'error' in response) {
      const error = response as { error: { code: number; message: string } };
      throw new TeamSpeakError(
        `Subscribe failed: ${error.error.message}`,
        error.error.code
      );
    }

    logger.info('Subscribed to events', { events });
  }

  async getServerInfo(): Promise<{ version: string; name: string }> {
    const response = await this.sendRequest('getServerInfo', {});

    if (response && typeof response === 'object' && 'version' in response) {
      this.serverVersion = (response as { version: string }).version;
      this.serverName = (response as { name: string }).name || '';
    }

    return { version: this.serverVersion, name: this.serverName };
  }

  async getClientList(): Promise<unknown[]> {
    const response = await this.sendRequest('getClients', {});
    return (response as { clients: unknown[] })?.clients || [];
  }

  async getChannelList(): Promise<unknown[]> {
    const response = await this.sendRequest('getChannels', {});
    return (response as { channels: unknown[] })?.channels || [];
  }

  async moveClient(clientId: string, channelId: string): Promise<void> {
    await this.sendRequest('moveClient', { clientId, channelId });
  }

  async kickClient(clientId: string, reason: string): Promise<void> {
    await this.sendRequest('kickClient', { clientId, reason });
  }

  async banClient(clientId: string, time: number, reason: string): Promise<void> {
    await this.sendRequest('banClient', { clientId, time, reason });
  }

  async sendMessage(channelId: string, message: string): Promise<void> {
    await this.sendNotification('sendMessage', { channelId, message });
  }

  async createChannel(name: string, parentId?: string, topic?: string, password?: string): Promise<string> {
    const response = await this.sendRequest('createChannel', { name, parentId, topic, password });
    return (response as { channelId: string })?.channelId || '';
  }

  async deleteChannel(channelId: string, force: boolean = false): Promise<void> {
    await this.sendRequest('deleteChannel', { channelId, force });
  }

  // ========================================================================
  // File Transfer (TS5)
  // ========================================================================

  async uploadFile(channelId: string, fileName: string, data: Buffer): Promise<string> {
    const response = await this.sendRequest('uploadFile', {
      channelId,
      fileName,
      data: data.toString('base64'),
    });
    return (response as { fileId: string })?.fileId || '';
  }

  async downloadFile(fileId: string): Promise<Buffer> {
    const response = await this.sendRequest('downloadFile', { fileId });
    const base64Data = (response as { data: string })?.data || '';
    return Buffer.from(base64Data, 'base64');
  }

  async listFiles(channelId: string): Promise<unknown[]> {
    const response = await this.sendRequest('listFiles', { channelId });
    return (response as { files: unknown[] })?.files || [];
  }

  async deleteFile(fileId: string): Promise<void> {
    await this.sendRequest('deleteFile', { fileId });
  }

  // ========================================================================
  // Private Methods
  // ========================================================================

  private onOpen(resolve: (value: void) => void): void {
    logger.debug('WebSocket connected');
    this.setState('connected');

    // Start authentication if token provided
    if (this.config.token) {
      this.authenticate(this.config.token)
        .then(() => {
          this.setupSubscriptions();
          resolve();
        })
        .catch(reject => {
          this.setState('error');
          this.ws?.close();
        });
    } else {
      resolve();
    }
  }

  private setupSubscriptions(): void {
    this.subscribe([
      'clientConnected',
      'clientDisconnected',
      'clientMoved',
      'clientTalking',
      'textMessage',
      'channelCreated',
      'channelDeleted',
      'channelUpdated',
      'serverUpdated',
    ]).catch(error => {
      logger.error('Failed to setup subscriptions', { error });
    });
  }

  private onError(error: Error, reject?: (error: Error) => void): void {
    logger.error('WebSocket error', { error: error.message });

    if (this.state === 'connecting' && reject) {
      reject(new ConnectionError(
        `Connection failed: ${error.message}`,
        this.config.host,
        this.config.port,
        true
      ));
    }

    this.setState('error');
    this.emit('error', error);
  }

  private onClose(code: number, reason: Buffer): void {
    logger.debug('WebSocket closed', { code, reason: reason.toString() });

    this.clearTimers();
    this.authenticated = false;

    if (this.isShuttingDown) {
      this.setState('disconnected');
      return;
    }

    this.setState('disconnected');
    this.emit('close', code === 1000);

    if (!this.isShuttingDown) {
      this.reconnect();
    }
  }

  private onMessage(data: Buffer | string): void {
    try {
      const message = JSON.parse(data.toString());
      this.handleMessage(message);
    } catch (error) {
      logger.error('Failed to parse message', { error, data: data.toString() });
    }
  }

  private handleMessage(message: TS5WebSocketMessage): void {
    switch (message.type) {
      case 'response':
        this.handleResponse(message);
        break;
      case 'event':
        this.handleEvent(message);
        break;
      case 'notification':
        this.handleNotification(message);
        break;
      case 'error':
        this.handleError(message);
        break;
    }
  }

  private handleResponse(message: TS5WebSocketMessage & { requestId: string }): void {
    const pending = this.pendingRequests.get(message.requestId);
    if (pending) {
      this.pendingRequests.delete(message.requestId);
      clearTimeout(pending.timeout);

      if ('error' in message.payload) {
        const error = message.payload as { error: { code: number; message: string } };
        pending.reject(new TeamSpeakError(error.message, error.code));
      } else {
        pending.resolve(message.payload);
      }
    }
  }

  private handleEvent(message: TS5EventMessage): void {
    const event = message.payload as { event: string; data: unknown };

    logger.debug('Received event', { event: event.event });

    tsEventEmitter.emit('raw:notify', { ...event.data, platform: 'ts5', event: event.event });

    switch (event.event) {
      case 'clientConnected':
        tsEventEmitter.emit('client:connect', { ...event.data, platform: 'ts5', timestamp: Date.now() });
        break;
      case 'clientDisconnected':
        tsEventEmitter.emit('client:disconnect', { ...event.data, platform: 'ts5', timestamp: Date.now() });
        break;
      case 'clientMoved':
        tsEventEmitter.emit('client:move', { ...event.data, platform: 'ts5', timestamp: Date.now() });
        break;
      case 'clientTalking':
        tsEventEmitter.emit('client:talk', { ...event.data, platform: 'ts5', timestamp: Date.now() });
        break;
      case 'textMessage':
        tsEventEmitter.emit('chat:message', { ...event.data, platform: 'ts5', timestamp: Date.now() });
        break;
      case 'channelCreated':
      case 'channelDeleted':
      case 'channelUpdated':
        tsEventEmitter.emit('channel:update', { ...event.data, platform: 'ts5', timestamp: Date.now() });
        break;
    }
  }

  private handleNotification(message: TS5WebSocketMessage): void {
    logger.debug('Received notification', { payload: message.payload });
  }

  private handleError(message: TS5WebSocketMessage): void {
    const error = message.payload as { code: number; message: string };
    logger.error('Server error', { code: error.code, message: error.message });
    this.emit('error', new TeamSpeakError(error.message, error.code));
  }

  private setState(state: TSConnectionState): void {
    const oldState = this.state;
    this.state = state;
    this.status.state = state;

    if (state === 'connected') {
      this.status.lastConnected = new Date();
      this.status.reconnectAttempts = 0;
    } else if (state === 'disconnected') {
      this.status.lastDisconnected = new Date();
    }

    logger.debug('State changed', { from: oldState, to: state });
    tsEventEmitter.emit('connection:state', state, this.getStatus());

    if (state === 'connected') {
      this.startHeartbeat();
      tsEventEmitter.emit('connection:ready', this.getStatus());
    } else {
      this.stopHeartbeat();
    }
  }

  private startHeartbeat(): void {
    this.stopHeartbeat();
    this.heartbeatTimer = setInterval(() => {
      if (this.isConnected()) {
        this.sendRequest('ping', {}).catch(() => {
          // Ignore ping errors
        });
      }
    }, 30000);
  }

  private stopHeartbeat(): void {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }
  }

  private clearTimers(): void {
    this.stopHeartbeat();
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
  }

  private clearPendingRequests(error: Error): void {
    for (const [, pending] of this.pendingRequests) {
      clearTimeout(pending.timeout);
      pending.reject(error);
    }
    this.pendingRequests.clear();
  }

  private async rejectPendingRequests(): Promise<void> {
    const error = new Error('Connection lost');
    for (const [, pending] of this.pendingRequests) {
      clearTimeout(pending.timeout);
      pending.reject(error);
    }
    this.pendingRequests.clear();
  }
}

// ========================================================================
// Factory Function
// ========================================================================

export function createTS5Client(config: TS5WebSocketConfig): TS5WebSocketClient {
  return new TS5WebSocketClient(config);
}