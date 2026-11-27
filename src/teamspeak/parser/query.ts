/**
 * TeamSpeak 3 Query Parser
 * Parses raw TCP responses from TeamSpeak 3 ServerQuery
 */

import type {
  TS3QueryResponse,
  TS3ClientListEntry,
  TS3ChannelListEntry,
  TS3ServerGroupEntry,
  TS3ChannelGroupEntry,
  TS3PermissionEntry,
  TS3BanEntry,
  TS3ServerEvent,
  TS3ClientConnectEvent,
  TS3ClientDisconnectEvent,
  TS3ClientMoveEvent,
  TS3ClientTalkEvent,
  TS3TextMessageEvent,
  TS3ChannelCreateEvent,
  TS3ChannelDeleteEvent,
  TS3ChannelUpdateEvent,
} from '../types.js';

/**
 * Parse a single line from TeamSpeak 3 Query response
 * Format: key1=value1 key2=value2 ... | key1=value1 key2=value2 ...
 */
export function parseQueryLine(line: string): Record<string, string>[] {
  const result: Record<string, string>[] = [];

  // Split by pipe for multiple records
  const records = line.split('|').map(s => s.trim()).filter(Boolean);

  for (const record of records) {
    const obj: Record<string, string> = {};
    // Split by space but respect escaped spaces in values
    const parts = record.split(' ');

    for (const part of parts) {
      const eqIndex = part.indexOf('=');
      if (eqIndex > 0) {
        const key = part.slice(0, eqIndex);
        let value = part.slice(eqIndex + 1);
        // Unescape TeamSpeak special characters
        value = unescapeTSValue(value);
        obj[key] = value;
      }
    }

    if (Object.keys(obj).length > 0) {
      result.push(obj);
    }
  }

  return result;
}

/**
 * Unescape TeamSpeak 3 Query special characters
 * \s = space, \p = pipe, \a = bell, \f = form feed, \n = newline, \r = carriage return, \t = tab, \v = vertical tab, \\ = backslash
 */
export function unescapeTSValue(value: string): string {
  return value
    .replace(/\\s/g, ' ')
    .replace(/\\p/g, '|')
    .replace(/\\a/g, '\u0007')
    .replace(/\\f/g, '\f')
    .replace(/\\n/g, '\n')
    .replace(/\\r/g, '\r')
    .replace(/\\t/g, '\t')
    .replace(/\\v/g, '\v')
    .replace(/\\\\/g, '\\');
}

/**
 * Escape value for TeamSpeak 3 Query
 */
export function escapeTSValue(value: string): string {
  return value
    .replace(/\\/g, '\\\\')
    .replace(/\|/g, '\\p')
    .replace(/ /g, '\\s')
    .replace(/\u0007/g, '\\a')
    .replace(/\f/g, '\\f')
    .replace(/\n/g, '\\n')
    .replace(/\r/g, '\\r')
    .replace(/\t/g, '\\t')
    .replace(/\v/g, '\\v');
}

/**
 * Parse full TeamSpeak 3 Query response
 */
export function parseQueryResponse(raw: string): TS3QueryResponse {
  const lines = raw.trim().split('\n').filter(Boolean);
  const result: TS3QueryResponse = { error: { id: 0, msg: 'ok' }, data: [] };

  for (const line of lines) {
    if (line.startsWith('error id=')) {
      // Parse error line: error id=0 msg=ok
      const errorMatch = line.match(/error id=(\d+) msg=(.+)/);
      if (errorMatch) {
        result.error = {
          id: parseInt(errorMatch[1], 10),
          msg: unescapeTSValue(errorMatch[2]),
        };
      }
    } else if (line.startsWith('notify')) {
      // Notify events are handled separately
    } else {
      // Data lines
      const parsed = parseQueryLine(line);
      result.data!.push(...parsed);
    }
  }

  return result;
}

/**
 * Parse client list response
 */
