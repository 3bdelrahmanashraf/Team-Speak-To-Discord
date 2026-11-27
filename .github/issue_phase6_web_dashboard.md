## Phase 6: Web Dashboard ⏳ **Planned**

### Overview
Build a web-based administration panel for full configuration management without editing files.

### Tasks
- [ ] Authentication - Discord OAuth2 + TS admin token
- [ ] Real-time Metrics - Connected users, audio quality, latency
- [ ] Configuration UI - Visual bridge configuration
- [ ] Audit Logs - Searchable action history
- [ ] User Management - Link/unlink accounts, view stats
- [ ] Channel Mapping - Drag-drop TS↔Discord channel mapping
- [ ] Alerts & Notifications - Discord webhook alerts

### Status
**PLANNED** - 0/7 tasks done

### Related Files (to be created)
- `src/dashboard/` - Web dashboard module
- `src/dashboard/server.ts` - Fastify server
- `src/dashboard/routes/` - API routes
- `src/dashboard/frontend/` - React/Vue frontend (future)
- `src/dashboard/auth.ts` - Discord OAuth2 + TS token auth

### Progress Tracking
- Started: Not started
- Progress: 0/7 (0%)

### Dependencies
- Phase 0: Foundation & Setup (complete)
- Phase 1-5: Core bridge functionality
- Fastify, Discord OAuth2 packages