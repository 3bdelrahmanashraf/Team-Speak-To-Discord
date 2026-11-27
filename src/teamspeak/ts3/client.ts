/**
 * TeamSpeak 3 Query Client
 * TCP-based connection to TeamSpeak 3 ServerQuery with auto-reconnect
 */

import { createConnection, Socket } from 'node:net';
import { EventEmitter } from 'node:events';
import { createLogger } from '../../shared/utils/logger.js';
import { BridgeError, ConnectionError, TeamSpeakError, TeamSpeakQueryError } from '../../shared/utils/errors.js';
import {
  TS3QueryConfig,
  TS3QueryResponse,
  TS3ClientListEntry,
  TS3ChannelListEntry,
  TS3ServerGroupEntry,
  TS3ChannelGroupEntry,
  TS3PermissionEntry,
  TS3BanEntry,
  TS3ServerEvent,
  TSConnectionState,
  TSConnectionStatus,
  TSConnectionConfig,
} from '../types.js';
import {
  parseQueryResponse,
  parseClientList,
  parseChannelList,
  parseServerGroupList,
  parseChannelGroupList,
  parsePermissionList,
  parseBanList,
  parseNotifyLine,
  buildCommand,
  parseWelcomeMessage,
} from '../parser/query.js';
import { tsEventEmitter } from '../events/index.js';

const logger = createLogger('teamspeak:ts3');

interface PendingCommand {
  resolve: (value: TS3QueryResponse) => void;
  reject: (error: Error) => void;
  timeout: ReturnType<typeof setTimeout>;
  command: string;
}

export class TS3QueryClient extends EventEmitter {
  private socket: Socket | null = null;
  private config: TS3QueryConfig;
  private buffer: string = '';
  private commandQueue: PendingCommand[] = [];
  private commandId: number = 0;
  private state: TSConnectionState = 'disconnected';
  private status: TSConnectionStatus;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private heartbeatTimer: ReturnType<typeof setTimeout> | null = null;
  private isShuttingDown: boolean = false;
  private serverVersion: string = '';
  private serverBuild: number = 0;
  private serverName: string = '';
  private clientId: string = '';