export function parseClientList(data: Record<string, string>[]): TS3ClientListEntry[] {
  return data.map(item => ({
    clid: item.clid || '',
    cid: item.cid || '',
    client_database_id: item.client_database_id || '',
    client_nickname: unescapeTSValue(item.client_nickname || ''),
    client_type: item.client_type || '0',
    client_away: item.client_away === '1',
    client_away_message: item.client_away_message ? unescapeTSValue(item.client_away_message) : undefined,
    client_talk_power: item.client_talk_power || '0',
    client_is_talking: item.client_is_talking === '1',
    client_is_recording: item.client_is_recording === '1',
    client_is_priority_speaker: item.client_is_priority_speaker === '1',
    client_input_muted: item.client_input_muted === '1',
    client_output_muted: item.client_output_muted === '1',
    client_input_hardware: item.client_input_hardware === '1',
    client_output_hardware: item.client_output_hardware === '1',
    client_idle_time: item.client_idle_time || '0',
    client_created: item.client_created || '0',
    client_lastconnected: item.client_lastconnected || '0',
    client_unique_identifier: item.client_unique_identifier || '',
    client_servergroups: item.client_servergroups || '',
    client_version: item.client_version || '',
    client_platform: item.client_platform || '',
    client_meta_data: item.client_meta_data ? unescapeTSValue(item.client_meta_data) : undefined,
  }));
}

/**
 * Parse channel list response
 */
export function parseChannelList(data: Record<string, string>[]): TS3ChannelListEntry[] {
  return data.map(item => ({
    cid: item.cid || '',
    pid: item.pid || '',
    channel_order: item.channel_order || '0',
    channel_name: unescapeTSValue(item.channel_name || ''),
    channel_topic: item.channel_topic ? unescapeTSValue(item.channel_topic) : undefined,
    channel_description: item.channel_description ? unescapeTSValue(item.channel_description) : undefined,
    channel_password: item.channel_password || undefined,
    channel_codec: item.channel_codec || '0',
    channel_codec_quality: item.channel_codec_quality || '0',
    channel_maxclients: item.channel_maxclients || '-1',
    channel_maxfamilyclients: item.channel_maxfamilyclients || '-1',
    channel_flag_permanent: item.channel_flag_permanent === '1',
    channel_flag_semi_permanent: item.channel_flag_semi_permanent === '1',
    channel_flag_default: item.channel_flag_default === '1',
    channel_flag_password: item.channel_flag_password === '1',
    channel_needed_talk_power: item.channel_needed_talk_power || '0',
    total_clients: item.total_clients || '0',
  }));
}

/**
 * Parse server group list response
 */
export function parseServerGroupList(data: Record<string, string>[]): TS3ServerGroupEntry[] {
  return data.map(item => ({
    sgid: item.sgid || '',
    name: unescapeTSValue(item.name || ''),
    type: item.type || '0',
    iconid: item.iconid || undefined,
    savedb: item.savedb === '1',
    sortid: item.sortid || '0',
    n_member_addp: item.n_member_addp || '0',
    n_member_removep: item.n_member_removep || '0',
    n_modifyp: item.n_modifyp || '0',
  }));
}

/**
 * Parse channel group list response
 */
export function parseChannelGroupList(data: Record<string, string>[]): TS3ChannelGroupEntry[] {
  return data.map(item => ({
    cgid: item.cgid || '',
    name: unescapeTSValue(item.name || ''),
    type: item.type || '0',
    iconid: item.iconid || undefined,
    savedb: item.savedb === '1',
    sortid: item.sortid || '0',
    n_member_addp: item.n_member_addp || '0',
    n_member_removep: item.n_member_removep || '0',
    n_modifyp: item.n_modifyp || '0',
  }));
}

/**
 * Parse permission list response
 */
export function parsePermissionList(data: Record<string, string>[]): TS3PermissionEntry[] {
  return data.map(item => ({
    permsid: item.permsid || '',
    permid: parseInt(item.permid || '0', 10),
    permvalue: parseInt(item.permvalue || '0', 10),
    permnegated: item.permnegated === '1',
    permskip: item.permskip === '1',
  }));
}

