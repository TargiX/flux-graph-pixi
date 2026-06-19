import { Socket } from "phoenix";
import type { RoomComment, RoomConnection, RoomItem, RoomSummary } from "@/lib/canvasRoom";
import type { PresenceSnapshot } from "@/lib/presence";
import {
  normalizeEndpoint,
  presenceStateToSnapshots,
  type PresenceState,
} from "./realtimeHelpers";

type RealtimeUser = {
  id: string;
  name: string;
  color: string;
};

export type RoomboardRealtimeStatus = "connecting" | "connected" | "degraded" | "closed";

export type RoomboardBoardEvent =
  | {
      type: "item:created" | "item:updated" | "item:moved";
      item: RoomItem;
    }
  | {
      type: "item:deleted";
      itemId: string;
    }
  | {
      type: "comment:created";
      comment: RoomComment;
      itemId: string;
    }
  | {
      type: "connection:created";
      connection: RoomConnection;
    }
  | {
      type: "connection:deleted";
      connectionId: string;
    }
  | {
      type: "room:updated";
      room: RoomSummary;
    }
  | {
      type: "room:closed";
      room?: RoomSummary;
    };

export type RoomboardBoardEventInput = RoomboardBoardEvent & {
  clientId?: string;
};

type RoomboardBoardEventPayload = RoomboardBoardEventInput & {
  roomId: string;
  senderId?: string;
  sentAt: number;
};

type RoomboardRealtimeOptions = {
  endpoint: string;
  onBoardEvent: (event: RoomboardBoardEventPayload) => void;
  onPresenceState: (presence: PresenceSnapshot[]) => void;
  onPresenceUpdate: (presence: PresenceSnapshot) => void;
  onStatusChange?: (status: RoomboardRealtimeStatus) => void;
  roomId: string;
  user: RealtimeUser;
};

export type RoomboardRealtimeSession = {
  disconnect: () => void;
  sendRoomEvent: (event: RoomboardBoardEventInput) => void;
  updatePresence: (presence: Pick<PresenceSnapshot, "focus" | "x" | "y">) => void;
};

export function createRoomboardRealtimeSession({
  endpoint,
  onBoardEvent,
  onPresenceState,
  onPresenceUpdate,
  onStatusChange,
  roomId,
  user,
}: RoomboardRealtimeOptions): RoomboardRealtimeSession {
  const sessionId = crypto.randomUUID();
  const socket = new Socket(normalizeEndpoint(endpoint), {
    params: {
      color: user.color,
      id: user.id,
      name: user.name,
    },
  });
  const channel = socket.channel(`room:${roomId}`, {
    focus: "canvas",
    x: 0,
    y: 0,
  });
  const pendingRoomEvents: RoomboardBoardEventInput[] = [];
  const maxPendingRoomEvents = 50;
  let status: RoomboardRealtimeStatus = "connecting";
  let manuallyClosed = false;
  let joined = false;

  const setStatus = (nextStatus: RoomboardRealtimeStatus) => {
    if (status === nextStatus) {
      return;
    }

    status = nextStatus;
    onStatusChange?.(nextStatus);
  };

  const degrade = () => {
    if (status === "closed") {
      return;
    }

    joined = false;
    pendingRoomEvents.length = 0;
    setStatus("degraded");
  };

  socket.onError(() => {
    if (!manuallyClosed) {
      degrade();
    }
  });
  socket.onClose(() => {
    if (!manuallyClosed) {
      degrade();
    }
  });
  channel.onError(() => {
    if (!manuallyClosed) {
      degrade();
    }
  });
  channel.onClose(() => {
    if (!manuallyClosed) {
      degrade();
    }
  });

  channel.on("presence_state", (payload: PresenceState) => {
    onPresenceState(presenceStateToSnapshots(payload));
  });
  channel.on("presence:update", (payload: PresenceSnapshot) => {
    onPresenceUpdate(payload);
  });
  channel.on("room:event", (payload: RoomboardBoardEventPayload) => {
    if (payload.clientId === sessionId) return;
    onBoardEvent(payload);
  });

  socket.connect();
  onStatusChange?.(status);

  channel
    .join()
    .receive("ok", () => {
      if (status === "degraded" || status === "closed") {
        return;
      }

      joined = true;
      setStatus("connected");
      while (pendingRoomEvents.length > 0) {
        channel.push("room:event", pendingRoomEvents.shift()!);
      }
    })
    .receive("error", (response: unknown) => {
      console.warn("Phoenix room channel rejected join", response);
      degrade();
    })
    .receive("timeout", () => {
      console.warn("Phoenix room channel join timed out");
      degrade();
    });

  return {
    disconnect() {
      manuallyClosed = true;
      joined = false;
      pendingRoomEvents.length = 0;
      setStatus("closed");
      channel.leave();
      socket.disconnect();
    },
    sendRoomEvent(event) {
      const stamped = { ...event, clientId: sessionId };
      if (joined && channel.state === "joined") {
        channel.push("room:event", stamped);
      } else if (status === "connecting" && pendingRoomEvents.length < maxPendingRoomEvents) {
        pendingRoomEvents.push(stamped);
      }
    },
    updatePresence(presence) {
      if (status === "connected" && channel.state === "joined") {
        channel.push("presence:update", presence);
      }
    },
  };
}
