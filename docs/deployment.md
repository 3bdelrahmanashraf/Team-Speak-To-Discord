# Deployment Guide

## Overview

This guide covers deploying the TeamSpeak to Discord Bridge in various environments.

## Prerequisites

### System Requirements

| Component | Minimum | Recommended |
|-----------|---------|-------------|
| CPU | 1 vCPU | 2+ vCPU |
| RAM | 512 MB | 1-2 GB |
| Storage | 1 GB | 5+ GB |
| Network | Stable internet | Low latency to TS/Discord |

### Software Dependencies

- **Node.js** 20+ (LTS)
- **npm** 10+
- **PostgreSQL** 14+ (or Docker)
- **Redis** 7+ (or Docker)
- **Docker** 24+ & **Docker Compose** 2+ (optional)

---

## Deployment Methods

### Method 1: Docker Compose (Recommended)

#### Quick Start

```bash
# Clone repository
git clone https://github.com/3bdelrahmanashraf/Team-Speak-To-Discord.git
cd Team-Speak-To-Discord

# Configure environment
cp config/example.env .env
# Edit .env with your credentials

# Start services
docker compose up -d

# View logs
docker compose logs -f bridge
```

#### Production Configuration

```yaml
# docker-compose.prod.yml
version: '3.8'

services:
  bridge:
    build:
      context: .
      dockerfile: Dockerfile
    image: teamspeak-discord-bridge:latest
    restart: unless-stopped
    environment:
      - NODE_ENV=production
    env_file:
      - .env.production
    volumes:
      - ./data:/app/data
      - ./logs:/app/logs
    networks:
      - bridge-network
    deploy:
      resources:
        limits:
          memory: 1G
          cpus: '1.0'
        reservations:
          memory: 512M
          cpus: '0.5'
    healthcheck:
      test: ["CMD", "node", "-e", "require('http').get('http://localhost:3000/health', (r) => { if (r.statusCode !== 200) process.exit(1) })"]
      interval: 30s
      timeout: 10s
      retries: 3
      start_period: 40s

  postgres:
    image: postgres:16-alpine
    restart: unless-stopped
    environment:
      POSTGRES_USER: bridge
      POSTGRES_PASSWORD: ${DB_PASSWORD}
      POSTGRES_DB: teamspeak_discord_bridge
    volumes:
      - postgres-data:/var/lib/postgresql/data
      - ./init-scripts:/docker-entrypoint-initdb.d
    networks:
      - bridge-network
    deploy:
      resources:
        limits:
          memory: 512M
          cpus: '0.5'

  redis:
    image: redis:7-alpine
    restart: unless-stopped
    command: redis-server --appendonly yes --maxmemory 256mb --maxmemory-policy allkeys-lru
    volumes:
      - redis-data:/data
    networks:
      - bridge-network
    deploy:
      resources:
        limits:
          memory: 256M
          cpus: '0.25'

networks:
  bridge-network:
    driver: bridge

volumes:
  postgres-data:
  redis-data:
```

```bash
# Deploy production
docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d
```

### Method 2: Bare Metal / VPS

#### Ubuntu/Debian

```bash
# Update system
sudo apt update && sudo apt upgrade -y

# Install Node.js 20
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs

# Install PostgreSQL
sudo apt install -y postgresql postgresql-contrib

# Install Redis
sudo apt install -y redis-server

# Create bridge user
sudo useradd -r -s /bin/bash -d /opt/teamspeak-discord-bridge bridge
sudo mkdir -p /opt/teamspeak-discord-bridge
sudo chown bridge:bridge /opt/teamspeak-discord-bridge

# Switch to bridge user
sudo -u bridge -i

# Clone and setup
cd /opt/teamspeak-discord-bridge
git clone https://github.com/3bdelrahmanashraf/Team-Speak-To-Discord.git .
cp config/example.env .env
# Edit .env

# Install dependencies
npm ci

# Generate Prisma client
npx prisma generate

# Run migrations
npx prisma migrate deploy

# Build
npm run build

# Create systemd service (see below)
```

#### Systemd Service

