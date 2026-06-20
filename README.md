# Roomboard

A realtime collaborative room board built with Next.js App Router and Pixi.js.

The useful thing is simple: create a private room, share editor or viewer invites, collaborate on one visual board, then close the room when the work is done. New rooms are invite-only by default, while the creator gets a local owner token for room controls. People can add sticky notes, drop image references, drag cards around, connect related items, edit notes, and leave comments. Open the same room in two tabs with an invite and the board updates live.

## What is implemented

- Next.js 14+ App Router dashboard for creating and opening shared rooms. The demo currently runs on Next.js 16.
- Room-specific routes at `/rooms/[roomId]` so each collaboration space has its own invite URL.
- Private invite rooms by default, with creator-only lock/unlock, viewer/editor invite links, and close controls.
- Supabase Auth demo with row-level-security-backed profiles and subscription reads.
- Stripe Billing demo for annual subscriptions through Checkout Sessions, Customer Portal, and webhooks.
- Client-only Pixi.js v8 canvas with draggable notes and image cards.
- Realtime board updates through Phoenix Channels when the sidecar is configured, with Next Server-Sent Events as the local-development fallback.
- Selected-item inspector with note editing, image previews, and comments.
- Link creation between cards for lightweight mapping and visual review.
- Realtime local collaboration through Phoenix Presence when the sidecar is configured, with `/api/rooms/[roomId]/presence` as the local-development fallback.
- Elixir/Phoenix sidecar in `realtime/roomboard_realtime/` for collaborator presence and board mutation fanout.

## Run

```bash
npm install
npm run dev
```

Then open `http://localhost:3050`.

Create a room from the dashboard, then open that room URL in two tabs. Add a note or image in one tab and watch it appear in the other.

## Useful commands

```bash
npm run typecheck
npm run build
npm run smoke
npm run smoke:realtime
```

### Smoke checks

- Start the app with `npm run dev` (or `npx next start -p 3050` after a production build), then run `npm run smoke` to exercise the local Next app API/UI path at `http://localhost:3050`.
- `SMOKE_BASE_URL=https://roomboard.online npm run smoke` runs the same checks against the production showcase. This creates, mutates, uploads to, and closes a real smoke-test room.
- `npm run smoke:realtime` launches its own Next and Phoenix processes, verifies presence/board fanout, then stops Phoenix to verify the local fallback. It requires the Elixir toolchain and a prior `mix setup` in `realtime/roomboard_realtime/`.

