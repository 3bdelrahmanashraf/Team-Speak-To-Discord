/**
 * TeamSpeak Module
 * Main entry point for TeamSpeak 3/5 integration
 */

export * from './types.js';
export * from './ts3/client.js';
export * from './parser/query.js';
export * from './events/index.js';
export * from './ts5/client.js';

// ========================================================================
// Factory Functions
// ========================================================================

import type { TS3QueryConfig } from './types.js';
import { TS3QueryClient } from './ts3/client.js';

export function createTS3Client(config: TS3QueryConfig): TS3QueryClient {
  return new TS3QueryClient(config);
}