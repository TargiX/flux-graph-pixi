import { Socket } from "phoenix";
import type { RoomComment, RoomConnection, RoomItem, RoomSummary } from "@/lib/canvasRoom";
import type { PresenceSnapshot } from "@/lib/presence";

type RealtimeUser = {
  id: string;
  name: string;
  color: string;
};

type PresenceState = Record<string, { metas?: PresenceSnapshot[] }>;

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
  sentAt: number;
};

type RoomboardRealtimeOptions = {
  endpoint: string;
  onBoardEvent: (event: RoomboardBoardEventPayload) => void;
  onPresenceState: (presence: PresenceSnapshot[]) => void;
  onPresenceUpdate: (presence: PresenceSnapshot) => void;
  roomId: string;
  user: RealtimeUser;
};

export type RoomboardRealtimeSession = {
  disconnect: () => void;
  sendRoomEvent: (event: RoomboardBoardEventInput) => void;
  updatePresence: (presence: Pick<PresenceSnapshot, "focus" | "x" | "y">) => void;
};

function normalizeEndpoint(endpoint: string) {
  return `${endpoint.replace(/\/$/, "")}/socket`;
}

function presenceStateToSnapshots(state: PresenceState) {
  return Object.values(state)
    .flatMap((entry) => entry.metas ?? [])
    .filter((presence): presence is PresenceSnapshot => Boolean(presence?.id));
}

export function createRoomboardRealtimeSession({
  endpoint,
  onBoardEvent,
  onPresenceState,
  onPresenceUpdate,
  roomId,
  user,
}: RoomboardRealtimeOptions): RoomboardRealtimeSession {
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
  let joined = false;

  socket.connect();

  channel.on("presence_state", (payload: PresenceState) => {
    onPresenceState(presenceStateToSnapshots(payload));
  });
  channel.on("presence:update", (payload: PresenceSnapshot) => {
    onPresenceUpdate(payload);
  });
  channel.on("room:event", (payload: RoomboardBoardEventPayload) => {
    onBoardEvent(payload);
  });

  channel
    .join()
    .receive("ok", () => {
      joined = true;
      while (pendingRoomEvents.length > 0) {
        channel.push("room:event", pendingRoomEvents.shift()!);
      }
    })
    .receive("error", (response: unknown) => {
      console.warn("Phoenix room channel rejected join", response);
    })
    .receive("timeout", () => {
      console.warn("Phoenix room channel join timed out");
    });

  return {
    disconnect() {
      channel.leave();
      socket.disconnect();
    },
    sendRoomEvent(event) {
      if (joined && channel.state === "joined") {
        channel.push("room:event", event);
      } else {
        pendingRoomEvents.push(event);
      }
    },
    updatePresence(presence) {
      if (channel.state === "joined") {
        channel.push("presence:update", presence);
      }
    },
  };
}
