# Roomboard

A realtime collaborative room board built with Next.js App Router and Pixi.js.

The useful thing is simple: create a room, share the room URL, collaborate on one visual board, then lock or close the room when the work is done. Rooms are link-join by default, while the creator gets a local owner token for room controls. People can add sticky notes, drop image references, drag cards around, connect related items, edit notes, and leave comments. Open the same room in two tabs and the board updates live.

## What is implemented

- Next.js App Router dashboard for creating and opening shared rooms.
- Room-specific routes at `/rooms/[roomId]` so each collaboration space has its own invite URL.
- Link-access rooms by default, with creator-only lock/unlock and close controls.
- Client-only Pixi.js v8 canvas with draggable notes and image cards.
- Realtime board updates through `/api/rooms/[roomId]` using Server-Sent Events and route handlers.
- Selected-item inspector with note editing, image previews, and comments.
- Link creation between cards for lightweight mapping and visual review.
- Realtime local collaboration through `/api/rooms/[roomId]/presence` using Server-Sent Events and route handlers.
- Optional Elixir/Phoenix Presence sidecar in `realtime/roomboard_realtime/` for production-grade collaborator presence.

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

Run Phoenix Presence in a second terminal:

```bash
cd realtime/roomboard_realtime
mix setup
PORT=4001 mix phx.server
```

Run the Next app with the sidecar URL available to the browser:

```bash
NEXT_PUBLIC_ROOMBOARD_REALTIME_URL=http://localhost:4001 npm run dev
```

When that variable is set, Roomboard uses Phoenix Channels for collaborator presence. If the variable is absent, it falls back to the built-in Next SSE presence route.

## Why this shape

Pixi is the canvas renderer: it keeps drag/pan/zoom interactions fast while Next App Router handles the application shell and realtime route handlers.

Rooms are in-memory for the prototype, which keeps the portfolio demo easy to run locally. The next realistic SaaS step would be persistence, auth, and organization/member invites.

Elixir owns the realtime collaboration layer that benefits from the BEAM: socket fanout, process supervision, and Phoenix Presence. Next still owns the app shell and current in-memory room state while the transport boundary is being moved over.
