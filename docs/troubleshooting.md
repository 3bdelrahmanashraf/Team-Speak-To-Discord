# Troubleshooting Guide

## Quick Diagnostics

Run these commands to diagnose common issues:

```bash
# Check bridge status
curl http://localhost:3000/health

# Check logs
docker compose logs -f bridge
# or
journalctl -u teamspeak-discord-bridge -f

# Verify configuration
node -e "require('./src/shared/config').loadConfig()"

# Test database connection
npx prisma db pull

# Test Redis connection
redis-cli ping
```

---

## Connection Issues

### TeamSpeak Connection Failed

**Symptoms:**
- Bridge logs show `CONNECTION_ERROR` for TeamSpeak
- "ECONNREFUSED" or "ETIMEDOUT" errors

**Diagnosis:**
```bash
# Test TeamSpeak Query port
telnet your-ts-host 10011
# or
nc -zv your-ts-host 10011

# Test SSH port (if using TS5)
nc -zv your-ts-host 10022
```

**Solutions:**

| Cause | Solution |
|-------|----------|
| Wrong host/port | Verify `TS_HOST` and `TS_QUERY_PORT` in `.env` |
| Firewall blocking | Open port 10011 (TCP) on TeamSpeak server firewall |
| Query interface disabled | Enable ServerQuery in TeamSpeak server settings |
| Wrong credentials | Verify `TS_USERNAME` and `TS_PASSWORD` |
| Server not running | Check TeamSpeak server status |
| IP ban | Check TeamSpeak ban list for bridge IP |

**TeamSpeak Server Configuration:**
```ini
# ts3server.ini
query_ip=0.0.0.0
query_port=10011
query_ssh_ip=0.0.0.0
query_ssh_port=10022
query_protocols=raw,ssh
```

### Discord Connection Failed

**Symptoms:**
- `DISCORD_ERROR` or `TOKEN_ERROR` in logs
- Bot shows offline in Discord

**Diagnosis:**
```bash
# Test Discord API access
curl -H "Authorization: Bot YOUR_TOKEN" https://discord.com/api/v10/users/@me
```

**Solutions:**

| Cause | Solution |
|-------|----------|
| Invalid token | Regenerate token in Discord Developer Portal |
| Missing intents | Enable all required intents (see below) |
| Wrong guild ID | Verify `DISCORD_GUILD_ID` is correct |
| Bot not in server | Invite bot to target guild |
| Rate limited | Check for 429 errors, reduce API calls |

**Required Discord Intents:**
- `Guilds`
- `GuildMembers`
- `GuildVoiceStates`
- `GuildMessages`
- `MessageContent`
- `GuildMessageReactions`
- `DirectMessages`
- `DirectMessageReactions`

### Database Connection Failed

**Symptoms:**
- `DATABASE_ERROR` in logs
- Prisma migration fails

**Solutions:**

```bash
# Check PostgreSQL status
systemctl status postgresql
# or
docker compose exec postgres pg_isready

# Verify connection string
psql "postgresql://user:pass@host:5432/db"

# Run migrations manually
npx prisma migrate deploy

# Reset database (development only)
npx prisma migrate reset
```

**Common Connection String Issues:**
```env
# Local PostgreSQL
DATABASE_URL="postgresql://user:pass@localhost:5432/db"

# Docker PostgreSQL
DATABASE_URL="postgresql://user:pass@postgres:5432/db"

# With SSL (managed databases)
DATABASE_URL="postgresql://user:pass@host:5432/db?sslmode=require"

# Connection pooling (PgBouncer)
DATABASE_URL="postgresql://user:pass@host:6432/db?pgbouncer=true"
```

### Redis Connection Failed

**Symptoms:**
- `REDIS_ERROR` in logs
- Cache/session features not working

**Solutions:**
```bash
# Test Redis
redis-cli -h localhost -p 6379 ping

# With password
redis-cli -a your_password ping

# Check memory
redis-cli info memory
```

---

## Audio Issues

### No Audio in Discord

