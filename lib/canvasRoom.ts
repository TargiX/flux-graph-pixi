export type RoomItemType = "image" | "note";

export type RoomComment = {
  id: string;
  author: string;
  body: string;
  color: string;
  createdAt: number;
};

export type RoomItem = {
  id: string;
  type: RoomItemType;
  title: string;
  body: string;
  imageUrl?: string;
  author: string;
  color: string;
  x: number;
  y: number;
  width: number;
  height: number;
  createdAt: number;
  updatedAt: number;
  comments: RoomComment[];
};

export type RoomConnection = {
  id: string;
  from: string;
  to: string;
  color?: string;
};

export type RoomAccess = "link" | "locked";

export type RoomSummary = {
  id: string;
  name: string;
  access: RoomAccess;
  createdAt: number;
  updatedAt: number;
  itemCount: number;
  connectionCount: number;
};

export type RoomSnapshot = {
  room: RoomSummary;
  items: RoomItem[];
  connections: RoomConnection[];
};

type RoomClient = {
  id: string;
  controller: ReadableStreamDefaultController<Uint8Array>;
};

type RoomState = {
  id: string;
  name: string;
  access: RoomAccess;
  ownerToken: string;
  createdAt: number;
  updatedAt: number;
  items: Map<string, RoomItem>;
  connections: Map<string, RoomConnection>;
  clients: Set<RoomClient>;
};

export const DEFAULT_ROOM_ID = "pitch-deck-review";
const DEFAULT_ROOM_OWNER_TOKEN = "demo-owner";

const encoder = new TextEncoder();
const globalForRooms = globalThis as unknown as {
  rooms?: Map<string, RoomState>;
  closedRoomIds?: Set<string>;
};

const rooms = globalForRooms.rooms ?? new Map<string, RoomState>();
const closedRoomIds = globalForRooms.closedRoomIds ?? new Set<string>();

if (process.env.NODE_ENV !== "production") {
  globalForRooms.rooms = rooms;
  globalForRooms.closedRoomIds = closedRoomIds;
}

function encode(event: string, payload: unknown) {
  return encoder.encode(`event: ${event}\ndata: ${JSON.stringify(payload)}\n\n`);
}

function slugifyRoomId(name: string) {
  const slug = name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 42);

  return `${slug || "room"}-${crypto.randomUUID().slice(0, 8)}`;
}

function createSeedItems(createdAt = Date.now()): RoomItem[] {
  return [
    {
      id: "note-kickoff",
      type: "note",
      title: "Homepage direction",
      body: "Keep the first screen focused on the actual collaborative object. No marketing hero, no fake case-study maze.",
      author: "Mira",
      color: "#facc5c",
      x: -260,
      y: -120,
      width: 236,
      height: 156,
      createdAt: createdAt - 5000,
      updatedAt: createdAt - 5000,
      comments: [
        {
          id: "comment-1",
          author: "Ilya",
          body: "This should feel like a tool people can use immediately.",
          color: "#62d681",
          createdAt: createdAt - 3000,
        },
      ],
    },
    {
      id: "image-reference",
      type: "image",
      title: "Reference mood",
      body: "Drop visual references here. The board keeps the image and discussion together.",
      imageUrl: "https://images.unsplash.com/photo-1557682250-33bd709cbe85?auto=format&fit=crop&w=900&q=80",
      author: "Nora",
      color: "#48a7ff",
      x: 30,
      y: -90,
      width: 268,
      height: 188,
      createdAt: createdAt - 4200,
      updatedAt: createdAt - 4200,
      comments: [],
    },
    {
      id: "note-questions",
      type: "note",
      title: "Open questions",
      body: "What needs to be true before this could replace a messy design review thread?",
      author: "Kai",
      color: "#ef6f5e",
      x: 350,
      y: 140,
      width: 244,
      height: 150,
      createdAt: createdAt - 3600,
      updatedAt: createdAt - 3600,
      comments: [],
    },
  ];
}

function createSeedConnections(): RoomConnection[] {
  return [
    {
      id: "conn-1",
      from: "note-kickoff",
      to: "image-reference",
      color: "#facc5c",
    },
    {
      id: "conn-2",
      from: "image-reference",
      to: "note-questions",
      color: "#48a7ff",
    },
  ];
}

function createRoomState(id: string, name: string, seeded = false, ownerToken = crypto.randomUUID()): RoomState {
  const createdAt = Date.now();
  const seedItems = seeded ? createSeedItems(createdAt) : [];
  const seedConnections = seeded ? createSeedConnections() : [];

  return {
    id,
    name,
    access: "link",
    ownerToken,
    createdAt,
    updatedAt: createdAt,
    items: new Map(seedItems.map((item) => [item.id, item])),
    connections: new Map(seedConnections.map((connection) => [connection.id, connection])),
    clients: new Set(),
  };
}

