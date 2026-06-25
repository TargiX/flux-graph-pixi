# RoomboardRealtime

Phoenix Channels sidecar for Roomboard collaborator presence and live board mutation fanout.

## Run

```bash
mix setup
PORT=4001 mix phx.server
```

Point the Next app at it:

```bash
NEXT_PUBLIC_ROOMBOARD_REALTIME_URL=http://localhost:4001 pnpm dev
```

## Deploy

The service is deployable as a standalone Elixir web process. The root repo includes `render.yaml` for a lightweight showcase deployment.

Required production env:

```bash
MIX_ENV=prod
PHX_SERVER=true
SECRET_KEY_BASE=...
PHX_HOST=your-phoenix-service.example.com
ROOMBOARD_ALLOWED_ORIGINS=https://www.roomboard.online
PORT=4000
```

Health checks can use `GET /health`.

`ROOMBOARD_ALLOWED_ORIGINS` is comma-separated and controls browser WebSocket origins in production. Include preview/custom domains only when you intentionally want those browser origins to join the hosted sidecar. Development and test keep permissive local origins for quick two-tab testing.

## Channel Contract

Connect to `/socket` with params:

- `id`: stable browser-local collaborator id.
- `name`: display name, trimmed to 24 characters.
- `color`: collaborator hex color.

Join topic `room:<roomId>`.

Join payload:

```json
{
  "focus": "canvas",
  "x": 0,
  "y": 0
}
```

Events:

- `presence_state`: initial Phoenix Presence map.
- `presence:update`: client sends and receives collaborator focus/cursor updates.
- `room:event`: client sends and receives board mutations after the Next API confirms them.

Presence payload:

```json
{
  "id": "client-id",
  "name": "Ada",
  "color": "#0ea5e9",
  "focus": "comment:alpha",
  "x": 48,
  "y": 96,
  "updatedAt": 1760000000000,
  "expiresAt": 1760000015000
}
```

Board event types:

- `item:created`, `item:updated`, `item:moved`
- `item:deleted`
- `comment:created`
- `connection:created`, `connection:deleted`
- `room:updated`, `room:closed`

## Checks

```bash
mix test
mix precommit
```