/**
 * Parse ban list response
 */
export function parseBanList(data: Record<string, string>[]): TS3BanEntry[] {
  return data.map(item => ({
    banid: item.banid || '',
    ip: item.ip || undefined,
    name: item.name ? unescapeTSValue(item.name) : undefined,
    uid: item.uid || undefined,
    created: parseInt(item.created || '0', 10),
    duration: parseInt(item.duration || '0', 10),
    invokername: item.invokername ? unescapeTSValue(item.invokername) : '',
    invokeruid: item.invokeruid || '',
    reason: item.reason ? unescapeTSValue(item.reason) : '',
    enforcements: parseInt(item.enforcements || '0', 10),
  }));
}

/**
 * Parse notify/event line
 */
export function parseNotifyLine(line: string): TS3ServerEvent | null {
  if (!line.startsWith('notify')) return null;

  const notifyMatch = line.match(/notify(?:textmessage|cliententerview|clientleftview|clientmoved|clientupdated|channeldescriptionchanged|channelcreated|channeldeleted|channelupdated|serveredited|tokenused|clientpoke)?/);
  const eventType = notifyMatch?.[1] || 'unknown';

  const data = parseQueryLine(line.replace(/^notify(?:textmessage|cliententerview|clientleftview|clientmoved|clientupdated|channeldescriptionchanged|channelcreated|channeldeleted|channelupdated|serveredited|tokenused|clientpoke)?\s*/, ''))[0];

  if (!data) return null;

  // Map event type to specific event
  switch (eventType) {
    case 'cliententerview':
      return {
        ...data,
        reasonid: 0,
        type: 'cliententerview',
      } as TS3ClientConnectEvent;

    case 'clientleftview':
      return {
        ...data,
        reasonid: parseInt(data.reasonid || '0', 10),
        type: 'clientleftview',
      } as TS3ClientDisconnectEvent;

    case 'clientmoved':
      return {
        ...data,
        reasonid: 4,
        type: 'clientmoved',
      } as TS3ClientMoveEvent;

    case 'clientupdated':
      if (data.client_is_talking !== undefined) {
        return {
          ...data,
          reasonid: 5,
          type: 'clientupdated',
        } as TS3ClientTalkEvent;
      }
      return {
        ...data,
        reasonid: 5,
        type: 'clientupdated',
      } as TS3ServerEvent;

    case 'textmessage':
      return {
        ...data,
        reasonid: 6,
        type: 'textmessage',
      } as TS3TextMessageEvent;

    case 'channelcreated':
      return {
        ...data,
        reasonid: 7,
        type: 'channelcreated',
      } as TS3ChannelCreateEvent;

    case 'channeldeleted':
      return {
        ...data,
        reasonid: 8,
        type: 'channeldeleted',
      } as TS3ChannelDeleteEvent;

    case 'channelupdated':
    case 'channeldescriptionchanged':
      return {
        ...data,
        reasonid: 9,
        type: 'channelupdated',
      } as TS3ChannelUpdateEvent;

    default:
      return {
        ...data,
        reasonid: 0,
        type: eventType,
      } as TS3ServerEvent;
  }
}

/**
 * Build a TeamSpeak 3 Query command string
 */
export function buildCommand(command: string, params: Record<string, string | number | boolean> = {}): string {
  const parts = [command];

  for (const [key, value] of Object.entries(params)) {
    const escapedValue = typeof value === 'string' ? escapeTSValue(value) : String(value);
    parts.push(`${key}=${escapedValue}`);
  }

  return parts.join(' ');
}

/**
 * Parse the initial server welcome message
 */
export function parseWelcomeMessage(line: string): { version: string; build: number; serverName: string } | null {
  const match = line.match(/TS3\s+Server\s+([\d.]+)\s+\(build:\s*(\d+)\)/);
  if (!match) return null;

  return {
    version: match[1],
    build: parseInt(match[2], 10),
    serverName: '', // Not in welcome message
  };
}