function ensureDefaultRoom() {
  if (!rooms.has(DEFAULT_ROOM_ID) && !closedRoomIds.has(DEFAULT_ROOM_ID)) {
    rooms.set(DEFAULT_ROOM_ID, createRoomState(DEFAULT_ROOM_ID, "Pitch Deck Review", true, DEFAULT_ROOM_OWNER_TOKEN));
  }
}

export function getExistingRoom(roomId = DEFAULT_ROOM_ID) {
  ensureDefaultRoom();
  return rooms.get(roomId) ?? null;
}

export function getRoom(roomId = DEFAULT_ROOM_ID) {
  ensureDefaultRoom();
  const room = rooms.get(roomId);

  if (!room) {
    throw new Error(`Room "${roomId}" not found.`);
  }

  return room;
}

export function createRoom(name: string) {
  ensureDefaultRoom();
  const room = createRoomState(slugifyRoomId(name), name.trim().slice(0, 80) || "Untitled room", false);
  closedRoomIds.delete(room.id);
  rooms.set(room.id, room);
  return {
    ownerToken: room.ownerToken,
    room: getRoomSummary(room.id)!,
  };
}

export function listRooms() {
  ensureDefaultRoom();

  return Array.from(rooms.values())
    .map((room) => ({
      id: room.id,
      name: room.name,
      access: room.access,
      createdAt: room.createdAt,
      updatedAt: room.updatedAt,
      itemCount: room.items.size,
      connectionCount: room.connections.size,
    }))
    .sort((a, b) => b.updatedAt - a.updatedAt);
}

export function getRoomSummary(roomId = DEFAULT_ROOM_ID): RoomSummary | null {
  const room = getExistingRoom(roomId);

  if (!room) {
    return null;
  }

  return {
    id: room.id,
    name: room.name,
    access: room.access,
    createdAt: room.createdAt,
    updatedAt: room.updatedAt,
    itemCount: room.items.size,
    connectionCount: room.connections.size,
  };
}

export function listRoomItems(roomId = DEFAULT_ROOM_ID) {
  return Array.from(getRoom(roomId).items.values()).sort((a, b) => a.createdAt - b.createdAt);
}

export function listRoomConnections(roomId = DEFAULT_ROOM_ID) {
  return Array.from(getRoom(roomId).connections.values());
}

export function getRoomSnapshot(roomId = DEFAULT_ROOM_ID): RoomSnapshot | null {
  const room = getRoomSummary(roomId);

  if (!room) {
    return null;
  }

  return {
    room,
    items: listRoomItems(roomId),
    connections: listRoomConnections(roomId),
  };
}

export function publishRoomSnapshot(roomId = DEFAULT_ROOM_ID) {
  const room = getRoom(roomId);
  const snapshot = getRoomSnapshot(roomId);

  if (!snapshot) {
    return;
  }

  const message = encode("room", snapshot);

  for (const client of room.clients) {
    try {
      client.controller.enqueue(message);
    } catch {
      room.clients.delete(client);
    }
  }
}

export function isRoomOwner(roomId = DEFAULT_ROOM_ID, ownerToken?: string | null) {
  const room = getExistingRoom(roomId);
  return Boolean(room && ownerToken && room.ownerToken === ownerToken);
}

export function canAccessRoom(roomId = DEFAULT_ROOM_ID, ownerToken?: string | null) {
  const room = getExistingRoom(roomId);

  if (!room) {
    return false;
  }

  return room.access === "link" || isRoomOwner(roomId, ownerToken);
}

export function setRoomAccess(roomId: string, access: RoomAccess, ownerToken?: string | null) {
  const room = getExistingRoom(roomId);

  if (!room || !isRoomOwner(roomId, ownerToken)) {
    return null;
  }

  room.access = access;
  room.updatedAt = Date.now();
  publishRoomSnapshot(roomId);
  return getRoomSummary(roomId);
}

export function closeRoom(roomId = DEFAULT_ROOM_ID, ownerToken?: string | null) {
  ensureDefaultRoom();
  const room = rooms.get(roomId);

  if (!room || !isRoomOwner(roomId, ownerToken)) {
    return null;
  }

  const summary = getRoomSummary(roomId);
  const message = encode("closed", { room: summary });
  closedRoomIds.add(roomId);
  rooms.delete(roomId);

  for (const client of room.clients) {
    try {
      client.controller.enqueue(message);
      client.controller.close();
    } catch {
      // The browser may already have dropped the SSE connection.
    }
  }

  return summary;
}

