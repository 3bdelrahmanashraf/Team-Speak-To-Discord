## Phase 2: Discord Integration 🔄 **In Progress**

### Overview
Implement Discord.js v14 bot with gateway intents, slash commands, voice connections, and text synchronization.

### Tasks
- [x] Bot Setup - Discord.js v14 with gateway intents
- [x] Slash Commands - Full command registration & handling
- [ ] Voice Connection - Join/leave voice channels, Opus streaming
- [ ] Text Synchronization - Bidirectional message relay with embeds
- [ ] Thread Support - Map TS channels to Discord threads
- [ ] Reaction Roles - Discord reactions → TS server groups
- [ ] Rich Presence - Show TS status in Discord profile

### Status
**IN PROGRESS** - 3/7 tasks done (43%)

### Completed
- Discord.js v14 Client with all required intents (`src/discord/client.ts`)
- Slash Command framework with autocomplete support
- Built-in commands: `/ping`, `/bridge status/channels/users`, `/link account/remove/info`
- Command registration (guild & global)
- Event forwarding to bridge core (messages, voice, reactions, threads, members)
- Bot entry point integration (`src/bot/index.ts`)
- **Discord credentials configured** in `.env` (gitignored)

### In Progress
- Voice Connection - Join/leave voice channels, Opus streaming
- Text Synchronization - Bidirectional message relay with embeds

### Related Files
- `src/discord/client.ts` - Discord.js v14 client
- `src/discord/types.ts` - Type definitions
- `src/discord/commands/` - Slash commands (ping, bridge, link)
- `src/discord/index.ts` - Module exports & command registration
- `src/bot/index.ts` - Main entry point with both TS & Discord clients
- `.env` - Discord credentials (gitignored)

### Progress Tracking
- Started: 2026-11-27
- Progress: 3/7 (43%)

### Dependencies
- Phase 0: Foundation & Setup (complete)
- Phase 1: TeamSpeak Integration (complete)