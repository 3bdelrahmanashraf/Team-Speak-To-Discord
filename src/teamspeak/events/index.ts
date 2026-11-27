/**
 * TeamSpeak Events
 * Event definitions and emitter for TeamSpeak 3/5
 */

import { EventEmitter } from 'node:events';
import type {
  TSConnectionState,
  TSConnectionStatus,
  TS3ServerEvent,
  TS3ClientConnectEvent,
  TS3ClientDisconnectEvent,
  TS3ClientMoveEvent,
  TS3ClientTalkEvent,
  TS3TextMessageEvent,
  TS5Event,
  TS5ClientConnectEvent,
  TS5ClientDisconnectEvent,
  TS5ClientMoveEvent,
  TS5ClientTalkEvent,
  TS5TextMessageEvent,
  TSClient,
  TSChannel,
} from '../types.js';

// ============================================================================
// Event Map
// ============================================================================

export interface TSEventMap {
  // Connection events
  'connection:state': [TSConnectionState, TSConnectionStatus];
  'connection:ready': [TSConnectionStatus];
  'connection:error': [Error, TSConnectionStatus];
  'connection:reconnecting': [number, number]; // attempt, maxAttempts
  'connection:closed': [boolean]; // wasClean

  // Client events
  'client:connect': [TS3ClientConnectEvent | TS5ClientConnectEvent];
  'client:disconnect': [TS3ClientDisconnectEvent | TS5ClientDisconnectEvent];
  'client:move': [TS3ClientMoveEvent | TS5ClientMoveEvent];
  'client:talk': [TS3ClientTalkEvent | TS5ClientTalkEvent];
  'client:update': [TSClient];

  // Channel events
  'channel:create': [TSChannel];
  'channel:delete': [string]; // channelId
  'channel:update': [TSChannel];
  'channel:move': [string, string, string]; // channelId, oldParentId, newParentId

  // Chat events
  'chat:message': [TS3TextMessageEvent | TS5TextMessageEvent];

  // Server events
  'server:update': [Record<string, unknown>];

  // Raw events
  'raw:notify': [TS3ClientConnectEvent | TS3ClientDisconnectEvent | TS3ClientMoveEvent | TS3ClientTalkEvent | TS3TextMessageEvent];
  'raw:data': [string];
}

// ============================================================================
// Typed Event Emitter
// ============================================================================

export class TSEventEmitter extends EventEmitter<{
  'connection:state': (state: TSConnectionState, status: TSConnectionStatus) => void;
  'connection:ready': (status: TSConnectionStatus) => void;
  'connection:error': (error: Error, status: TSConnectionStatus) => void;
  'connection:reconnecting': (attempt: number, maxAttempts: number) => void;
  'connection:closed': (wasClean: boolean) => void;
  'client:connect': (event: TS3ClientConnectEvent | TS5ClientConnectEvent) => void;
  'client:disconnect': (event: TS3ClientDisconnectEvent | TS5ClientDisconnectEvent) => void;
  'client:move': (event: TS3ClientMoveEvent | TS5ClientMoveEvent) => void;
  'client:talk': (event: TS3ClientTalkEvent | TS5ClientTalkEvent) => void;
  'client:update': (client: TSClient) => void;
  'channel:create': (channel: TSChannel) => void;
  'channel:delete': (channelId: string) => void;
  'channel:update': (channel: TSChannel) => void;
  'channel:move': (channelId: string, oldParentId: string, newParentId: string) => void;
  'chat:message': (event: TS3TextMessageEvent | TS5TextMessageEvent) => void;
  'server:update': (data: Record<string, unknown>) => void;
  'raw:notify': (event: TS3ClientConnectEvent | TS3ClientDisconnectEvent | TS3ClientMoveEvent | TS3ClientTalkEvent | TS3TextMessageEvent) => void;
  'raw:data': (data: string) => void;
}> {
  constructor() {
    super();
    this.setMaxListeners(100);
  }
}

// ============================================================================
// Event Type Guards
// ============================================================================

export function isClientConnectEvent(event: TS3ServerEvent): event is TS3ClientConnectEvent {
  return event.reasonid === 0 && 'client_nickname' in event;
}

export function isClientDisconnectEvent(event: TS3ServerEvent): event is TS3ClientDisconnectEvent {
  return [1, 2, 3].includes(event.reasonid) && 'clid' in event;
}

export function isClientMoveEvent(event: TS3ServerEvent): event is TS3ClientMoveEvent {
  return event.reasonid === 4 && 'cid' in event;
}

export function isClientTalkEvent(event: TS3ServerEvent): event is TS3ClientTalkEvent {
  return event.reasonid === 5 && 'client_is_talking' in event;
}

export function isTextMessageEvent(event: TS3ServerEvent): event is TS3TextMessageEvent {
  return event.reasonid === 6 && 'msg' in event;
}

export function isChannelCreateEvent(event: TS3ServerEvent): event is { type: 'channelcreated'; cid: string } {
  return event.reasonid === 7;
}

export function isChannelDeleteEvent(event: TS3ServerEvent): event is { type: 'channeldeleted'; cid: string } {
  return event.reasonid === 8;
}

export function isChannelUpdateEvent(event: TS3ServerEvent): event is { type: 'channelupdated'; cid: string } {
  return event.reasonid === 9;
}

// ============================================================================
// Event Factory
// ============================================================================

export function createClientConnectEvent(
  platform: 'ts3' | 'ts5',
  data: TS3ClientConnectEvent | TS5ClientConnectEvent
): TS3ClientConnectEvent | TS5ClientConnectEvent {
  return {
    ...data,
    platform,
    timestamp: Date.now(),
  } as TS3ClientConnectEvent | TS5ClientConnectEvent;
}

export function createClientDisconnectEvent(
  platform: 'ts3' | 'ts5',
  data: TS3ClientDisconnectEvent | TS5ClientDisconnectEvent
): TS3ClientDisconnectEvent | TS5ClientDisconnectEvent {
  return {
    ...data,
    platform,
    timestamp: Date.now(),
  } as TS3ClientDisconnectEvent | TS5ClientDisconnectEvent;
}

export function createClientMoveEvent(
  platform: 'ts3' | 'ts5',
  data: { clid: string; fromCid: string; toCid: string } | TS5ClientMoveEvent
): { clid: string; fromCid: string; toCid: string } | TS5ClientMoveEvent {
  return {
    ...data,
    platform,
    timestamp: Date.now(),
  };
}

export function createClientTalkEvent(
  platform: 'ts3' | 'ts5',
  data: TS3ClientTalkEvent | TS5ClientTalkEvent
): TS3ClientTalkEvent | TS5ClientTalkEvent {
  return {
    ...data,
    platform,
    timestamp: Date.now(),
  } as TS3ClientTalkEvent | TS5ClientTalkEvent;
}

export function createTextMessageEvent(
  platform: 'ts3' | 'ts5',
  data: TS3TextMessageEvent | TS5TextMessageEvent
): TS3TextMessageEvent | TS5TextMessageEvent {
  return {
    ...data,
    platform,
    timestamp: Date.now(),
  } as TS3TextMessageEvent | TS5TextMessageEvent;
}

// ============================================================================
// Export singleton emitter
// ============================================================================

export const tsEventEmitter = new TSEventEmitter();