import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

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

type RoomDocument = {
  id: string;
  name: string;
  access: RoomAccess;
  ownerToken: string;
  createdAt: number;
  updatedAt: number;
  closedAt?: number;
  items: RoomItem[];
  connections: RoomConnection[];
};

type RoomMutation<T> = (room: RoomDocument) => T;

type RoomStore = {
  delete: (roomId: string) => Promise<void>;
  get: (roomId: string) => Promise<RoomDocument | null>;
  list: () => Promise<RoomDocument[]>;
  save: (room: RoomDocument) => Promise<void>;
};

export const DEFAULT_ROOM_ID = "pitch-deck-review";
const DEFAULT_ROOM_OWNER_TOKEN = "demo-owner";
const ROOMBOARD_SUPABASE_TABLE = process.env.ROOMBOARD_SUPABASE_TABLE ?? "roomboard_rooms";

const encoder = new TextEncoder();
const clientsByRoom = new Map<string, Set<RoomClient>>();
const globalForRooms = globalThis as unknown as {
  localRoomDocuments?: Map<string, RoomDocument>;
  roomStore?: RoomStore;
  supabaseRoomClient?: SupabaseClient;
};

function encode(event: string, payload: unknown) {
  return encoder.encode(`event: ${event}\ndata: ${JSON.stringify(payload)}\n\n`);
}

