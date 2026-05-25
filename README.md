# Roomboard

A realtime collaborative room board built with Next.js App Router and Pixi.js.

The useful thing is simple: create a room, share the room URL, collaborate on one visual board, then lock or close the room when the work is done. Rooms are link-join by default, while the creator gets a local owner token for room controls. People can add sticky notes, drop image references, drag cards around, connect related items, edit notes, and leave comments. Open the same room in two tabs and the board updates live.

## What is implemented

- Next.js App Router dashboard for creating and opening shared rooms.
- Room-specific routes at `/rooms/[roomId]` so each collaboration space has its own invite URL.
- Link-access rooms by default, with creator-only lock/unlock and close controls.
- Client-only Pixi.js v8 canvas with draggable notes and image cards.
- Realtime board updates through Phoenix Channels when the sidecar is configured, with Next Server-Sent Events as the local fallback.
- Selected-item inspector with note editing, image previews, and comments.
- Link creation between cards for lightweight mapping and visual review.
- Realtime local collaboration through Phoenix Presence when the sidecar is configured, with `/api/rooms/[roomId]/presence` as the local fallback.
- Elixir/Phoenix sidecar in `realtime/roomboard_realtime/` for collaborator presence and board mutation fanout.

## Run

```bash
npm install
npm run dev
```

Then open `http://localhost:3000`.

Create a room from the dashboard, then open that room URL in two tabs. Add a note or image in one tab and watch it appear in the other.

## Useful commands

```bash
npm run typecheck
npm run build
npm run smoke
```

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

When that variable is set, Roomboard loads the room snapshot once from Next, then uses Phoenix Channels for presence plus live board events such as item creation, movement, comments, connections, and room close notifications. If the variable is absent, it falls back to the built-in Next SSE routes.

If the Phoenix sidecar cannot join or loses its socket, the browser degrades to the same local SSE and BroadcastChannel fallback so room edits still flow through the persisted Next APIs.

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
```

Image uploads go through `/api/uploads`. With Supabase configured, files are written to the `roomboard-uploads` Storage bucket and cards store public asset URLs. Without Supabase env vars, local development falls back to data URLs.

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
NEXT_PUBLIC_ROOMBOARD_REALTIME_URL=https://your-phoenix-service.example.com
```

4. Set these Phoenix service env vars:

```bash
PHX_SERVER=true
PHX_HOST=your-phoenix-service.onrender.com
SECRET_KEY_BASE=generated-by-render-or-mix-phx-gen-secret
ROOMBOARD_ALLOWED_ORIGINS=https://your-next-app.vercel.app,https://roomboard.online
```

The sidecar exposes `GET /health` for host health checks. The browser connects to Phoenix at `${NEXT_PUBLIC_ROOMBOARD_REALTIME_URL}/socket`, while Next remains responsible for room snapshots, owner controls, persistence, and uploads.

## Why this shape

Pixi is the canvas renderer: it keeps drag/pan/zoom interactions fast while Next App Router handles the application shell and realtime route handlers.

Rooms use a persisted document model: local JSON for zero-config development, or Supabase for a hosted showcase. The next realistic SaaS step would be auth, organizations, and storage-backed file uploads.

Elixir owns the realtime collaboration layer that benefits from the BEAM: socket fanout, process supervision, Phoenix Presence, and low-latency board mutation broadcasts. Next owns the app shell, room APIs, and persisted room documents.
