import { Socket } from "phoenix";
import type { PresenceSnapshot } from "@/lib/presence";

type RealtimeUser = {
  id: string;
  name: string;
  color: string;
};

type PresenceState = Record<string, { metas?: PresenceSnapshot[] }>;

type RoomboardRealtimeOptions = {
  endpoint: string;
  onPresenceState: (presence: PresenceSnapshot[]) => void;
  onPresenceUpdate: (presence: PresenceSnapshot) => void;
  roomId: string;
  user: RealtimeUser;
};

export type RoomboardRealtimeSession = {
  disconnect: () => void;
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

  socket.connect();

  channel.on("presence_state", (payload: PresenceState) => {
    onPresenceState(presenceStateToSnapshots(payload));
  });
  channel.on("presence:update", (payload: PresenceSnapshot) => {
    onPresenceUpdate(payload);
  });

  channel
    .join()
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
    updatePresence(presence) {
      if (channel.state === "joined") {
        channel.push("presence:update", presence);
      }
    },
  };
}