**Symptoms:**
- Users connected but no sound
- Bridge shows audio pipeline active

**Diagnosis:**
```bash
# Check Opus library
node -e "console.log(require('@discordjs/opus'))"

# Check voice connection state
# Look for logs: "Voice connection established"
```

**Solutions:**

| Cause | Solution |
|-------|----------|
| Missing Opus | `npm rebuild @discordjs/opus` |
| Wrong voice channel | Verify channel mapping |
| Missing permissions | Bot needs `Connect`, `Speak`, `Use VAD` |
| Codec mismatch | Discord only supports Opus |
| Network issues | Check UDP connectivity |

### Poor Audio Quality

**Symptoms:**
- Robotic/distorted audio
- High latency
- Cutouts

**Solutions:**

```env
# Increase quality
AUDIO_QUALITY=high
AUDIO_BITRATE=96000

# Adjust VAD
AUDIO_VAD_THRESHOLD=0.3

# Enable noise suppression
AUDIO_NOISE_SUPPRESSION_ENABLED=true
AUDIO_NOISE_SUPPRESSION_LEVEL=2

# Increase jitter buffer
AUDIO_JITTER_BUFFER_MS=200
```

### Audio Latency

**Target:** < 100ms end-to-end

**Optimization:**
```env
# Reduce buffer sizes
AUDIO_FRAME_SIZE=480  # 10ms frames
AUDIO_JITTER_BUFFER_MS=50

# Enable adaptive bitrate
AUDIO_ADAPTIVE_BITRATE=true

# Check network
# Ping between bridge and Discord voice servers
```

---

## Message Sync Issues

### Messages Not Syncing

**Symptoms:**
- TS chat not appearing in Discord
- Discord messages not in TS

**Diagnosis:**
```bash
# Check channel mappings
# Verify in database: SELECT * FROM channel_mappings WHERE active=true;

# Check logs for chat events
grep "chat.message" logs/bridge.log
```

**Solutions:**

| Cause | Solution |
|-------|----------|
| No channel mapping | Create mapping in dashboard or DB |
| Wrong channel IDs | Verify TS channel ID and Discord channel ID |
| Sync disabled | Enable `CHAT_SYNC_ENABLED=true` |
| Ignored channels | Check `CHAT_IGNORED_CHANNELS` |
| Rate limiting | Increase `CHAT_SYNC_INTERVAL` |

### Formatting Issues

**Symptoms:**
- BBCode not converted
- Mentions not working
- Embeds missing

**Solutions:**
```env
# Enable embeds
CHAT_EMBED_LINKS=true
CHAT_EMBED_IMAGES=true

# Check mention mapping
CHAT_MENTION_MAPPING=true

# Verify command prefix
CHAT_COMMAND_PREFIX=!
```

---

## Performance Issues

### High Memory Usage

**Symptoms:**
- Process using > 500MB
- OOM kills

**Diagnosis:**
```bash
# Check memory
ps aux | grep node

# Node.js heap snapshot
node --inspect dist/bot/index.js
# Open chrome://inspect
```

**Solutions:**
```env
# Reduce concurrent users
BRIDGE_MAX_CONCURRENT_USERS=50

# Lower audio quality
AUDIO_QUALITY=medium

# Increase sync interval
BRIDGE_SYNC_INTERVAL=10000

# Node.js flags
NODE_OPTIONS="--max-old-space-size=512"
```

### High CPU Usage

**Solutions:**
```env
# Reduce audio processing
AUDIO_VAD_ENABLED=false
AUDIO_NOISE_SUPPRESSION_ENABLED=false

# Increase intervals
BRIDGE_SYNC_INTERVAL=10000
BRIDGE_HEALTH_CHECK_INTERVAL=60000
```

### Frequent Reconnections

**Symptoms:**
- Bridge reconnects every few minutes
- Users experience drops