export function createRoomItem(
  input: {
    type: RoomItemType;
    title: string;
    body?: string;
    imageUrl?: string;
    author: string;
    color: string;
    x?: number;
    y?: number;
  },
  roomId = DEFAULT_ROOM_ID,
) {
  const room = getRoom(roomId);
  const itemCount = room.items.size;
  const item: RoomItem = {
    id: crypto.randomUUID(),
    type: input.type,
    title: input.title.trim().slice(0, 72) || (input.type === "image" ? "Image" : "Note"),
    body: (input.body ?? "").trim().slice(0, 420),
    imageUrl: input.imageUrl?.trim().slice(0, 2400),
    author: input.author.trim().slice(0, 24) || "Visitor",
    color: input.color,
    x: input.x ?? -120 + (itemCount % 5) * 74,
    y: input.y ?? -40 + (itemCount % 4) * 58,
    width: input.type === "image" ? 268 : 236,
    height: input.type === "image" ? 188 : 156,
    createdAt: Date.now(),
    updatedAt: Date.now(),
    comments: [],
  };

  room.items.set(item.id, item);
  room.updatedAt = Date.now();
  publishRoomSnapshot(roomId);
  return item;
}

export function updateRoomItem(
  input: {
    id: string;
    title?: string;
    body?: string;
    imageUrl?: string;
    x?: number;
    y?: number;
    color?: string;
  },
  roomId = DEFAULT_ROOM_ID,
) {
  const room = getRoom(roomId);
  const item = room.items.get(input.id);

  if (!item) {
    return null;
  }

  if (input.title !== undefined) {
    item.title = input.title.trim().slice(0, 72) || item.title;
  }

  if (input.body !== undefined) {
    item.body = input.body.trim().slice(0, 420);
  }

  if (input.imageUrl !== undefined) {
    item.imageUrl = input.imageUrl.trim().slice(0, 2400);
  }

  if (input.color !== undefined) {
    item.color = input.color;
  }

  if (Number.isFinite(input.x)) {
    item.x = Math.round(input.x as number);
  }

  if (Number.isFinite(input.y)) {
    item.y = Math.round(input.y as number);
  }

  item.updatedAt = Date.now();
  room.updatedAt = Date.now();
  publishRoomSnapshot(roomId);
  return item;
}

export function addRoomComment(
  input: {
    itemId: string;
    author: string;
    body: string;
    color: string;
  },
  roomId = DEFAULT_ROOM_ID,
) {
  const room = getRoom(roomId);
  const item = room.items.get(input.itemId);

  if (!item) {
    return null;
  }

  const comment: RoomComment = {
    id: crypto.randomUUID(),
    author: input.author.trim().slice(0, 24) || "Visitor",
    body: input.body.trim().slice(0, 320),
    color: input.color,
    createdAt: Date.now(),
  };

  item.comments.push(comment);
  item.updatedAt = Date.now();
  room.updatedAt = Date.now();
  publishRoomSnapshot(roomId);
  return comment;
}

export function createRoomConnection(from: string, to: string, color?: string, roomId = DEFAULT_ROOM_ID) {
  const room = getRoom(roomId);

  for (const c of room.connections.values()) {
    if (c.from === from && c.to === to) {
      return c;
    }
  }

  const connection: RoomConnection = {
    id: crypto.randomUUID(),
    from,
    to,
    color: color || "#48a7ff",
  };

  room.connections.set(connection.id, connection);
  room.updatedAt = Date.now();
  publishRoomSnapshot(roomId);
  return connection;
}

export function deleteRoomConnection(id: string, roomId = DEFAULT_ROOM_ID) {
  const room = getRoom(roomId);
  const deleted = room.connections.delete(id);

  if (deleted) {
    room.updatedAt = Date.now();
    publishRoomSnapshot(roomId);
  }

  return deleted;
}

export function deleteRoomItem(id: string, roomId = DEFAULT_ROOM_ID) {
  const room = getRoom(roomId);
  const deleted = room.items.delete(id);

  if (deleted) {
    for (const [connId, conn] of room.connections.entries()) {
      if (conn.from === id || conn.to === id) {
        room.connections.delete(connId);
      }
    }

    room.updatedAt = Date.now();
    publishRoomSnapshot(roomId);
  }

  return deleted;
}

export function createRoomStream(roomId = DEFAULT_ROOM_ID) {
  const room = getRoom(roomId);
  const id = crypto.randomUUID();
  let interval: ReturnType<typeof setInterval>;

  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      const client = { id, controller };
      room.clients.add(client);
      const snapshot = getRoomSnapshot(roomId);
      if (snapshot) {
        controller.enqueue(encode("room", snapshot));
      }
      interval = setInterval(() => {
        controller.enqueue(encode("ping", { now: Date.now() }));
      }, 5000);
    },
    cancel() {
      clearInterval(interval);

      for (const client of room.clients) {
        if (client.id === id) {
          room.clients.delete(client);
        }
      }
    },
  });

  return stream;
}
