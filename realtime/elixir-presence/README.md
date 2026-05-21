# Elixir Presence Sidecar

This folder documents the intended Phoenix upgrade path for Roomboard's realtime layer.

Elixir and Mix are not installed on this machine right now, so the checked-in app uses `app/api/presence/route.ts` and `app/api/room/route.ts` for working local Server-Sent Events transports. When Elixir is available, replace those transports with Phoenix Channels and Presence.

## Contract

The Pixi renderer only needs a stream of snapshots:

```json
{
  "id": "browser-session-id",
  "name": "Guest 184",
  "color": "#48a7ff",
  "focus": "Homepage direction",
  "x": 624,
  "y": 320,
  "updatedAt": 1789876543210
}
```

## Phoenix shape

1. Create a Phoenix app in this folder once Elixir is installed.
2. Add a `RoomChannel` at `room:lobby`.
3. Track each socket with `Phoenix.Presence.track/4` using the payload above.
4. Broadcast `presence_state` on join and `presence_diff` on cursor/focus updates.
5. In the Next app, swap the SSE `EventSource` inside `components/CanvasRoom.tsx` for a Phoenix socket client.

The important boundary: Pixi should not know whether updates came from SSE, WebSocket, or Phoenix. It should only receive `PresenceSnapshot[]`.