```ini
# /etc/systemd/system/teamspeak-discord-bridge.service
[Unit]
Description=TeamSpeak to Discord Bridge
After=network.target postgresql.service redis.service
Wants=postgresql.service redis.service

[Service]
Type=simple
User=bridge
WorkingDirectory=/opt/teamspeak-discord-bridge
ExecStart=/usr/bin/node /opt/teamspeak-discord-bridge/dist/bot/index.js
Restart=always
RestartSec=10
StandardOutput=journal
StandardError=journal
SyslogIdentifier=teamspeak-discord-bridge

# Environment
Environment=NODE_ENV=production
EnvironmentFile=/opt/teamspeak-discord-bridge/.env

# Resource limits
MemoryLimit=1G
CPUQuota=100%

# Security
NoNewPrivileges=true
PrivateTmp=true
ProtectSystem=strict
ProtectHome=true
ReadWritePaths=/opt/teamspeak-discord-bridge/data /opt/teamspeak-discord-bridge/logs

[Install]
WantedBy=multi-user.target
```

```bash
# Enable and start
sudo systemctl daemon-reload
sudo systemctl enable teamspeak-discord-bridge
sudo systemctl start teamspeak-discord-bridge
sudo systemctl status teamspeak-discord-bridge
```

### Method 3: Kubernetes

```yaml
# k8s/deployment.yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: teamspeak-discord-bridge
  labels:
    app: teamspeak-discord-bridge
spec:
  replicas: 1
  selector:
    matchLabels:
      app: teamspeak-discord-bridge
  template:
    metadata:
      labels:
        app: teamspeak-discord-bridge
    spec:
      containers:
      - name: bridge
        image: ghcr.io/3bdelrahmanashraf/team-speak-to-discord:latest
        ports:
        - containerPort: 3000
        envFrom:
        - secretRef:
            name: bridge-secrets
        - configMapRef:
            name: bridge-config
        resources:
          requests:
            memory: "512Mi"
            cpu: "250m"
          limits:
            memory: "1Gi"
            cpu: "1000m"
        livenessProbe:
          httpGet:
            path: /health
            port: 3000
          initialDelaySeconds: 40
          periodSeconds: 30
        readinessProbe:
          httpGet:
            path: /health
            port: 3000
          initialDelaySeconds: 10
          periodSeconds: 10
---
apiVersion: v1
kind: Service
metadata:
  name: teamspeak-discord-bridge
spec:
  selector:
    app: teamspeak-discord-bridge
  ports:
  - port: 3000
    targetPort: 3000
  type: ClusterIP
---
apiVersion: v1
kind: ConfigMap
metadata:
  name: bridge-config
data:
  NODE_ENV: "production"
  WEB_DASHBOARD_ENABLED: "true"
  WEB_DASHBOARD_PORT: "3000"
  BRIDGE_LOG_LEVEL: "info"
---
apiVersion: v1
kind: Secret
metadata:
  name: bridge-secrets
type: Opaque
stringData:
  DISCORD_TOKEN: "your-token"
  DISCORD_CLIENT_ID: "your-client-id"
  DISCORD_GUILD_ID: "your-guild-id"
  TS_HOST: "your-ts-host"
  TS_QUERY_PORT: "10011"
  TS_USERNAME: "serveradmin"
  TS_PASSWORD: "your-password"
  DATABASE_URL: "postgresql://..."
  REDIS_URL: "redis://..."
```

```bash
# Apply
kubectl apply -f k8s/
```

---

## Database Setup

### PostgreSQL

```sql
-- Create database and user
CREATE DATABASE teamspeak_discord_bridge;
CREATE USER bridge WITH ENCRYPTED PASSWORD 'secure_password';
GRANT ALL PRIVILEGES ON DATABASE teamspeak_discord_bridge TO bridge;

-- Run migrations (from project root)
npx prisma migrate deploy
```

### Redis

```bash
# Basic setup
redis-server --appendonly yes --maxmemory 256mb --maxmemory-policy allkeys-lru

# With password
redis-server --requirepass your_password --appendonly yes
```

---

## Reverse Proxy (Nginx)