function cloneRoom(room: RoomDocument): RoomDocument {
  return structuredClone(room);
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

function createRoomDocument(id: string, name: string, seeded = false, ownerToken = crypto.randomUUID()): RoomDocument {
  const createdAt = Date.now();

  return {
    id,
    name,
    access: "link",
    ownerToken,
    createdAt,
    updatedAt: createdAt,
    items: seeded ? createSeedItems(createdAt) : [],
    connections: seeded ? createSeedConnections() : [],
  };
}

function getClients(roomId: string) {
  if (!clientsByRoom.has(roomId)) {
    clientsByRoom.set(roomId, new Set());
  }

  return clientsByRoom.get(roomId)!;
}

function localStoreFilePath() {
  return path.join(process.cwd(), ".roomboard-data", "rooms.json");
}

function loadLocalDocuments() {
  if (globalForRooms.localRoomDocuments) {
    return globalForRooms.localRoomDocuments;
  }

  const documents = new Map<string, RoomDocument>();

  try {
    const parsed = JSON.parse(readFileSync(localStoreFilePath(), "utf8")) as RoomDocument[];
    for (const room of parsed) {
      documents.set(room.id, room);
    }
  } catch {
    // First local run: the file will be written after the first mutation.
  }

  globalForRooms.localRoomDocuments = documents;
  return documents;
}

function persistLocalDocuments(documents: Map<string, RoomDocument>) {
  const filePath = localStoreFilePath();
  mkdirSync(path.dirname(filePath), { recursive: true });
  writeFileSync(filePath, JSON.stringify(Array.from(documents.values()), null, 2));
}

function createLocalRoomStore(): RoomStore {
  return {
    async delete(roomId) {
      const documents = loadLocalDocuments();
      documents.delete(roomId);
      persistLocalDocuments(documents);
    },
    async get(roomId) {
      const room = loadLocalDocuments().get(roomId);
      return room ? cloneRoom(room) : null;
    },
    async list() {
      return Array.from(loadLocalDocuments().values()).map(cloneRoom);
    },
    async save(room) {
      const documents = loadLocalDocuments();
      documents.set(room.id, cloneRoom(room));
      persistLocalDocuments(documents);
    },
  };
}

function getSupabaseClient() {
  if (globalForRooms.supabaseRoomClient) {
    return globalForRooms.supabaseRoomClient;
  }

  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.SUPABASE_ANON_KEY;

  if (!url || !key) {
    return null;
  }

  globalForRooms.supabaseRoomClient = createClient(url, key, {
    auth: {
      persistSession: false,
    },
  });
  return globalForRooms.supabaseRoomClient;
}

function createSupabaseRoomStore(client: SupabaseClient): RoomStore {
  return {
    async delete(roomId) {
      await client.from(ROOMBOARD_SUPABASE_TABLE).delete().eq("id", roomId).throwOnError();
    },
    async get(roomId) {
      const { data } = await client
        .from(ROOMBOARD_SUPABASE_TABLE)
        .select("document")
        .eq("id", roomId)
        .maybeSingle()
        .throwOnError();

      return data?.document ? (data.document as RoomDocument) : null;
    },
    async list() {
      const { data } = await client
        .from(ROOMBOARD_SUPABASE_TABLE)
        .select("document")
        .is("closed_at", null)
        .throwOnError();

      return (data ?? []).map((row) => row.document as RoomDocument);
    },
    async save(room) {
      await client
        .from(ROOMBOARD_SUPABASE_TABLE)
        .upsert(
          {
            closed_at: room.closedAt ?? null,
            document: room,
            id: room.id,
            updated_at: new Date(room.updatedAt).toISOString(),
          },
          { onConflict: "id" },
        )
        .throwOnError();
    },
  };
}

function getRoomStore() {
  if (globalForRooms.roomStore) {
    return globalForRooms.roomStore;
  }

  const supabase = getSupabaseClient();
  globalForRooms.roomStore = supabase ? createSupabaseRoomStore(supabase) : createLocalRoomStore();
  return globalForRooms.roomStore;
}

function toRoomSummary(room: RoomDocument): RoomSummary {
  return {
    id: room.id,
    name: room.name,
    access: room.access,
    createdAt: room.createdAt,
    updatedAt: room.updatedAt,
    itemCount: room.items.length,
    connectionCount: room.connections.length,
  };
}

async function ensureDefaultRoom() {
  const store = getRoomStore();
  const existing = await store.get(DEFAULT_ROOM_ID);

  if (!existing) {
    await store.save(createRoomDocument(DEFAULT_ROOM_ID, "Pitch Deck Review", true, DEFAULT_ROOM_OWNER_TOKEN));
  }
}

async function getExistingRoom(roomId = DEFAULT_ROOM_ID) {
  await ensureDefaultRoom();
  const room = await getRoomStore().get(roomId);
  return room && !room.closedAt ? room : null;
}

async function getRoom(roomId = DEFAULT_ROOM_ID) {
  const room = await getExistingRoom(roomId);

  if (!room) {
    throw new Error(`Room "${roomId}" not found.`);
  }

  return room;
}

async function mutateRoom<T>(roomId: string, mutation: RoomMutation<T>) {
  const room = await getRoom(roomId);
  const result = mutation(room);
  room.updatedAt = Date.now();
  await getRoomStore().save(room);
  await publishRoomSnapshot(roomId);
  return result;
}

export async function createRoom(name: string) {
  await ensureDefaultRoom();
  const room = createRoomDocument(slugifyRoomId(name), name.trim().slice(0, 80) || "Untitled room", false);
  await getRoomStore().save(room);

  return {
    ownerToken: room.ownerToken,
    room: toRoomSummary(room),
  };
}

export async function listRooms() {
  await ensureDefaultRoom();

  return (await getRoomStore().list())
    .filter((room) => !room.closedAt)
    .map(toRoomSummary)
    .sort((a, b) => b.updatedAt - a.updatedAt);
}

export async function getRoomSummary(roomId = DEFAULT_ROOM_ID): Promise<RoomSummary | null> {
  const room = await getExistingRoom(roomId);
  return room ? toRoomSummary(room) : null;
}

export async function listRoomItems(roomId = DEFAULT_ROOM_ID) {
  return (await getRoom(roomId)).items.sort((a, b) => a.createdAt - b.createdAt);
}

export async function listRoomConnections(roomId = DEFAULT_ROOM_ID) {
  return (await getRoom(roomId)).connections;
}

export async function getRoomSnapshot(roomId = DEFAULT_ROOM_ID): Promise<RoomSnapshot | null> {
  const room = await getExistingRoom(roomId);

  if (!room) {
    return null;
  }

  return {
    room: toRoomSummary(room),
    items: room.items.sort((a, b) => a.createdAt - b.createdAt),
    connections: room.connections,
  };
}

export async function publishRoomSnapshot(roomId = DEFAULT_ROOM_ID) {
  const snapshot = await getRoomSnapshot(roomId);

  if (!snapshot) {
    return;
  }

  const clients = getClients(roomId);
  const message = encode("room", snapshot);

  for (const client of clients) {
    try {
      client.controller.enqueue(message);
    } catch {
      clients.delete(client);
    }
  }
}

export async function isRoomOwner(roomId = DEFAULT_ROOM_ID, ownerToken?: string | null) {
  const room = await getExistingRoom(roomId);
  return Boolean(room && ownerToken && room.ownerToken === ownerToken);
}

export async function canAccessRoom(roomId = DEFAULT_ROOM_ID, ownerToken?: string | null) {
  const room = await getExistingRoom(roomId);

  if (!room) {
    return false;
  }

  return room.access === "link" || (await isRoomOwner(roomId, ownerToken));
}

export async function setRoomAccess(roomId: string, access: RoomAccess, ownerToken?: string | null) {
  if (!(await isRoomOwner(roomId, ownerToken))) {
    return null;
  }

  return mutateRoom(roomId, (room) => {
    room.access = access;
    return toRoomSummary(room);
  });
}

export async function closeRoom(roomId = DEFAULT_ROOM_ID, ownerToken?: string | null) {
  const room = await getExistingRoom(roomId);

  if (!room || !(await isRoomOwner(roomId, ownerToken))) {
    return null;
  }

  const summary = toRoomSummary(room);
  const message = encode("closed", { room: summary });
  room.closedAt = Date.now();
  room.updatedAt = Date.now();
  await getRoomStore().save(room);

  const clients = getClients(roomId);
  for (const client of clients) {
    try {
      client.controller.enqueue(message);
      client.controller.close();
    } catch {
      // The browser may already have dropped the SSE connection.
    }
  }

  clientsByRoom.delete(roomId);
  return summary;
}

export async function createRoomItem(
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
  return mutateRoom(roomId, (room) => {
    const itemCount = room.items.length;
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

    room.items.push(item);
    return item;
  });
}

export async function updateRoomItem(
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
  return mutateRoom(roomId, (room) => {
    const item = room.items.find((candidate) => candidate.id === input.id);

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
    return item;
  });
}

export async function addRoomComment(
  input: {
    itemId: string;
    author: string;
    body: string;
    color: string;
  },
  roomId = DEFAULT_ROOM_ID,
) {
  return mutateRoom(roomId, (room) => {
    const item = room.items.find((candidate) => candidate.id === input.itemId);

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
    return comment;
  });
}

export async function createRoomConnection(from: string, to: string, color?: string, roomId = DEFAULT_ROOM_ID) {
  return mutateRoom(roomId, (room) => {
    const existing = room.connections.find((connection) => connection.from === from && connection.to === to);

    if (existing) {
      return existing;
    }

    const connection: RoomConnection = {
      id: crypto.randomUUID(),
      from,
      to,
      color: color || "#48a7ff",
    };

    room.connections.push(connection);
    return connection;
  });
}

export async function deleteRoomConnection(id: string, roomId = DEFAULT_ROOM_ID) {
  return mutateRoom(roomId, (room) => {
    const before = room.connections.length;
    room.connections = room.connections.filter((connection) => connection.id !== id);
    return room.connections.length !== before;
  });
}

export async function deleteRoomItem(id: string, roomId = DEFAULT_ROOM_ID) {
  return mutateRoom(roomId, (room) => {
    const before = room.items.length;
    room.items = room.items.filter((item) => item.id !== id);

    if (room.items.length === before) {
      return false;
    }

    room.connections = room.connections.filter((connection) => connection.from !== id && connection.to !== id);
    return true;
  });
}

export function createRoomStream(roomId = DEFAULT_ROOM_ID) {
  const clients = getClients(roomId);
  const id = crypto.randomUUID();
  let interval: ReturnType<typeof setInterval>;

  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      const client = { id, controller };
      clients.add(client);

      void getRoomSnapshot(roomId).then((snapshot) => {
        if (snapshot) {
          controller.enqueue(encode("room", snapshot));
        }
      });

      interval = setInterval(() => {
        controller.enqueue(encode("ping", { now: Date.now() }));
      }, 5000);
    },
    cancel() {
      clearInterval(interval);

      for (const client of clients) {
        if (client.id === id) {
          clients.delete(client);
        }
      }
    },
  });

  return stream;
}
