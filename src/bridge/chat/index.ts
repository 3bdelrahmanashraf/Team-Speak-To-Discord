/**
 * Chat Synchronization Module
 * Exports
 */

export * from './sync.js';

// ========================================================================
// Factory Function
// ========================================================================

import type { ChatConfig } from '../../shared/types.js';
import { ChatSync } from './sync.js';

export function createChatSync(config: ChatConfig): ChatSync {
  return new ChatSync(config);
}