```nginx
# /etc/nginx/sites-available/teamspeak-discord-bridge
server {
    listen 80;
    server_name bridge.yourdomain.com;

    # Redirect to HTTPS
    return 301 https://$server_name$request_uri;
}

server {
    listen 443 ssl http2;
    server_name bridge.yourdomain.com;

    ssl_certificate /etc/letsencrypt/live/bridge.yourdomain.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/bridge.yourdomain.com/privkey.pem;

    # Security headers
    add_header X-Frame-Options DENY;
    add_header X-Content-Type-Options nosniff;
    add_header X-XSS-Protection "1; mode=block";

    # Dashboard
    location / {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
    }

    # WebSocket for real-time updates
    location /ws {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
    }
}
```

```bash
# Enable site
sudo ln -s /etc/nginx/sites-available/teamspeak-discord-bridge /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl reload nginx
```

---

## SSL/TLS Certificates

### Let's Encrypt (Certbot)

```bash
# Install certbot
sudo apt install certbot python3-certbot-nginx

# Obtain certificate
sudo certbot --nginx -d bridge.yourdomain.com

# Auto-renewal
sudo systemctl enable certbot.timer
```

---

## Monitoring

### Prometheus + Grafana

```yaml
# prometheus.yml
scrape_configs:
  - job_name: 'teamspeak-discord-bridge'
    static_configs:
      - targets: ['localhost:3000']
```

### Health Check Endpoint

The bridge exposes `/health` endpoint returning:
```json
{
  "status": "healthy",
  "timestamp": "2026-01-15T10:30:00.000Z",
  "uptime": 3600,
  "components": {
    "teamspeak": "connected",
    "discord": "connected",
    "database": "connected",
    "redis": "connected",
    "audio": "ready"
  },
  "metrics": {
    "memoryUsage": 128000000,
    "cpuUsage": 15.5,
    "connectedUsers": 25
  }
}
```

### Log Aggregation

```bash
# Docker logs
docker compose logs -f bridge

# Systemd logs
journalctl -u teamspeak-discord-bridge -f

# File logs (if configured)
tail -f /opt/teamspeak-discord-bridge/logs/bridge.log
```

---

## Backup & Recovery

### Database Backup

```bash
# Daily backup script
#!/bin/bash
BACKUP_DIR="/backups/teamspeak-discord-bridge"
DATE=$(date +%Y%m%d_%H%M%S)
mkdir -p $BACKUP_DIR

pg_dump -U bridge -h localhost teamspeak_discord_bridge | gzip > $BACKUP_DIR/db_$DATE.sql.gz

# Keep last 30 days
find $BACKUP_DIR -name "db_*.sql.gz" -mtime +30 -delete
```

### Configuration Backup

```bash
# Backup .env and config
tar -czf /backups/bridge_config_$(date +%Y%m%d).tar.gz .env config/
```

---

## Troubleshooting

### Common Issues

| Issue | Solution |
|-------|----------|
| Bridge won't start | Check `.env` configuration, verify DB/Redis connectivity |
| TeamSpeak connection fails | Verify Query port (10011), credentials, firewall |
| Discord bot not responding | Check token, intents, guild ID |
| Audio not working | Verify Opus library, check voice channel permissions |
| High memory usage | Reduce audio quality, check for memory leaks |
| Frequent reconnections | Increase reconnect interval, check network stability |

### Debug Mode

```bash
# Enable debug logging
BRIDGE_LOG_LEVEL=debug npm run dev

# Or in Docker
docker compose exec bridge BRIDGE_LOG_LEVEL=debug node dist/bot/index.js
```

### Performance Tuning

```env
# Reduce resource usage
AUDIO_QUALITY=medium
BRIDGE_MAX_CONCURRENT_USERS=50
BRIDGE_SYNC_INTERVAL=10000
```

---

## Updates

### Docker

```bash
# Pull latest image
docker compose pull

# Restart with new image
docker compose up -d
```

### Bare Metal

```bash
cd /opt/teamspeak-discord-bridge
git pull origin main
npm ci
npx prisma migrate deploy
npm run build
sudo systemctl restart teamspeak-discord-bridge
```

---

## Security Checklist

- [ ] Strong passwords for DB/Redis
- [ ] Firewall rules (only necessary ports)
- [ ] SSL/TLS for dashboard
- [ ] Regular dependency updates (`npm audit`)
- [ ] Bot token rotation
- [ ] Audit log monitoring
- [ ] Backup encryption
- [ ] Non-root user for service