  constructor(config: TS3QueryConfig) {
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

  getConfig(): TS3QueryConfig {
    return { ...this.config };
  }

  getServerInfo() {
    return {
      version: this.serverVersion,
      build: this.serverBuild,
      name: this.serverName,
    };
  }

  getClientId(): string {
    return this.clientId;
  }

  isConnected(): boolean {
    return this.state === 'connected' && this.socket !== null && !this.socket.destroyed;
  }

  // ========================================================================
  // Connection Management
  // ========================================================================

  async connect(): Promise<void> {
    if (this.state === 'connecting' || this.state === 'connected') {
      logger.warn('Already connecting or connected');
      return;
    }

    this.isShuttingDown = false;
    this.setState('connecting');
    logger.info('Connecting to TeamSpeak 3 ServerQuery', {
      host: this.config.host,
      port: this.config.queryPort,
    });

    return new Promise((resolve, reject) => {
      this.socket = createConnection(
        {
          host: this.config.host,
          port: this.config.queryPort,
          timeout: 10000,
        },
        () => this.onSocketConnect()
      );

      this.socket.on('error', (error) => this.onSocketError(error, reject));
      this.socket.on('close', (hadError) => this.onSocketClose(hadError));
      this.socket.on('data', (data) => this.onSocketData(data));

      // Set connection timeout
      const connectTimeout = setTimeout(() => {
        if (this.state === 'connecting') {
          this.socket?.destroy();
          reject(new ConnectionError(
            'Connection timeout',
            this.config.host,
            this.config.queryPort,
            true
          ));
        }
      }, 15000);

      // Store original reject to call after successful auth
      const originalReject = reject;
      const originalResolve = resolve;

      // Override reject to clear timeout
      const wrappedReject = (error: Error) => {
        clearTimeout(connectTimeout);
        originalReject(error);
      };

      // We need to wait for authentication to complete
      const checkAuth = setInterval(() => {
        if (this.state === 'connected') {
          clearInterval(checkAuth);
          clearTimeout(connectTimeout);
          originalResolve();
        } else if (this.state === 'error' || this.state === 'disconnected') {
          clearInterval(checkAuth);
          clearTimeout(connectTimeout);
        }
      }, 100);

      // Store for cleanup
      (this as unknown as { _checkAuth?: ReturnType<typeof setInterval> })._checkAuth = checkAuth;
      (this as unknown as { _wrappedReject?: (error: Error) => void })._wrappedReject = wrappedReject;
    });
  }

  async disconnect(): Promise<void> {
    this.isShuttingDown = true;
    this.clearTimers();

    if (this.socket) {
      // Send quit command before closing
      if (this.state === 'connected') {
        try {
          await this.sendCommand('quit');
        } catch {
          // Ignore errors during shutdown
        }
      }

      this.socket.end();
      this.socket.destroy();
      this.socket = null;
    }

    this.clearCommandQueue(new Error('Disconnected'));
    this.setState('disconnected');
    logger.info('Disconnected from TeamSpeak 3 ServerQuery');
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
        this.config.queryPort,
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
  // Command Execution
  // ========================================================================

  async sendCommand(command: string, params: Record<string, string | number | boolean> = {}): Promise<TS3QueryResponse> {
    if (!this.isConnected()) {
      throw new ConnectionError('Not connected', this.config.host, this.config.queryPort, true);
    }

    const fullCommand = buildCommand(command, params);
    const id = ++this.commandId;

    logger.debug('Sending command', { command: fullCommand, id });

    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.removePendingCommand(id);
        reject(new BridgeError(`Command timeout: ${command}`, 'COMMAND_TIMEOUT', 504, { command, id }));
      }, 30000);

      const pending: PendingCommand = {
        resolve,
        reject,
        timeout,
        command: fullCommand,
      };

      this.commandQueue.push(pending);

      // Send command
      this.socket!.write(fullCommand + '\n');
    });
  }

  async sendCommandRaw(command: string): Promise<TS3QueryResponse> {
    if (!this.isConnected()) {
      throw new ConnectionError('Not connected', this.config.host, this.config.queryPort, true);
    }

    const id = ++this.commandId;

    logger.debug('Sending raw command', { command, id });

    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.removePendingCommand(id);
        reject(new BridgeError(`Command timeout: ${command}`, 'COMMAND_TIMEOUT', 504, { command, id }));
      }, 30000);

      const pending: PendingCommand = {
        resolve,
        reject,
        timeout,
        command,
      };

      this.commandQueue.push(pending);
      this.socket!.write(command + '\n');
    });
  }

  // ========================================================================
  // High-level Commands
  // ========================================================================

  async login(): Promise<void> {
    const response = await this.sendCommand('login', {
      client_login_name: this.config.username,
      client_login_password: this.config.password,
    });

    if (response.error.id !== 0) {
      throw new TeamSpeakQueryError(
        `Login failed: ${response.error.msg}`,
        response.error.id,
        response.error.msg,
        'login',
        { username: this.config.username },
      );
    }

    logger.info('Logged in successfully');
  }

  async useServer(): Promise<void> {
    const response = await this.sendCommand('use', {
      sid: this.config.serverId,
    });

    if (response.error.id !== 0) {
      throw new TeamSpeakQueryError(
        `Failed to select virtual server: ${response.error.msg}`,
        response.error.id,
        response.error.msg,
        'use',
        { serverId: this.config.serverId },
      );
    }

    logger.info('Selected virtual server', { serverId: this.config.serverId });
  }

  async registerEvents(): Promise<void> {
    const response = await this.sendCommand('servernotifyregister', {
      event: 'server',
    });

    if (response.error.id !== 0) {
      throw new TeamSpeakQueryError(
        `Failed to register for server events: ${response.error.msg}`,
        response.error.id,
        response.error.msg,
        'servernotifyregister',
        {},
      );
    }

    logger.info('Registered for server events');
  }

  async setClientNickname(): Promise<void> {
    const response = await this.sendCommand('clientupdate', {
      client_nickname: this.config.nickname,
    });

    if (response.error.id !== 0) {
      logger.warn('Failed to set client nickname', { error: response.error.msg });
    } else {
      logger.info('Set client nickname', { nickname: this.config.nickname });
    }
  }

  async getServerInfo(): Promise<void> {
    const response = await this.sendCommand('serverinfo');
    if (response.error.id === 0 && response.data && response.data.length > 0) {
      const info = response.data[0] as Record<string, string>;
      this.serverName = info.virtualserver_name || '';
      this.serverVersion = info.virtualserver_version || '';
      this.serverBuild = parseInt(info.virtualserver_build || '0', 10);
    }
  }

  async getClientList(): Promise<TS3ClientListEntry[]> {
    const response = await this.sendCommand('clientlist', {
      '-uid': true,
      '-away': true,
      '-voice': true,
      '-times': true,
      '-groups': true,
      '-info': true,
      '-icon': true,
      '-country': true,
      '-ip': true,
    });

    if (response.error.id !== 0) {
      throw new TeamSpeakQueryError(
        `Failed to get client list: ${response.error.msg}`,
        response.error.id,
        response.error.msg,
        'clientlist',
        {},
      );
    }

    return parseClientList(response.data as Record<string, string>[]);
  }

  async getChannelList(): Promise<TS3ChannelListEntry[]> {
    const response = await this.sendCommand('channellist', {
      '-topic': true,
      '-flags': true,
      '-voice': true,
      '-limits': true,
      '-icon': true,
    });

    if (response.error.id !== 0) {
      throw new TeamSpeakQueryError(
        `Failed to get channel list: ${response.error.msg}`,
        response.error.id,
        response.error.msg,
        'channellist',
        {},
      );
    }

    return parseChannelList(response.data as Record<string, string>[]);
  }

  async getServerGroupList(): Promise<TS3ServerGroupEntry[]> {
    const response = await this.sendCommand('servergrouplist');

    if (response.error.id !== 0) {
      throw new TeamSpeakQueryError(
        `Failed to get server group list: ${response.error.msg}`,
        response.error.id,
        response.error.msg,
        'servergrouplist',
        {},
      );
    }

    return parseServerGroupList(response.data as Record<string, string>[]);
  }

  async getChannelGroupList(): Promise<TS3ChannelGroupEntry[]> {
    const response = await this.sendCommand('channelgrouplist');

    if (response.error.id !== 0) {
      throw new TeamSpeakQueryError(
        `Failed to get channel group list: ${response.error.msg}`,
        response.error.id,
        response.error.msg,
        'channelgrouplist',
        {},
      );
    }

    return parseChannelGroupList(response.data as Record<string, string>[]);
  }

  async getPermissionList(groupType: 'servergroup' | 'channelgroup', groupId: string): Promise<TS3PermissionEntry[]> {
    const response = await this.sendCommand('permget', {
      permsid: '',
      permid: 0,
      permvalue: 0,
    });

    if (response.error.id !== 0) {
      throw new TeamSpeakQueryError(
        `Failed to get permissions: ${response.error.msg}`,
        response.error.id,
        response.error.msg,
        'permget',
        { groupType, groupId },
      );
    }

    return parsePermissionList(response.data as Record<string, string>[]);
  }

  async getBanList(): Promise<TS3BanEntry[]> {
    const response = await this.sendCommand('banlist');

    if (response.error.id !== 0) {
      throw new TeamSpeakQueryError(
        `Failed to get ban list: ${response.error.msg}`,
        response.error.id,
        response.error.msg,
        'banlist',
        {},
      );
    }

    return parseBanList(response.data as Record<string, string>[]);
  }

  async moveClient(clid: string, cid: string): Promise<void> {
    const response = await this.sendCommand('clientmove', {
      clid,
      cid,
    });

    if (response.error.id !== 0) {
      throw new TeamSpeakQueryError(
        `Failed to move client: ${response.error.msg}`,
        response.error.id,
        response.error.msg,
        'clientmove',
        { clid, cid },
      );
    }
  }

  async sendMessage(targetMode: number, target: string, message: string): Promise<void> {
    const response = await this.sendCommand('sendtextmessage', {
      targetmode: targetMode,
      target,
      msg: message,
    });

    if (response.error.id !== 0) {
      throw new TeamSpeakQueryError(
        `Failed to send message: ${response.error.msg}`,
        response.error.id,
        response.error.msg,
        'sendtextmessage',
        { targetMode, target, message },
      );
    }
  }

  async kickClient(clid: string, reasonId: number, reasonMsg: string): Promise<void> {
    const response = await this.sendCommand('clientkick', {
      clid,
      reasonid: reasonId,
      reasonmsg: reasonMsg,
    });

    if (response.error.id !== 0) {
      throw new TeamSpeakQueryError(
        `Failed to kick client: ${response.error.msg}`,
        response.error.id,
        response.error.msg,
        'clientkick',
        { clid, reasonId, reasonMsg },
      );
    }
  }

  async banClient(ip: string, name: string, uid: string, time: number, reason: string): Promise<void> {
    const response = await this.sendCommand('banadd', {
      ip,
      name,
      uid,
      time,
      reason,
    });

    if (response.error.id !== 0) {
      throw new TeamSpeakQueryError(
        `Failed to ban client: ${response.error.msg}`,
        response.error.id,
        response.error.msg,
        'banadd',
        { ip, name, uid, time, reason },
      );
    }
  }

  async createChannel(name: string, parentCid?: string, topic?: string, password?: string): Promise<string> {
    const params: Record<string, string | number> = {
      channel_name: name,
      channel_type: 0, // permanent
    };

    if (parentCid) params.cpid = parentCid;
    if (topic) params.channel_topic = topic;
    if (password) params.channel_password = password;

    const response = await this.sendCommand('channelcreate', params);

    if (response.error.id !== 0) {
      throw new TeamSpeakQueryError(
        `Failed to create channel: ${response.error.msg}`,
        response.error.id,
        response.error.msg,
        'channelcreate',
        params,
      );
    }

    const data = response.data?.[0] as Record<string, string> | undefined;
    return data?.cid || '';
  }

  async deleteChannel(cid: string, force: boolean = false): Promise<void> {
    const response = await this.sendCommand('channeldelete', {
      cid,
      force: force ? 1 : 0,
    });

    if (response.error.id !== 0) {
      throw new TeamSpeakQueryError(
        `Failed to delete channel: ${response.error.msg}`,
        response.error.id,
        response.error.msg,
        'channeldelete',
        { cid, force },
      );
    }
  }

  // ========================================================================
  // File Transfer (TS3)
  // ========================================================================

  async uploadFile(channelId: string, fileName: string, data: Buffer): Promise<string> {
    const response = await this.sendCommand('ftinitupload', {
      cid: channelId,
      name: fileName,
      size: data.length,
      overwrite: 1,
      resume: 0,
    });

    if (response.error.id !== 0) {
      throw new TeamSpeakQueryError(
        `Failed to initiate file upload: ${response.error.msg}`,
        response.error.id,
        response.error.msg,
        'ftinitupload',
        { cid: channelId, name: fileName },
      );
    }

    const ftData = response.data?.[0] as Record<string, string> | undefined;
    const ftKey = ftData?.ftkey || '';
    const ftPort = parseInt(ftData?.ftport || '30033', 10);

    if (!ftKey) {
      throw new BridgeError('Failed to get file transfer key', 'FT_KEY_MISSING', 500);
    }

    // Upload file data via separate TCP connection
    await this.uploadFileData(ftKey, ftPort, data);

    // Finalize upload
    const finalizeResponse = await this.sendCommand('ftfinish', {
      ftkey: ftKey,
    });

    if (finalizeResponse.error.id !== 0) {
      throw new TeamSpeakQueryError(
        `Failed to finalize file upload: ${finalizeResponse.error.msg}`,
        finalizeResponse.error.id,
        finalizeResponse.error.msg,
        'ftfinish',
        { ftkey: ftKey },
      );
    }

    return ftKey;
  }

  async downloadFile(ftKey: string): Promise<Buffer> {
    const response = await this.sendCommand('ftinitdownload', {
      ftkey: ftKey,
    });

    if (response.error.id !== 0) {
      throw new TeamSpeakQueryError(
        `Failed to initiate file download: ${response.error.msg}`,
        response.error.id,
        response.error.msg,
        'ftinitdownload',
        { ftkey: ftKey },
      );
    }

    const ftData = response.data?.[0] as Record<string, string> | undefined;
    const ftPort = parseInt(ftData?.ftport || '30033', 10);
    const ftSize = parseInt(ftData?.ftsize || '0', 10);

    if (!ftPort) {
      throw new BridgeError('Failed to get file transfer port', 'FT_PORT_MISSING', 500);
    }

    const data = await this.downloadFileData(ftKey, ftPort, ftSize);
    return data;
  }

  async listFiles(channelId: string): Promise<unknown[]> {
    const response = await this.sendCommand('ftlist', {
      cid: channelId,
    });

    if (response.error.id !== 0) {
      throw new TeamSpeakQueryError(
        `Failed to list files: ${response.error.msg}`,
        response.error.id,
        response.error.msg,
        'ftlist',
        { cid: channelId },
      );
    }

    return response.data || [];
  }

  async deleteFile(channelId: string, fileName: string): Promise<void> {
    const response = await this.sendCommand('ftdeletefile', {
      cid: channelId,
      name: fileName,
    });

    if (response.error.id !== 0) {
      throw new TeamSpeakQueryError(
        `Failed to delete file: ${response.error.msg}`,
        response.error.id,
        response.error.msg,
        'ftdeletefile',
        { cid: channelId, name: fileName },
      );
    }
  }

  async createDirectory(channelId: string, dirName: string): Promise<void> {
    const response = await this.sendCommand('ftmkdir', {
      cid: channelId,
      dirname: dirName,
    });

    if (response.error.id !== 0) {
      throw new TeamSpeakQueryError(
        `Failed to create directory: ${response.error.msg}`,
        response.error.id,
        response.error.msg,
        'ftmkdir',
        { cid: channelId, dirname: dirName },
      );
    }
  }

  // ========================================================================
  // File Transfer Private Methods
  // ========================================================================

  private async uploadFileData(ftKey: string, port: number, data: Buffer): Promise<void> {
    return new Promise((resolve, reject) => {
      const socket = createConnection({
        host: this.config.host,
        port,
      });

      socket.on('connect', () => {
        // Send file transfer handshake
        const handshake = Buffer.from(`FT ${ftKey}\n`);
        socket.write(handshake);

        // Send file data in chunks
        const chunkSize = 65536;
        let offset = 0;

        const sendChunk = () => {
          if (offset >= data.length) {
            socket.end();
            return;
          }

          const chunk = data.subarray(offset, offset + chunkSize);
          offset += chunk.length;

          socket.write(chunk, () => {
            setImmediate(sendChunk);
          });
        };

        sendChunk();
      });

      socket.on('error', reject);
      socket.on('close', () => resolve());
      socket.on('timeout', () => {
        socket.destroy();
        reject(new Error('File upload timeout'));
      });

      socket.setTimeout(60000);
    });
  }

  private async downloadFileData(ftKey: string, port: number, size: number): Promise<Buffer> {
    return new Promise((resolve, reject) => {
      const socket = createConnection({
        host: this.config.host,
        port,
      });

      const chunks: Buffer[] = [];
      let received = 0;

      socket.on('connect', () => {
        const handshake = Buffer.from(`FT ${ftKey}\n`);
        socket.write(handshake);
      });

      socket.on('data', (data) => {
        chunks.push(data);
        received += data.length;
      });

      socket.on('close', () => {
        if (received >= size) {
          resolve(Buffer.concat(chunks, received));
        } else {
          reject(new Error(`Incomplete download: ${received}/${size} bytes`));
        }
      });

      socket.on('error', reject);
      socket.setTimeout(60000);
    });
  }

  // ========================================================================
  // Private Methods
  // ========================================================================

  private onSocketConnect(): void {
    logger.debug('Socket connected');
    this.buffer = '';
  }

  private onSocketError(error: Error, reject?: (error: Error) => void): void {
    logger.error('Socket error', { error: error.message });

    if (this.state === 'connecting' && reject) {
      reject(new ConnectionError(
        `Connection failed: ${error.message}`,
        this.config.host,
        this.config.queryPort,
        true
      ));
    }

    this.setState('error');
    this.emit('error', error);
  }

  private onSocketClose(hadError: boolean): void {
    logger.debug('Socket closed', { hadError });

    this.clearTimers();

    if (this.isShuttingDown) {
      this.setState('disconnected');
      return;
    }

    this.setState('disconnected');
    this.emit('close', !hadError);

    if (!this.isShuttingDown) {
      this.reconnect();
    }
  }

  private onSocketData(data: Buffer): void {
    const text = data.toString('utf-8');
    this.buffer += text;

    // Process complete lines
    const lines = this.buffer.split('\n');
    this.buffer = lines.pop() || ''; // Keep incomplete line in buffer

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed) continue;

      this.processLine(trimmed);
    }
  }

  private processLine(line: string): void {
    tsEventEmitter.emit('raw:data', line);

    // Check for welcome message
    if (this.state === 'connecting') {
      const welcome = parseWelcomeMessage(line);
      if (welcome) {
        this.serverVersion = welcome.version;
        this.serverBuild = welcome.build;
        logger.info('TeamSpeak server detected', welcome);
        return;
      }
    }

    // Check for error response
    if (line.startsWith('error id=')) {
      const response = parseQueryResponse(line);
      this.resolvePendingCommand(response);
      return;
    }

    // Check for notify events
    if (line.startsWith('notify')) {
      const event = parseNotifyLine(line);
      if (event) {
        this.handleNotifyEvent(event);
      }
      return;
    }

    // Regular command response
    const response = parseQueryResponse(line);
    if (response.data && response.data.length > 0) {
      this.resolvePendingCommand(response);
    }
  }

  private resolvePendingCommand(response: TS3QueryResponse): void {
    const pending = this.commandQueue.shift();
    if (pending) {
      clearTimeout(pending.timeout);
      if (response.error.id !== 0) {
        pending.reject(new TeamSpeakQueryError(
          response.error.msg,
          response.error.id,
          response.error.msg,
          pending.command,
          {},
        ));
      } else {
        pending.resolve(response);
      }
    }
  }

  private removePendingCommand(id: number): void {
    const index = this.commandQueue.findIndex(p => this.commandQueue.indexOf(p) === id - 1);
    if (index >= 0) {
      const pending = this.commandQueue[index];
      clearTimeout(pending.timeout);
      pending.reject(new BridgeError('Command cancelled', 'COMMAND_CANCELLED', 499));
      this.commandQueue.splice(index, 1);
    }
  }

  private clearCommandQueue(error: Error): void {
    for (const pending of this.commandQueue) {
      clearTimeout(pending.timeout);
      pending.reject(error);
    }
    this.commandQueue = [];
  }

  private handleNotifyEvent(event: TS3ServerEvent): void {
    tsEventEmitter.emit('raw:notify', event);

    switch (event.reasonid) {
      case 0: // Client connected
        tsEventEmitter.emit('client:connect', event);
        break;

      case 1:
      case 2:
      case 3: // Client disconnected
        tsEventEmitter.emit('client:disconnect', event);
        break;

      case 4: // Client moved
        tsEventEmitter.emit('client:move', event);
        break;

      case 5: // Client talking state changed
        tsEventEmitter.emit('client:talk', event);
        break;

      case 6: // Text message
        tsEventEmitter.emit('chat:message', event);
        break;

      case 7: // Channel created
      case 8: // Channel deleted
      case 9: // Channel updated
        tsEventEmitter.emit('channel:update', event);
        break;
    }
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
        this.sendCommand('version').catch(() => {
          // Ignore heartbeat errors
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
    const checkAuth = (this as unknown as { _checkAuth?: ReturnType<typeof setInterval> })._checkAuth;
    if (checkAuth) {
      clearInterval(checkAuth);
    }
  }

  private async completeInitialization(): Promise<void> {
    try {
      await this.login();
      await this.useServer();
      await this.registerEvents();
      await this.setClientNickname();
      await this.getServerInfo();

      // Get client ID
      const response = await this.sendCommand('whoami');
      if (response.error.id === 0 && response.data?.length) {
        const whoami = response.data[0] as Record<string, string>;
        this.clientId = whoami.client_id || '';
      }

      this.setState('connected');
      logger.info('TeamSpeak 3 Query initialization complete');
    } catch (error) {
      logger.error('Initialization failed', { error });
      throw error;
    }
  }

  // Override connect to complete initialization
  async connect(): Promise<void> {
    if (this.state === 'connecting' || this.state === 'connected') {
      logger.warn('Already connecting or connected');
      return;
    }

    this.isShuttingDown = false;
    this.setState('connecting');
    logger.info('Connecting to TeamSpeak 3 ServerQuery', {
      host: this.config.host,
      port: this.config.queryPort,
    });

    return new Promise((resolve, reject) => {
      this.socket = createConnection(
        {
          host: this.config.host,
          port: this.config.queryPort,
          timeout: 10000,
        },
        async () => {
          this.onSocketConnect();
          try {
            await this.completeInitialization();
            resolve();
          } catch (error) {
            reject(error);
          }
        }
      );

      this.socket.on('error', (error) => this.onSocketError(error, reject));
      this.socket.on('close', (hadError) => this.onSocketClose(hadError));
      this.socket.on('data', (data) => this.onSocketData(data));

      const connectTimeout = setTimeout(() => {
        if (this.state === 'connecting') {
          this.socket?.destroy();
          reject(new ConnectionError(
            'Connection timeout',
            this.config.host,
            this.config.queryPort,
            true
          ));
        }
      }, 15000);

      // Clean up timeout on success
      const originalResolve = resolve;
      resolve = (() => {
        clearTimeout(connectTimeout);
        originalResolve();
      }) as typeof resolve;
    });
  }
}

// ========================================================================
// Factory Function
// ========================================================================

export function createTS3QueryClient(config: TS3QueryConfig): TS3QueryClient {
  return new TS3QueryClient(config);
}