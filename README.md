# Bedtime Companion

A private, local-first bedtime storyteller. The Mac mini owns story generation, policy, session state, media, and device coordination. A Raspberry Pi in the bedroom is a replaceable thin client for audio, buttons, lighting, and later a bounded microphone interaction window.

## Current status

The first dependable device vertical slice is implemented:

- shared runtime-validated session and device contracts;
- persisted server-authoritative sessions, queue items, commands, events, and media manifests;
- per-device bearer-token authentication;
- cursor-based command polling, acknowledgements, deduplicated events, and SHA-256 media verification;
- an executable Pi simulator with an atomic local cache/state file;
- adult connection-test and live session-status pages;
- profile-aware OpenAI story generation, versioned safety policy, corrective retry, fallback story, and OpenAI narration;
- profile, feedback, Sleep Stream planning, and experimental StoryWorld pages retained from the earlier prototype.

WebSocket delivery, real GPIO/audio adapters, interactive recording, generated-story dispatch through the new queue, and full Sleep Stream playback remain future milestones. HTTP polling is intentionally the first working transport.

## Local setup

Use Node.js 22 (see `.nvmrc`).

```bash
npm install
cp .env.example .env
npm run db:generate
npm run db:push
npm run db:seed
npm run dev
```

The development seed uses `emma-room-dev-token` when `EMMA_DEVICE_TOKEN` is not configured. Set strong random `DEVICE_TOKEN_PEPPER` and `EMMA_DEVICE_TOKEN` values before moving beyond local development.

Start the simulated bedroom node in a second terminal:

```bash
npm run dev:pi-sim
```

The local simulator command loads `EMMA_DEVICE_TOKEN` from `.env`. After changing either the device token or its pepper, run `npm run db:seed` to update the stored device-token hash.

Open `http://localhost:3000/session/new`, queue the connection test, and watch the session move from `READY` to `PLAYING` to `COMPLETED`.

## Quality checks

```bash
npm run check
```

This runs ESLint, TypeScript, Vitest, and the production Next.js build. Runtime SQLite, media, simulator cache, secrets, IDE files, and dependencies are ignored by Git.

## Raspberry Pi

Follow [docs/RASPBERRY_PI_BRINGUP.md](docs/RASPBERRY_PI_BRINGUP.md). Validate power and the I2S/NeoPixel pin plan before wiring; GPIO values from earlier concept documents are placeholders.

## Mac mini service

Production hosting and recovery commands are documented in [docs/MAC_MINI_SERVICE.md](docs/MAC_MINI_SERVICE.md).

## API

The versioned device surface currently includes:

- `POST /api/v1/sessions`
- `GET /api/v1/sessions/:id`
- `POST /api/v1/sessions/:id/actions`
- `POST /api/v1/devices/:id/connect`
- `GET /api/v1/devices/:id/snapshot`
- `GET /api/v1/devices/:id/commands?after=<sequence>`
- `POST /api/v1/devices/:id/events`
- `GET /api/v1/media/:assetId`
- `GET /api/health/live`
- `GET /api/health/ready`

The server and simulator import the same schemas from `packages/contracts`.
