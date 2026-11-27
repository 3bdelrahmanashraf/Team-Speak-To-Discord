/**
 * TeamSpeak Types
 * Shared types for TeamSpeak 3 Query and TeamSpeak 5 WebSocket
 */

import type { TSClient, TSChannel, TSServerGroup, TSChannelGroup, TSPermission, TSBan } from '../shared/types/index.js';

// Re-export shared types
export type {
  TSClient,
  TSChannel,
  TSServerGroup,
  TSChannelGroup,
  TSPermission,
  TSBan,
};

// ============================================================================
// TeamSpeak 3 Query Types
// ============================================================================

export interface TS3QueryConfig {
  host: string;
  port: number;
  username: string;
  password: string;
  serverId: number;
  nickname: string;
  reconnectInterval: number;
  maxReconnectAttempts: number;
}

export interface TS3QueryResponse {
  error: {
    id: number;
    msg: string;
  };
  data?: unknown[];
}

export interface TS3ClientListEntry {
  clid: string;
  cid: string;
  client_database_id: string;
  client_nickname: string;
  client_type: string;
  client_away: string;
  client_away_message?: string;
  client_talk_power: string;
  client_is_talking: string;
  client_is_recording: string;
  client_is_priority_speaker: string;
  client_input_muted: string;
  client_output_muted: string;
  client_input_hardware: string;
  client_output_hardware: string;
  client_idle_time: string;
  client_created: string;
  client_lastconnected: string;
  client_unique_identifier: string;
  client_servergroups: string;
  client_version: string;
  client_platform: string;
  client_meta_data?: string;
}

export interface TS3ChannelListEntry {
  cid: string;
  pid: string;
  channel_order: string;
  channel_name: string;
  channel_topic?: string;
  channel_description?: string;
  channel_password?: string;
  channel_codec: string;
  channel_codec_quality: string;
  channel_maxclients: string;
  channel_maxfamilyclients: string;
  channel_flag_permanent: string;
  channel_flag_semi_permanent: string;
  channel_flag_default: string;
  channel_flag_password: string;
  channel_needed_talk_power: string;
  total_clients: string;
}

export interface TS3ServerGroupEntry {
  sgid: string;
  name: string;
  type: string;
  iconid?: string;
  savedb: string;
  sortid: string;
  n_member_addp: string;
  n_member_removep: string;
  n_modifyp: string;
}

export interface TS3ChannelGroupEntry {
  cgid: string;
  name: string;
  type: string;
  iconid?: string;
  savedb: string;
  sortid: string;
  n_member_addp: string;
  n_member_removep: string;
  n_modifyp: string;
}

export interface TS3PermissionEntry {
  permsid: string;
  permid: number;
  permvalue: number;
  permnegated: boolean;
  permskip: boolean;
}

export interface TS3BanEntry {
  banid: string;
  ip?: string;
  name?: string;
  uid?: string;
  created: number;
  duration: number;
  invokername: string;
  invokeruid: string;
  reason: string;
  enforcements: number;
}

export interface TS3EventNotify {
  reasonid: number;
  reasonmsg: string;
  [key: string]: string | number | undefined;
}

export interface TS3ClientConnectEvent extends TS3EventNotify {
  reasonid: 0;
  clid: string;
  client_nickname: string;
  client_unique_identifier: string;
  client_database_id: string;
  client_type: string;
}

export interface TS3ClientDisconnectEvent extends TS3EventNotify {
  reasonid: 1 | 2 | 3;
  clid: string;
  client_nickname: string;
  client_unique_identifier: string;
  client_database_id: string;
  invokerid?: string;
  invokername?: string;
  invokeruid?: string;
  reasonmsg: string;
  bantime?: number;
}

export interface TS3ClientMoveEvent extends TS3EventNotify {
  reasonid: 4;
  clid: string;
  cid: string;
  ctid?: string;
  reasonmsg: string;
}

export interface TS3ClientTalkEvent extends TS3EventNotify {
  reasonid: 5;
  clid: string;
  client_is_talking: string;
}

export interface TS3TextMessageEvent extends TS3EventNotify {
  reasonid: 6;
  clid: string;
  targetmode: string;
  target: string;
  msg: string;
}

export interface TS3ChannelCreateEvent extends TS3EventNotify {
  reasonid: 7;
  cid: string;
  channel_name: string;
}

export interface TS3ChannelDeleteEvent extends TS3EventNotify {
  reasonid: 8;
  cid: string;
}

export interface TS3ChannelUpdateEvent extends TS3EventNotify {
  reasonid: 9;
  cid: string;
  [key: string]: string | number | undefined;
}

export type TS3ServerEvent =
  | TS3ClientConnectEvent
  | TS3ClientDisconnectEvent
  | TS3ClientMoveEvent
  | TS3ClientTalkEvent
  | TS3TextMessageEvent
  | TS3ChannelCreateEvent
  | TS3ChannelDeleteEvent
  | TS3ChannelUpdateEvent;

// ============================================================================
// TeamSpeak 5 WebSocket Types
// ============================================================================

export interface TS5WebSocketConfig {
  host: string;
  port: number;
  token?: string;
  reconnectInterval: number;
  maxReconnectAttempts: number;
}

export interface TS5WebSocketMessage {
  type: string;
  payload: unknown;
  requestId?: string;
}

export interface TS5AuthMessage extends TS5WebSocketMessage {
  type: 'auth';
  payload: {
    token: string;
  };
}

export interface TS5SubscribeMessage extends TS5WebSocketMessage {
  type: 'subscribe';
  payload: {
    events: string[];
  };
}

export interface TS5EventMessage extends TS5WebSocketMessage {
  type: 'event';
  payload: {
    event: string;
    data: unknown;
  };
}

export interface TS5ClientConnectEvent {
  clientId: string;
  nickname: string;
  uniqueIdentifier: string;
  databaseId: number;
  channelId: string;
}

export interface TS5ClientDisconnectEvent {
  clientId: string;
  reason: string;
}

export interface TS5ClientMoveEvent {
  clientId: string;
  fromChannelId: string;
  toChannelId: string;
}

export interface TS5ClientTalkEvent {
  clientId: string;
  talking: boolean;
}

export interface TS5TextMessageEvent {
  clientId: string;
  channelId: string;
  message: string;
}

export type TS5Event =
  | TS5ClientConnectEvent
  | TS5ClientDisconnectEvent
  | TS5ClientMoveEvent
  | TS5ClientTalkEvent
  | TS5TextMessageEvent;

// ============================================================================
// Connection State
// ============================================================================

export type TSConnectionState =
  | 'disconnected'
  | 'connecting'
  | 'authenticating'
  | 'connected'
  | 'reconnecting'
  | 'error';

export interface TSConnectionStatus {
  state: TSConnectionState;
  lastConnected?: Date;
  lastDisconnected?: Date;
  reconnectAttempts: number;
  lastError?: Error;
  serverVersion?: string;
  serverName?: string;
}