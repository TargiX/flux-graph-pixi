# RoomboardRealtime

Phoenix Channels sidecar for Roomboard collaborator presence.

## Run

```bash
mix setup
PORT=4001 mix phx.server
```

Point the Next app at it:

```bash
NEXT_PUBLIC_ROOMBOARD_REALTIME_URL=http://localhost:4001 npm run dev
```

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
- `room:event`: generic room event fanout reserved for moving board mutations into Phoenix.

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

## Checks

```bash
mix test
mix precommit
```
