# SMS-Slack Relay

[English](./README.md) | 한국어

Android SMS Gateway ↔ Slack 양방향 릴레이 시스템.

Android 폰에서 수신한 SMS를 자동으로 Slack 채널에 릴레이하고, Slack에서 답장하면 해당 폰을 통해 SMS를 발송합니다.

## 주요 기능

- **SMS 수신 → Slack**: 폰에 도착한 SMS를 Slack 채널에 자동 포스팅
- **Slack → SMS 발송**: `/sms` 커맨드 또는 모달을 통해 SMS 발송
- **연락처 관리**: `/contact` 커맨드로 전화번호 ↔ 이름 매핑 CRUD
- **스레드 관리**: 같은 번호와의 대화를 Slack 스레드로 묶음 (5일 TTL)
- **중복 방지**: 30초 이내 동일 메시지 필터링
- **담당자 멘션**: 마지막 답장한 담당자에게 자동 @멘션
- **헬스체크**: DB, SMS Gateway, 폰 기기 연결 상태 모니터링

## 아키텍처

```
┌─────────────────────────────────────────────────────────┐
│                    Docker Compose                        │
│                                                          │
│  ┌──────────┐   ┌──────────────┐   ┌─────────────────┐  │
│  │  nginx   │──▶│  app (relay) │──▶│  sms-backend    │  │
│  │ (reverse │   │  Next.js     │   │  (ASG Server)   │  │
│  │  proxy)  │   │  port:3000   │   │  port:3080      │  │
│  │ 80/443   │   └──────┬───────┘   └────────┬────────┘  │
│  └──────────┘          │                     │           │
│                        ▼            ┌────────┴────────┐  │
│                   ┌─────────┐      │  sms-worker     │  │
│                   │  MySQL  │◀─────┘                    │
│                   │  8.0    │                           │
│                   └─────────┘                           │
└─────────────────────────────────────────────────────────┘
         ▲                              ▲
         │ HTTPS                        │ WebSocket/Polling
         │                              │
    ┌────┴────┐                    ┌────┴────┐
    │  Slack  │                    │ Android │
    │  API    │                    │  폰 앱  │
    └─────────┘                    └─────────┘
```

## 기술 스택