**Solutions:**
```env
# Increase reconnect interval
TS_RECONNECT_INTERVAL=10000
TS_MAX_RECONNECT_ATTEMPTS=5

# Check network stability
# Ping TS server continuously
ping your-ts-host

# Check Discord gateway
# Look for "Reconnecting..." in logs
```

---

## User Linking Issues

### Cannot Link Accounts

**Symptoms:**
- Link command fails
- Users not synced

**Solutions:**

| Cause | Solution |
|-------|----------|
| TS unique ID mismatch | Verify `client_unique_identifier` in TS |
| Discord ID wrong | Use `@user` mention to get ID |
| Already linked | Check `user_links` table |
| Permissions | User needs link permission |

### Role Sync Not Working

**Solutions:**
```sql
-- Check role mappings
SELECT * FROM role_mappings WHERE sync_enabled=true;

-- Verify TS server group names match exactly
-- Verify Discord role IDs are correct
```

---

## Web Dashboard Issues

### Dashboard Not Accessible

**Solutions:**
```bash
# Check if enabled
WEB_DASHBOARD_ENABLED=true

# Check port
WEB_DASHBOARD_PORT=3000

# Check binding
WEB_DASHBOARD_HOST=0.0.0.0

# Check CORS
WEB_DASHBOARD_CORS_ORIGINS=http://localhost:3000,https://yourdomain.com
```

### OAuth Not Working

**Solutions:**
```env
# Verify Discord OAuth config
WEB_DASHBOARD_DISCORD_CLIENT_ID=your_client_id
WEB_DASHBOARD_DISCORD_CLIENT_SECRET=your_client_secret
WEB_DASHBOARD_DISCORD_CALLBACK_URL=https://yourdomain.com/auth/callback
```

---

## Error Reference

### BridgeError Codes

| Code | HTTP | Description |
|------|------|-------------|
| `CONFIGURATION_ERROR` | 500 | Invalid configuration |
| `VALIDATION_ERROR` | 400 | Input validation failed |
| `CONNECTION_ERROR` | 503 | External service connection failed |
| `RECONNECTION_ERROR` | 503 | Max reconnection attempts reached |
| `TIMEOUT_ERROR` | 504 | Operation timed out |
| `AUTHENTICATION_ERROR` | 401 | Invalid credentials |
| `AUTHORIZATION_ERROR` | 403 | Insufficient permissions |
| `TOKEN_ERROR` | 401 | Token invalid/expired |
| `TEAMSPEAK_ERROR` | 502 | TeamSpeak server error |
| `DISCORD_ERROR` | 502 | Discord API error |
| `AUDIO_ERROR` | 500 | Audio processing failed |
| `DATABASE_ERROR` | 500 | Database operation failed |
| `REDIS_ERROR` | 503 | Redis operation failed |

### TeamSpeak Error Codes

| Code | Meaning |
|------|---------|
| 2568 | Insufficient permissions |
| 512 | Invalid parameter |
| 520 | Invalid client ID |
| 1538 | Flood ban |
| 3329 | Connection lost |

### Discord Error Codes

| Code | Meaning |
|------|---------|
| 40001 | Unauthorized (invalid token) |
| 40003 | Forbidden (missing permissions) |
| 40004 | Not found |
| 40005 | Already exists |
| 40007 | Invalid form body |
| 40060 | Two factor required |
| 50001 | Missing access |
| 50013 | Missing permissions |
| 50035 | Invalid form body (validation) |

---

## Getting Help

### Before Asking

1. Check this troubleshooting guide
2. Search existing GitHub issues
3. Enable debug logging: `BRIDGE_LOG_LEVEL=debug`
4. Collect relevant logs
5. Note your environment (OS, Node version, deployment method)

### Support Channels

- **GitHub Issues**: Bug reports, feature requests
- **GitHub Discussions**: Questions, community help
- **Discord Server**: Real-time chat support

### Log Collection

```bash
# Collect last 1000 lines
docker compose logs --tail=1000 bridge > bridge_logs.txt

# Or systemd
journalctl -u teamspeak-discord-bridge -n 1000 > bridge_logs.txt

# Include in issue report
```