Before sharing a public build, follow the canonical production checklist in [`ROADMAP.md`](./ROADMAP.md#release-checklist).

## Phoenix realtime sidecar

Run Phoenix in a second terminal:

```bash
cd realtime/roomboard_realtime
mix setup
PORT=4001 mix phx.server
```

Run the Next app with the sidecar URL available to the browser:

```bash
NEXT_PUBLIC_ROOMBOARD_REALTIME_URL=http://localhost:4001 npm run dev
```

When that variable is set, Roomboard loads the room snapshot once from Next, receives a short-lived realtime access token, then uses Phoenix Channels for presence plus live board events such as item creation, movement, comments, connections, and room close notifications. If the variable is absent outside production, it falls back to the built-in Next SSE routes.

If the Phoenix sidecar cannot join or loses its socket during local development, the browser degrades to the same local SSE and BroadcastChannel fallback so room edits still flow through the persisted Next APIs. Production disables the server SSE fallback by default so hosted rooms do not hold Vercel Functions open; set `ROOMBOARD_ALLOW_SERVER_REALTIME_FALLBACK=true` and `NEXT_PUBLIC_ROOMBOARD_ALLOW_SERVER_FALLBACK=true` only for an intentional emergency override or a small beta while the signed Phoenix secret is being rolled out. Hosted Phoenix requires the same `ROOMBOARD_REALTIME_SECRET` as the Next app; without it, hosted browsers either use the explicit server fallback or avoid joining Phoenix.

## Persistence

Roomboard uses a document store for room state. Without Supabase env vars, local development persists rooms to `.roomboard-data/rooms.json`.

For a Vercel + Supabase showcase deploy, run `supabase/roomboard-schema.sql`, then set:

```bash
SUPABASE_URL=...
SUPABASE_SERVICE_ROLE_KEY=...
```

Optional:

```bash
ROOMBOARD_SUPABASE_TABLE=roomboard_rooms
ROOMBOARD_UPLOAD_BUCKET=roomboard-uploads
ROOMBOARD_REALTIME_SECRET=shared-random-secret
NEXT_PUBLIC_SUPABASE_URL=...
NEXT_PUBLIC_SUPABASE_ANON_KEY=...
NEXT_PUBLIC_GITHUB_URL=https://github.com/your-org/your-repo
```

Image uploads go through `/api/uploads` after editor access is checked. JPEG, PNG, GIF, and WebP are supported; SVG uploads are rejected. With Supabase configured, files are written to the `roomboard-uploads` Storage bucket and cards store asset URLs. Without Supabase env vars, local development falls back to data URLs.

## Auth, RLS, and Stripe subscriptions

The landing page includes a SaaS demo panel at `/#billing`:

- Supabase Auth sign-in/sign-up through the browser client.
- RLS-backed `roomboard_profiles` upserts and `billing_subscriptions` reads.
- Stripe Checkout Sessions with `mode: "subscription"` and annual Price IDs.
- Stripe Customer Portal session creation for subscription management.
- Stripe webhook ingestion at `/api/billing/webhook` for `checkout.session.completed`, `customer.subscription.created`, `customer.subscription.updated`, and `customer.subscription.deleted`.

Run `supabase/roomboard-schema.sql` before enabling Auth in a hosted Supabase project. It creates the profile/subscription tables, indexes, and RLS policies.

Stripe can run in demo mode with no keys: `/api/billing/checkout` returns a local success URL so the UI remains clickable. To use real Stripe test data, create annual recurring Prices in Stripe and set:

```bash
STRIPE_SECRET_KEY=sk_test_...
STRIPE_WEBHOOK_SECRET=whsec_...
STRIPE_TEAM_ANNUAL_PRICE_ID=price_...
STRIPE_STUDIO_ANNUAL_PRICE_ID=price_...
NEXT_PUBLIC_APP_URL=http://localhost:3050
```

For local webhook testing:

```bash
stripe listen --forward-to localhost:3050/api/billing/webhook
```

## Showcase deploy

Use Vercel for the Next app and a small Elixir web service for Phoenix Channels.

1. Create the Supabase project and run `supabase/roomboard-schema.sql`.
2. Deploy the Phoenix sidecar from `render.yaml`, or create an Elixir web service rooted at `realtime/roomboard_realtime`.
3. Set these Vercel env vars:

```bash
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
ROOMBOARD_SUPABASE_TABLE=roomboard_rooms
ROOMBOARD_UPLOAD_BUCKET=roomboard-uploads
ROOMBOARD_REALTIME_SECRET=same-random-secret-as-phoenix
NEXT_PUBLIC_ROOMBOARD_REALTIME_URL=https://your-phoenix-service.example.com
```

4. Set these Phoenix service env vars:

```bash
PHX_SERVER=true
PHX_HOST=your-phoenix-service.onrender.com
SECRET_KEY_BASE=generated-by-render-or-mix-phx-gen-secret
ROOMBOARD_ALLOWED_ORIGINS=https://your-next-app.vercel.app,https://roomboard.online
ROOMBOARD_REALTIME_SECRET=same-random-secret-as-next
```

The sidecar exposes `GET /health` for host health checks. The browser connects to Phoenix at `${NEXT_PUBLIC_ROOMBOARD_REALTIME_URL}/socket` with a signed room token from Next, while Next remains responsible for room snapshots, owner controls, persistence, and uploads.

## Technical walkthrough for employers

Roomboard is intentionally split across a few focused systems so each part of the stack has a clear job in the realtime collaboration flow.

### Next.js App Router

Next.js owns the product shell and HTTP boundary. The App Router renders the dashboard and room routes, including `/rooms/[roomId]`, so every board has a shareable URL. It also exposes the API routes for room creation, room snapshots, owner-only controls, signed realtime access tokens, uploads, and the local realtime fallback used during zero-config development.

In the hosted path, Next remains the source of truth for persisted room documents: the browser loads the room snapshot through Next, sends durable mutations through Next APIs where needed, and lets the realtime layer handle low-latency fanout. This keeps the user-facing app deployable as a standard Vercel project while avoiding a custom backend for the whole product surface.

### Pixi.js canvas

Pixi.js owns the interactive board surface inside the room. It renders draggable note cards, image cards, connectors, selection states, and canvas interactions where DOM-only rendering would become expensive or visually jumpy. The goal is not to build a generic whiteboard; Pixi is used specifically for fast visual review interactions such as placing material, moving cards, and keeping relationships readable while the room updates live.

The canvas is client-only because it depends on browser rendering and pointer interaction. Next provides the route and data boundary; Pixi turns the room document into a responsive editing surface.

### Phoenix and Elixir realtime

The Phoenix sidecar owns realtime collaboration when it is configured. Browsers connect to Phoenix Channels at the sidecar socket endpoint, join a room topic with a signed room token, and receive board events for item creation, movement, comments, connections, presence, and room close notifications.

Elixir is used here for the part of the product that benefits from the BEAM: supervised socket processes, cheap fanout, and Phoenix Presence for live collaborator state. If the sidecar is unavailable in local development, the app degrades to the built-in Next Server-Sent Events and BroadcastChannel fallback so the room can still be tested without running the Elixir service.

### Supabase persistence and storage

Supabase is the hosted persistence layer. Room documents are stored in the configured `roomboard_rooms` table, while uploaded image assets are written to the `roomboard-uploads` Storage bucket after the Next upload route verifies editor access. Cards then reference asset URLs instead of embedding large files directly in the room document.

Local development keeps the same product shape without requiring cloud setup: rooms persist to `.roomboard-data/rooms.json`, and image uploads fall back to data URLs when Supabase env vars are absent. That makes the demo easy to run locally while keeping a credible path for a hosted showcase.

### Vercel and hosted showcase

Vercel hosts the Next.js app: landing/dashboard UI, room routes, API routes, uploads, and persisted room snapshots. The Phoenix sidecar runs as a small separate Elixir web service, and Supabase provides durable data and file storage. The public showcase wires those pieces together with `NEXT_PUBLIC_ROOMBOARD_REALTIME_URL`, `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, and the room/upload configuration vars documented above.

The result is a small but realistic SaaS-shaped architecture: Vercel serves the user-facing application, Phoenix handles live collaboration, Supabase stores rooms and assets, and the Pixi canvas delivers the interaction model that makes the product feel like a visual workspace rather than a form-driven CRUD app.

## Why this shape

Pixi is the canvas renderer: it keeps drag/pan/zoom interactions fast while Next App Router handles the application shell and realtime route handlers.

Rooms use a persisted document model: local JSON for zero-config development, or Supabase for a hosted showcase. The SaaS demo layer adds Supabase Auth, RLS-owned account state, and Stripe annual subscriptions without changing the canvas collaboration model.

Elixir owns the realtime collaboration layer that benefits from the BEAM: socket fanout, process supervision, Phoenix Presence, and low-latency board mutation broadcasts. Next owns the app shell, room APIs, and persisted room documents.