| 카테고리 | 선택 |
|---------|------|
| 런타임 | Next.js (App Router) |
| 언어 | TypeScript |
| ORM | Prisma |
| DB | MySQL 8.0 |
| Slack SDK | @slack/web-api |
| 검증 | Zod |
| 로깅 | Pino |
| 컨테이너 | Docker Compose |
| SMS Gateway | [Android SMS Gateway](https://github.com/android-sms-gateway/server) |
| 리버스 프록시 | Nginx |

## 설치 및 실행

### 1. 프로젝트 클론

```bash
git clone https://github.com/your-username/sms-slack-relay.git
cd sms-slack-relay
```

### 2. 의존성 설치

```bash
pnpm install
```

### 3. 환경변수 설정

```bash
cp .env.example .env
# .env 파일에서 각 값을 채워주세요
```

### 4. SSL 인증서 준비

```bash
# Let's Encrypt 인증서 발급 (nginx 설정에서 도메인 변경 필요)
sudo certbot certonly --standalone -d your-domain.com
```

### 5. Docker Compose 실행

```bash
docker compose up -d
```

### 6. DB 마이그레이션

```bash
# 컨테이너 내에서 실행하거나 로컬에서 DATABASE_URL을 맞춘 뒤:
npx prisma migrate dev --name init
```

### 7. 기본 메시지 앱 설정 (RCS 비활성화 필수)

> **⚠️ 중요**: Android SMS Gateway는 기존 SMS/MMS 프로토콜 기반으로 동작합니다. **RCS(Rich Communication Services)가 활성화된 메시지 앱에서는 웹훅이 정상 처리되지 않습니다.**

- **삼성 기본 메시지 앱**: RCS가 내장되어 있어 **별도로 RCS를 해제할 수 없습니다**. 따라서 삼성 기본 메시지 앱으로는 웹훅 수신이 동작하지 않습니다.
- **해결 방법**: [Google 메시지](https://play.google.com/store/apps/details?id=com.google.android.apps.messaging) 앱을 설치한 뒤 **기본 SMS 앱으로 설정**하고, Google 메시지 설정에서 **RCS 채팅(채팅 기능)을 비활성화**하면 정상 동작합니다.

**정리하면, SMS Gateway가 동작하려면 RCS 해제가 가능한 메시지 앱이 기본 메시지 앱으로 설정되어 있어야 합니다.**

### 8. Android SMS Gateway 앱 설정

1. [Android SMS Gateway](https://github.com/android-sms-gateway/android) 앱을 폰에 설치
2. 앱 설정에서 서버 URL 입력: `https://your-domain.com/api/mobile/`
3. Private Token 입력: `.env`의 `ASG_GATEWAY_PRIVATE_TOKEN` 값
4. 연결 확인

### 9. Slack App 설정

1. [Slack API](https://api.slack.com/apps)에서 앱 생성
2. Bot Token Scopes 추가: `chat:write`, `commands`, `users:read`
3. Interactivity & Shortcuts:
   - Request URL: `https://your-domain.com/api/slack/action`
   - Options Load URL: `https://your-domain.com/api/slack/options`
4. Slash Commands 등록:
   - `/sms` → `https://your-domain.com/api/slack/command`
   - `/contact` → `https://your-domain.com/api/slack/command`
5. Event Subscriptions:
   - Request URL: `https://your-domain.com/api/slack/event`

## Slash Commands

### `/sms`

| 사용법 | 설명 |
|--------|------|
| `/sms` | SMS 발송 모달 오픈 |
| `/sms 홍길동 안녕하세요` | 이름으로 검색해서 인라인 발송 |
| `/sms 010-1234-5678 안녕하세요` | 번호로 직접 인라인 발송 |

### `/contact`

| 사용법 | 설명 |
|--------|------|
| `/contact` | 전체 연락처 목록 |
| `/contact 홍길동 010-1234-5678` | 연락처 추가/수정 |
| `/contact 홍길동 010-1234-5678 메모` | 메모 포함 추가 |
| `/contact 삭제 홍길동` | 연락처 삭제 |

## 환경변수

| 변수 | 설명 | 예시 |
|------|------|------|
| `SLACK_BOT_TOKEN` | Slack 봇 토큰 | `xoxb-...` |
| `SLACK_SIGNING_SECRET` | Slack 요청 서명 검증용 | - |
| `SLACK_CHANNEL_CS_SMS` | SMS 릴레이 채널 ID | `C0000000000` |
| `SMS_GATEWAY_URL` | ASG 서버 내부 주소 | `http://sms-backend:3080` |
| `SMS_GATEWAY_USERNAME` | ASG Basic Auth 유저명 | - |
| `SMS_GATEWAY_PASSWORD` | ASG Basic Auth 패스워드 | - |
| `SMS_GATEWAY_WEBHOOK_SECRET` | 웹훅 HMAC 서명 시크릿 | - |
| `ASG_GATEWAY_PRIVATE_TOKEN` | 폰 앱 연결 토큰 | `openssl rand -hex 32` |
| `DATABASE_URL` | MySQL 연결 문자열 | `mysql://toont:...@mysql:3306/toont_relay` |
| `MYSQL_ROOT_PASSWORD` | MySQL root 패스워드 | - |
| `APP_URL` | 외부 접근 URL | `https://your-domain.com` |
| `CRON_SECRET` | 크론 엔드포인트 인증 | - |
| `HEALTH_CHECK_DEVICE_THRESHOLD_MINUTES` | 기기 끊김 임계값 (분) | `30` |

## 헬스체크

- `GET /api/health` — 시스템 상태 조회
- `GET /api/cron/health-monitor` — 주기적 모니터링 (Bearer 토큰 필요)

## 라이선스

MIT
