# Acadium

> **AI-powered teaching operations for Telegram groups.**
>
> Acadium helps teachers run group lessons in Telegram while keeping sessions, students, conversations, source-grounded AI signals, subscriptions, and platform operations in one workspace.

[![Production](https://img.shields.io/badge/production-live-176b4d?style=flat-square)](https://acadiumai-y23u8tno.manus.space)
[![Telegram](https://img.shields.io/badge/Telegram-Web%20App-229ED9?style=flat-square&logo=telegram&logoColor=white)](https://telegram.org/)
[![Tests](https://img.shields.io/badge/tests-77%20passing-176b4d?style=flat-square)](https://github.com/codot-09/acadium)

## Overview

Acadium is a teacher-first EdTech platform delivered through a **Telegram Web App and Telegram Bot**. Teaching happens inside Telegram groups; the Web App acts as the teacher’s operational workspace for reviewing lesson history, student activity, conversation timelines, AI signals, teaching sources, and subscription status.

The platform is designed around a group-first workflow rather than a generic content generator:

1. A teacher adds the Acadium bot to a Telegram group with the required administrator permissions.
2. The teacher starts a lesson with `/lesson <topic>`.
3. Acadium creates and delivers a lesson starter, resources, and questions in the group.
4. Students reply to lesson messages or ask questions; the bot analyzes the interaction and responds in context.
5. The teacher reviews attendance, participation, student signals, conversation events, and session controls in the Web App.

## Product capabilities

| Area | Capability |
| --- | --- |
| Telegram teaching | Group lessons with `/lesson`, `/ask`, `/endlesson`, `/pause`, `/resume`, `/status`, and `/help`. |
| AI teaching assistant | Structured lesson briefs, resources, questions, contextual replies, classifications, confidence signals, and teacher follow-up indicators. |
| Teacher workspace | Session history, live polling, session details, student analytics, conversation timelines, and pause/resume/end controls. |
| Local source grounding | Upload PDF, DOCX, TXT, Markdown, CSV, and JSON files. Local mode grounds lesson and reply analysis in teacher-managed sources. |
| Web mode | Keeps the general AI knowledge workflow when the teacher selects Web mode. |
| Student persistence | Telegram profiles, group membership, session participants, responses, attendance, and participation are stored in the database. |
| Subscriptions | Three free group sessions, Individual plan at 99,000 UZS per month, Click payment, receipt upload, AI verification, and Enterprise contact flow. |
| Receipt review | AI extracts payment facts and queues uncertain receipts for admin review. Admin approval can activate the subscription idempotently. |
| Admin control room | Secure admin login, platform analytics, profile role management, session moderation, subscription status management, and receipt approval/rejection. |
| Security | Signed Telegram `initData`, signed webhook verification, replay protection, ownership checks, rate limiting, duplicate receipt fingerprints, and idempotent subscription activation. |

## Screens and roles

### Teacher workspace

The teacher workspace is available inside the Telegram Web App. It includes four operational areas:

- **Lesson sessions:** saved group sessions, session detail, event timelines, participants, AI analysis counts, and live controls.
- **Student analytics:** participation, attendance, response counts, confidence, classifications, and teacher follow-up signals.
- **Teaching sources:** uploaded files, source archive actions, extraction status, and Web/Local AI mode selection.
- **Subscription:** free-session status, Individual Click payment, receipt upload, AI verification status, and Enterprise contact.

Student access is intentionally limited to the teacher-first operating model. Students participate through Telegram groups and replies rather than through the teacher workspace dashboard.

### Admin control room

The admin panel is available at `/admin` and uses a separate secret-backed login session. It provides platform-wide operational controls without exposing admin credentials in source code:

- Overview KPI cards and operational health signals.
- Telegram profile directory and teacher/student role changes.
- Group session status moderation: live, paused, and ended.
- Individual subscription monitoring and status management.
- Receipt review with AI payment facts, confidence, evidence, fraud signals, and approve/reject actions.

## Receipt verification flow

Receipt verification is intentionally conservative. The AI extracts visible facts from a PDF or image, while the server applies the final approval rules. A receipt must visibly satisfy the required payment evidence before automatic activation is allowed.

The server checks the following conditions together:

| Check | Requirement |
| --- | --- |
| Amount | Exactly `99,000` UZS. |
| Payment status | A visible successful/completed payment, not pending, failed, refunded, or cancelled. |
| Recipient | A visible payment recipient or reference associated with the intended Click destination. |
| Transaction | A visible transaction or payment reference ID. |
| Date | A valid visible payment date. |
| Evidence | At least two concise visible evidence statements. |
| Confidence | At least 90% confidence from the AI extraction. |
| Fraud signals | No unresolved fraud or authenticity signals. |

If the receipt is uncertain or automatic analysis fails, it remains **pending** for admin review and does not activate a subscription. Admin **Approve** updates the receipt and activates the Individual subscription through an idempotent `receiptId` path. Admin **Reject** never creates a subscription. A SHA-256 receipt fingerprint and a unique receipt relationship prevent reuse and double activation.

## Subscription model

Acadium provides three free group sessions per teacher. After the free allowance is exhausted, an active subscription is required to start additional sessions.

| Plan | Audience | Price / access | Contact |
| --- | --- | --- | --- |
| Individual | One teacher | 99,000 UZS for 31 days | Click payment link in the Web App, then upload the receipt. |
| Enterprise | Learning centers and teams | Custom plan | [Contact @otabek_nabiyev1 on Telegram](https://t.me/otabek_nabiyev1). |

Individual Click payment: [Pay through Click](https://my.click.uz/clickp2p/65D764DEBC1A88669CD322BDA7ED0DD78039F1E642BFFD41D866DAD78C4AD5D6)

## Technology stack

| Layer | Technology |
| --- | --- |
| Frontend | React 19, Vite, Tailwind CSS 4, Lucide React, Wouter, TanStack-style tRPC hooks. |
| Backend | Node.js, Express 4, tRPC 11, TypeScript. |
| Data | MySQL/TiDB through Drizzle ORM and generated migrations. |
| AI | Structured-output LLM integration through the platform’s server-side LLM client. |
| Storage | S3-compatible object storage for teaching sources and receipts; metadata remains in the database. |
| Authentication | Telegram `initData` verification for the Web App, signed webhook verification, and separate signed admin sessions. |
| Testing | Vitest, Testing Library, jsdom, TypeScript checks, production build checks, and responsive visual QA. |

## Repository structure

```text
acadium/
├── client/
│   └── src/
│       ├── components/       # Shared UI, dashboard, chat, subscription components
│       ├── pages/             # Teacher workspace, admin, and supporting pages
│       ├── hooks/             # Reusable frontend hooks
│       ├── lib/               # tRPC client and frontend utilities
│       └── index.css          # Unified Acadium visual system
├── server/
│   ├── _core/                 # Runtime, auth context, LLM, storage, and framework plumbing
│   ├── db.ts                  # Drizzle query helpers and domain persistence
│   ├── routers.ts             # tRPC procedures and authorization contracts
│   ├── telegramBot.ts         # Telegram group commands and lesson interaction
│   ├── telegramWebhook.ts     # Signed webhook update processing
│   ├── sourceLibrary.ts       # File extraction and source grounding
│   ├── subscriptions.ts       # Payment rules and receipt AI contract
│   ├── subscriptionUpload.ts  # Secure receipt upload and verification route
│   ├── adminAuth.ts           # Admin credential and signed-session helpers
│   └── *.test.ts              # Server regression and integration tests
├── drizzle/
│   ├── schema.ts              # Database schema
│   └── *.sql                  # Generated migrations
├── docs/
│   ├── telegram-integration.md
│   └── admin-panel.md
├── shared/                    # Shared types and constants
├── package.json
└── README.md
```

## Local development

### Prerequisites

Use Node.js 22 or a compatible current Node.js release, pnpm, a MySQL/TiDB database, an S3-compatible storage configuration, a Telegram bot token, and the platform runtime credentials required by the server integrations.

### Install dependencies

```bash
pnpm install
```

### Configure environment variables

Do not commit `.env` files or credentials. Configure secrets through the project’s secret manager or your deployment environment.

| Variable | Purpose |
| --- | --- |
| `DATABASE_URL` | MySQL/TiDB connection string. |
| `JWT_SECRET` | Session and cookie signing material. |
| `TELEGRAM_BOT_TOKEN` | Telegram Bot API access. |
| `TELEGRAM_WEBHOOK_SECRET` | Secret header used to verify Telegram webhook requests. |
| `ACADIUM_ADMIN_LOGIN` | Admin login identifier. |
| `ACADIUM_ADMIN_PASSWORD` | Admin password. |
| `BUILT_IN_FORGE_API_URL` | Server-side platform API endpoint. |
| `BUILT_IN_FORGE_API_KEY` | Server-side platform API credential. |
| `VITE_FRONTEND_FORGE_API_URL` | Frontend platform API endpoint where required. |
| `VITE_FRONTEND_FORGE_API_KEY` | Frontend platform API credential where required. |
| `OAUTH_SERVER_URL` | Manus OAuth server URL. |
| `VITE_OAUTH_PORTAL_URL` | Frontend OAuth portal URL. |
| `OWNER_OPEN_ID` / `OWNER_NAME` | Project owner identity used by platform integrations. |
| `VITE_APP_ID` / `VITE_APP_TITLE` / `VITE_APP_LOGO` | Application identity and branding. |

### Run the development server

```bash
pnpm dev
```

The development server runs the Vite frontend and the Node/Express API through the project runtime. Do not hardcode a production port; use the port supplied by the runtime environment.

## Database workflow

Schema changes are managed through Drizzle. The safe workflow is:

```bash
pnpm drizzle-kit generate
```

Review the generated SQL migration before applying it to the database. Apply migrations through the project’s managed database migration workflow, then verify the resulting schema and run the test suite.

File bytes must remain in S3-compatible storage. Database rows should contain ownership, metadata, extracted text where appropriate, storage keys, fingerprints, and review state rather than large binary payloads.

## Telegram setup

The complete setup procedure is documented in [`docs/telegram-integration.md`](docs/telegram-integration.md). In summary:

1. Create or configure the Telegram bot with BotFather.
2. Set the bot token and webhook secret as deployment secrets.
3. Configure the production webhook URL.
4. Add the bot to a Telegram group as an administrator with the permissions required for lesson messages and member events.
5. Promote or invite the teacher through the approved teacher-access flow.
6. Open the Web App from Telegram so signed `initData` can be verified and the teacher profile can be persisted.

The bot supports `/lesson <topic>`, `/ask <question>`, `/endlesson`, `/pause`, `/resume`, `/status`, and `/help`. Group replies are interpreted in lesson context and persisted as student events.

## Testing and quality checks

Run the full test suite and production build before releasing changes:

```bash
pnpm check
pnpm test
pnpm build
```

The repository includes server-side authorization, Telegram webhook, group lesson, source upload, receipt verification, subscription idempotency, admin moderation, and frontend component regression coverage. The external Telegram `getMe` check is controlled separately so offline test runs remain deterministic.

## Production deployment

Acadium is designed for managed deployment with environment-injected secrets, a persistent MySQL/TiDB database, and S3-compatible object storage. Before creating a release checkpoint or deployment:

1. Confirm migrations are reviewed and applied.
2. Confirm Telegram webhook secrets and bot permissions.
3. Confirm admin credentials are configured as secrets rather than source values.
4. Run `pnpm check`, `pnpm test`, and `pnpm build`.
5. Verify the Web App inside Telegram with a real teacher session.
6. Check group lesson creation, reply analysis, source-grounded Local mode, receipt review, and admin moderation.

## Security principles

Acadium treats Telegram identity, webhook requests, uploaded files, payment receipts, and admin controls as sensitive operations. The application validates signed Telegram data, verifies webhook secrets, checks teacher and admin authorization server-side, protects ownership boundaries, rate-limits group AI analysis, rejects duplicate receipt fingerprints, and makes receipt-based subscription activation idempotent.

Never place bot tokens, admin passwords, database URLs, storage credentials, LLM credentials, or Telegram `initData` values in the repository, screenshots, logs, issues, or chat messages.

## Documentation

- [`docs/telegram-integration.md`](docs/telegram-integration.md) — Telegram bot, Web App, webhook, and group setup.
- [`docs/admin-panel.md`](docs/admin-panel.md) — Admin login, analytics, moderation, and receipt review operations.
- [Production Web App](https://acadiumai-y23u8tno.manus.space) — Acadium hosted application.
- [GitHub repository](https://github.com/codot-09/acadium) — Source code and issue tracking.

## License

No open-source license has been declared for this repository yet. Unless a license is added by the project owner, all rights are reserved by the repository owner.
