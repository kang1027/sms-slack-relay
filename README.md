# SMS-Slack Relay

English | [한국어](./README.ko.md)

Bidirectional relay system between Android SMS Gateway and Slack.

Automatically relays SMS received on an Android phone to a Slack channel, and sends SMS through the phone when you reply from Slack.

## Features

- **SMS → Slack**: Automatically posts incoming SMS to a Slack channel
- **Slack → SMS**: Send SMS via `/sms` command or modal
- **Contact Management**: Phone number ↔ name mapping CRUD via `/contact` command
- **Thread Management**: Groups conversations with the same number into Slack threads (5-day TTL)
- **Deduplication**: Filters duplicate messages within 30 seconds
- **Assignee Mention**: Auto @mentions the last person who replied
- **Health Check**: Monitors DB, SMS Gateway, and phone device connectivity

## Architecture

![Architecture](./images/architecture.png)

## Tech Stack

| Category | Choice |
|----------|--------|
| Runtime | Next.js (App Router) |
| Language | TypeScript |
| ORM | Prisma |
| DB | MySQL 8.0 |
| Slack SDK | @slack/web-api |
| Validation | Zod |
| Logging | Pino |
| Container | Docker Compose |
| SMS Gateway | [Android SMS Gateway](https://github.com/android-sms-gateway/server) |
| Reverse Proxy | Nginx |

## Installation & Setup

### 1. Clone the Repository

```bash
git clone https://github.com/your-username/sms-slack-relay.git
cd sms-slack-relay
```

### 2. Install Dependencies

```bash
pnpm install
```

### 3. Configure Environment Variables

```bash
cp .env.example .env
# Fill in each value in the .env file
```

### 4. Prepare SSL Certificate

```bash
# Issue Let's Encrypt certificate (update domain in nginx config)
sudo certbot certonly --standalone -d your-domain.com
```

### 5. Start Docker Compose

```bash
docker compose up -d
```

### 6. Run DB Migration

```bash
# Run inside the container or locally with the correct DATABASE_URL:
npx prisma migrate dev --name init
```

### 7. Default Messaging App Setup (RCS Must Be Disabled)

> **⚠️ Important**: Android SMS Gateway operates on the traditional SMS/MMS protocol. **Webhooks will not work properly when RCS (Rich Communication Services) is enabled in the messaging app.**

- **Samsung Messages (default)**: RCS is built-in and **cannot be disabled separately**. Therefore, webhook reception will not work with Samsung's default messaging app.
- **Solution**: Install [Google Messages](https://play.google.com/store/apps/details?id=com.google.android.apps.messaging), **set it as the default SMS app**, and **disable RCS chat (Chat features)** in Google Messages settings. This will allow the gateway to function properly.

**In short, the SMS Gateway requires a messaging app that supports disabling RCS to be set as the default messaging app.**

### 8. Android SMS Gateway App Setup

1. Install the [Android SMS Gateway](https://github.com/android-sms-gateway/android) app on your phone
2. Enter the server URL in app settings: `https://your-domain.com/api/mobile/`
3. Enter the Private Token: the `ASG_GATEWAY_PRIVATE_TOKEN` value from `.env`
4. Verify the connection

### 9. Slack App Setup

1. Create an app at [Slack API](https://api.slack.com/apps)
2. Add Bot Token Scopes: `chat:write`, `commands`, `users:read`
3. Interactivity & Shortcuts:
   - Request URL: `https://your-domain.com/api/slack/action`
   - Options Load URL: `https://your-domain.com/api/slack/options`
4. Register Slash Commands:
   - `/sms` → `https://your-domain.com/api/slack/command`
   - `/contact` → `https://your-domain.com/api/slack/command`
5. Event Subscriptions:
   - Request URL: `https://your-domain.com/api/slack/event`

## Slash Commands

### `/sms`

| Usage | Description |
|-------|-------------|
| `/sms` | Open SMS send modal |
| `/sms John Hello` | Search by name and send inline |
| `/sms 010-1234-5678 Hello` | Send directly by phone number |

### `/contact`

| Usage | Description |
|-------|-------------|
| `/contact` | List all contacts |
| `/contact John 010-1234-5678` | Add/update contact |
| `/contact John 010-1234-5678 notes` | Add with notes |
| `/contact delete John` | Delete contact |

## Environment Variables

| Variable | Description | Example |
|----------|-------------|---------|
| `SLACK_BOT_TOKEN` | Slack bot token | `xoxb-...` |
| `SLACK_SIGNING_SECRET` | Slack request signature verification | - |
| `SLACK_CHANNEL_CS_SMS` | SMS relay channel ID | `C0000000000` |
| `SMS_GATEWAY_URL` | ASG server internal URL | `http://sms-backend:3080` |
| `SMS_GATEWAY_USERNAME` | ASG Basic Auth username | - |
| `SMS_GATEWAY_PASSWORD` | ASG Basic Auth password | - |
| `SMS_GATEWAY_WEBHOOK_SECRET` | Webhook HMAC signing secret | - |
| `ASG_GATEWAY_PRIVATE_TOKEN` | Phone app connection token | `openssl rand -hex 32` |
| `DATABASE_URL` | MySQL connection string | `mysql://user:...@mysql:3306/relay` |
| `MYSQL_ROOT_PASSWORD` | MySQL root password | - |
| `APP_URL` | External access URL | `https://your-domain.com` |
| `CRON_SECRET` | Cron endpoint authentication | - |
| `HEALTH_CHECK_DEVICE_THRESHOLD_MINUTES` | Device disconnect threshold (min) | `30` |

## Health Check

- `GET /api/health` — System status
- `GET /api/cron/health-monitor` — Periodic monitoring (Bearer token required)

## Deployment Notes

> **⚠️ This project is NOT suitable for serverless platforms (e.g., Vercel, AWS Lambda).**

This system requires persistent connections and background processes:

- **SMS Gateway (ASG Server)** maintains a persistent WebSocket/Polling connection with the Android phone
- **SMS Worker** runs continuously in the background
- **MySQL** must be always available

Serverless platforms wake up only on incoming requests and cannot maintain persistent connections or background workers. **You must deploy this on a VPS or dedicated server** running Docker Compose (e.g., AWS EC2, Oracle Cloud Free Tier, home server, etc.).

## License

MIT
