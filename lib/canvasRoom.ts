import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

export type RoomItemType = "image" | "note";
export const roomItemStatuses = ["open", "reviewing", "approved", "changes_requested"] as const;
export type RoomItemStatus = (typeof roomItemStatuses)[number];

export type RoomComment = {
  id: string;
  author: string;
  body: string;
  color: string;
  createdAt: number;
};

export type RoomActivityType =
  | "access_changed"
  | "comment_created"
  | "connection_created"
  | "connection_deleted"
  | "item_created"
  | "item_deleted"
  | "item_moved"
  | "item_updated"
  | "room_closed"
  | "room_created"
  | "status_changed";

export type RoomActivity = {
  id: string;
  actor: string;
  createdAt: number;
  itemId?: string;
  itemTitle?: string;
  message: string;
  type: RoomActivityType;
};

export type RoomItem = {
  id: string;
  type: RoomItemType;
  status: RoomItemStatus;
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
export type RoomRole = "owner" | "editor" | "viewer";
export type RoomInviteRole = Exclude<RoomRole, "owner">;
export type RoomCredentials = {
  inviteToken?: string | null;
  ownerToken?: string | null;
};
export type RoomPermissions = {
  canEdit: boolean;
  canManage: boolean;
  role: RoomRole;
};

export type RoomSummary = {
  id: string;
  name: string;
  access: RoomAccess;
  createdAt: number;
  updatedAt: number;
  itemCount: number;
  noteCount: number;
  imageCount: number;
  commentCount: number;
  connectionCount: number;
  activityCount: number;
  liveCount: number;
  statusCounts: Record<RoomItemStatus, number>;
  participants: Array<{
    name: string;
    color: string;
  }>;
  previewItems: Array<{
    type: RoomItemType;
    status: RoomItemStatus;
    color: string;
    imageUrl?: string;
    x: number;
    y: number;
    width: number;
    height: number;
  }>;
};

export type RoomSnapshot = {
  inviteTokens?: Record<RoomInviteRole, string>;
  room: RoomSummary;
  permissions: RoomPermissions;
  items: RoomItem[];
  connections: RoomConnection[];
  activities: RoomActivity[];
};

type RoomClient = {
  credentials?: RoomCredentials;
  id: string;
  controller: ReadableStreamDefaultController<Uint8Array>;
};

type RoomDocument = {
  id: string;
  name: string;
  access: RoomAccess;
  inviteTokens?: Record<RoomInviteRole, string>;
  ownerToken: string;
  createdAt: number;
  updatedAt: number;
  closedAt?: number;
  items: RoomItem[];
  connections: RoomConnection[];
  activities?: RoomActivity[];
};

type RoomMutation<T> = (room: RoomDocument) => T;

type RoomStore = {
  delete: (roomId: string) => Promise<void>;
  get: (roomId: string) => Promise<RoomDocument | null>;
  list: () => Promise<RoomDocument[]>;
  save: (room: RoomDocument) => Promise<void>;
};

type RoomCredentialsInput = RoomCredentials | string | null | undefined;

export const DEFAULT_ROOM_ID = "pitch-deck-review";
const DEFAULT_ROOM_OWNER_TOKEN = "demo-owner";
const ROOMBOARD_SUPABASE_TABLE = process.env.ROOMBOARD_SUPABASE_TABLE ?? "roomboard_rooms";
const maxRoomActivities = 80;

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
  return normalizeRoomDocument(structuredClone(room) as RoomDocument);
}

function deriveInviteToken(room: Pick<RoomDocument, "id" | "ownerToken">, role: RoomInviteRole) {
  return createHash("sha256")
    .update(`${room.id}:${room.ownerToken}:${role}:roomboard-invite-v1`)
    .digest("hex")
    .slice(0, 36);
}

function createInviteTokens(): Record<RoomInviteRole, string> {
  return {
    editor: crypto.randomUUID(),
    viewer: crypto.randomUUID(),
  };
}

function normalizeRoomItemStatus(status: unknown): RoomItemStatus {
  return typeof status === "string" && roomItemStatuses.includes(status as RoomItemStatus)
    ? (status as RoomItemStatus)
    : "open";
}

function normalizeActivity(value: unknown): RoomActivity | null {
  if (!value || typeof value !== "object") {
    return null;
  }

  const activity = value as Partial<RoomActivity>;

  if (
    typeof activity.id !== "string" ||
    typeof activity.message !== "string" ||
    typeof activity.type !== "string" ||
    !Number.isFinite(activity.createdAt)
  ) {
    return null;
  }

  const createdAt = Number(activity.createdAt);

  return {
    id: activity.id,
    actor: typeof activity.actor === "string" && activity.actor.trim() ? activity.actor.trim().slice(0, 24) : "Roomboard",
    createdAt: Math.round(createdAt),
    itemId: typeof activity.itemId === "string" ? activity.itemId : undefined,
    itemTitle: typeof activity.itemTitle === "string" ? activity.itemTitle.slice(0, 72) : undefined,
    message: activity.message.slice(0, 160),
    type: activity.type as RoomActivityType,
  };
}

function normalizeActor(actor?: string) {
  return actor?.trim().slice(0, 24) || "Editor";
}

function appendRoomActivity(
  room: RoomDocument,
  activity: Omit<RoomActivity, "actor" | "createdAt" | "id"> & {
    actor?: string;
    createdAt?: number;
  },
) {
  const entry: RoomActivity = {
    ...activity,
    actor: normalizeActor(activity.actor),
    createdAt: activity.createdAt ?? Date.now(),
    id: crypto.randomUUID(),
    message: activity.message.slice(0, 160),
  };

  room.activities = [entry, ...(room.activities ?? [])].slice(0, maxRoomActivities);
  return entry;
}

function getEmptyStatusCounts(): Record<RoomItemStatus, number> {
  return {
    approved: 0,
    changes_requested: 0,
    open: 0,
    reviewing: 0,
  };
}

function normalizeRoomDocument(room: RoomDocument): RoomDocument {
  return {
    ...room,
    inviteTokens: {
      editor: typeof room.inviteTokens?.editor === "string"
        ? room.inviteTokens.editor
        : deriveInviteToken(room, "editor"),
      viewer: typeof room.inviteTokens?.viewer === "string"
        ? room.inviteTokens.viewer
        : deriveInviteToken(room, "viewer"),
    },
    items: room.items.map((item) => ({
      ...item,
      status: normalizeRoomItemStatus((item as Partial<RoomItem>).status),
    })),
    activities: (room.activities ?? [])
      .map(normalizeActivity)
      .filter((activity): activity is RoomActivity => Boolean(activity))
      .sort((a, b) => b.createdAt - a.createdAt)
      .slice(0, maxRoomActivities),
  };
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
      status: "approved",
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
      status: "reviewing",
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
      status: "open",
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
  const room: RoomDocument = {
    id,
    name,
    access: "link",
    inviteTokens: createInviteTokens(),
    ownerToken,
    createdAt,
    updatedAt: createdAt,
    items: seeded ? createSeedItems(createdAt) : [],
    connections: seeded ? createSeedConnections() : [],
    activities: [],
  };

  appendRoomActivity(room, {
    actor: seeded ? "Roomboard" : "Creator",
    createdAt,
    message: seeded ? "Seeded the demo review room." : `Created "${name}".`,
    type: "room_created",
  });

  return room;
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
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

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

      return data?.document ? normalizeRoomDocument(data.document as RoomDocument) : null;
    },
    async list() {
      const { data } = await client
        .from(ROOMBOARD_SUPABASE_TABLE)
        .select("document")
        .is("closed_at", null)
        .throwOnError();

      return (data ?? []).map((row) => normalizeRoomDocument(row.document as RoomDocument));
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
  const participants = new Map<string, { name: string; color: string }>();
  const statusCounts = getEmptyStatusCounts();

  for (const item of room.items) {
    statusCounts[normalizeRoomItemStatus(item.status)] += 1;

    if (item.author && !participants.has(item.author)) {
      participants.set(item.author, { name: item.author, color: item.color });
    }

    for (const comment of item.comments) {
      if (comment.author && !participants.has(comment.author)) {
        participants.set(comment.author, { name: comment.author, color: comment.color });
      }
    }
  }

  return {
    id: room.id,
    name: room.name,
    access: room.access,
    createdAt: room.createdAt,
    updatedAt: room.updatedAt,
    itemCount: room.items.length,
    noteCount: room.items.filter((item) => item.type === "note").length,
    imageCount: room.items.filter((item) => item.type === "image").length,
    commentCount: room.items.reduce((total, item) => total + item.comments.length, 0),
    connectionCount: room.connections.length,
    activityCount: room.activities?.length ?? 0,
    liveCount: clientsByRoom.get(room.id)?.size ?? 0,
    statusCounts,
    participants: Array.from(participants.values()).slice(0, 4),
    previewItems: room.items.slice(0, 5).map((item) => ({
      type: item.type,
      status: normalizeRoomItemStatus(item.status),
      color: item.color,
      imageUrl: item.imageUrl,
      x: item.x,
      y: item.y,
      width: item.width,
      height: item.height,
    })),
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

function normalizeRoomCredentials(input?: RoomCredentialsInput): RoomCredentials {
  if (!input) {
    return {};
  }

  if (typeof input === "string") {
    return { ownerToken: input };
  }

  return {
    inviteToken: input.inviteToken ?? null,
    ownerToken: input.ownerToken ?? null,
  };
}

function getRoomRole(room: RoomDocument, credentialsInput?: RoomCredentialsInput): RoomRole | null {
  const credentials = normalizeRoomCredentials(credentialsInput);

  if (credentials.ownerToken && credentials.ownerToken === room.ownerToken) {
    return "owner";
  }

  if (credentials.inviteToken && credentials.inviteToken === room.inviteTokens?.editor) {
    return "editor";
  }

  if (credentials.inviteToken && credentials.inviteToken === room.inviteTokens?.viewer) {
    return "viewer";
  }

  if (room.access === "link") {
    return "editor";
  }

  return null;
}

function toRoomPermissions(role: RoomRole): RoomPermissions {
  return {
    canEdit: role === "owner" || role === "editor",
    canManage: role === "owner",
    role,
  };
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

export async function getRoomSnapshot(
  roomId = DEFAULT_ROOM_ID,
  credentialsInput?: RoomCredentialsInput,
): Promise<RoomSnapshot | null> {
  const room = await getExistingRoom(roomId);

  if (!room) {
    return null;
  }

  const role = getRoomRole(room, credentialsInput);

  if (!role) {
    return null;
  }

  const permissions = toRoomPermissions(role);

  return {
    inviteTokens: permissions.canManage ? room.inviteTokens : undefined,
    room: toRoomSummary(room),
    permissions,
    items: room.items.sort((a, b) => a.createdAt - b.createdAt),
    connections: room.connections,
    activities: (room.activities ?? []).slice(0, 50),
  };
}

export async function publishRoomSnapshot(roomId = DEFAULT_ROOM_ID) {
  const clients = getClients(roomId);

  for (const client of clients) {
    try {
      const snapshot = await getRoomSnapshot(roomId, client.credentials);

      if (!snapshot) {
        clients.delete(client);
        continue;
      }

      client.controller.enqueue(encode("room", snapshot));
    } catch {
      clients.delete(client);
    }
  }
}

export async function getRoomPermissions(roomId = DEFAULT_ROOM_ID, credentialsInput?: RoomCredentialsInput) {
  const room = await getExistingRoom(roomId);

  if (!room) {
    return null;
  }

  const role = getRoomRole(room, credentialsInput);
  return role ? toRoomPermissions(role) : null;
}

export async function isRoomOwner(roomId = DEFAULT_ROOM_ID, credentialsInput?: RoomCredentialsInput) {
  const room = await getExistingRoom(roomId);
  return Boolean(room && getRoomRole(room, credentialsInput) === "owner");
}

export async function canAccessRoom(roomId = DEFAULT_ROOM_ID, credentialsInput?: RoomCredentialsInput) {
  return Boolean(await getRoomPermissions(roomId, credentialsInput));
}

export async function canEditRoom(roomId = DEFAULT_ROOM_ID, credentialsInput?: RoomCredentialsInput) {
  return Boolean((await getRoomPermissions(roomId, credentialsInput))?.canEdit);
}

export async function setRoomAccess(roomId: string, access: RoomAccess, credentialsInput?: RoomCredentialsInput) {
  if (!(await isRoomOwner(roomId, credentialsInput))) {
    return null;
  }

  return mutateRoom(roomId, (room) => {
    room.access = access;
    appendRoomActivity(room, {
      actor: "Creator",
      message: `Changed room access to ${access === "locked" ? "invite only" : "link editing"}.`,
      type: "access_changed",
    });
    return toRoomSummary(room);
  });
}

export async function closeRoom(roomId = DEFAULT_ROOM_ID, credentialsInput?: RoomCredentialsInput) {
  const room = await getExistingRoom(roomId);

  if (!room || !(await isRoomOwner(roomId, credentialsInput))) {
    return null;
  }

  const summary = toRoomSummary(room);
  const message = encode("closed", { room: summary });
  appendRoomActivity(room, {
    actor: "Creator",
    message: "Closed the room.",
    type: "room_closed",
  });
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
    status?: RoomItemStatus;
    x?: number;
    y?: number;
    width?: number;
    height?: number;
    actor?: string;
  },
  roomId = DEFAULT_ROOM_ID,
) {
  return mutateRoom(roomId, (room) => {
    const itemCount = room.items.length;
    const item: RoomItem = {
      id: crypto.randomUUID(),
      type: input.type,
      status: normalizeRoomItemStatus(input.status),
      title: input.title.trim().slice(0, 72) || (input.type === "image" ? "Image" : "Note"),
      body: (input.body ?? "").trim().slice(0, 420),
      imageUrl: input.imageUrl?.trim().slice(0, 2400),
      author: input.author.trim().slice(0, 24) || "Visitor",
      color: input.color,
      x: input.x ?? -120 + (itemCount % 5) * 74,
      y: input.y ?? -40 + (itemCount % 4) * 58,
      width: Math.round(input.width ?? (input.type === "image" ? 268 : 236)),
      height: Math.round(input.height ?? (input.type === "image" ? 220 : 156)),
      createdAt: Date.now(),
      updatedAt: Date.now(),
      comments: [],
    };

    room.items.push(item);
    appendRoomActivity(room, {
      actor: input.actor ?? input.author,
      itemId: item.id,
      itemTitle: item.title,
      message: `Added ${item.type === "image" ? "image" : "note"} "${item.title}".`,
      type: "item_created",
    });
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
    width?: number;
    height?: number;
    color?: string;
    status?: RoomItemStatus;
    actor?: string;
  },
  roomId = DEFAULT_ROOM_ID,
) {
  return mutateRoom(roomId, (room) => {
    const item = room.items.find((candidate) => candidate.id === input.id);

    if (!item) {
      return null;
    }

    const before = {
      body: item.body,
      color: item.color,
      imageUrl: item.imageUrl,
      status: item.status,
      title: item.title,
      width: item.width,
      height: item.height,
      x: item.x,
      y: item.y,
    };

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

    if (input.status !== undefined) {
      item.status = normalizeRoomItemStatus(input.status);
    }

    if (Number.isFinite(input.x)) {
      item.x = Math.round(input.x as number);
    }

    if (Number.isFinite(input.y)) {
      item.y = Math.round(input.y as number);
    }

    if (Number.isFinite(input.width)) {
      item.width = Math.round(input.width as number);
    }

    if (Number.isFinite(input.height)) {
      item.height = Math.round(input.height as number);
    }

    item.updatedAt = Date.now();
    const moved = (Number.isFinite(input.x) && item.x !== before.x) || (Number.isFinite(input.y) && item.y !== before.y);
    const statusChanged = input.status !== undefined && item.status !== before.status;
    const renamed = item.title !== before.title;
    const contentChanged =
      item.body !== before.body ||
      item.imageUrl !== before.imageUrl ||
      item.color !== before.color ||
      item.width !== before.width ||
      item.height !== before.height;

    if (statusChanged) {
      appendRoomActivity(room, {
        actor: input.actor,
        itemId: item.id,
        itemTitle: item.title,
        message: `Set "${item.title}" to ${item.status.replace("_", " ")}.`,
        type: "status_changed",
      });
    } else if (moved) {
      appendRoomActivity(room, {
        actor: input.actor,
        itemId: item.id,
        itemTitle: item.title,
        message: `Moved "${item.title}".`,
        type: "item_moved",
      });
    } else if (renamed || contentChanged) {
      appendRoomActivity(room, {
        actor: input.actor,
        itemId: item.id,
        itemTitle: item.title,
        message: `${renamed ? "Renamed" : "Updated"} "${item.title}".`,
        type: "item_updated",
      });
    }

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
    appendRoomActivity(room, {
      actor: comment.author,
      itemId: item.id,
      itemTitle: item.title,
      message: `Commented on "${item.title}".`,
      type: "comment_created",
    });
    return comment;
  });
}

export async function createRoomConnection(
  from: string,
  to: string,
  color?: string,
  roomId = DEFAULT_ROOM_ID,
  actor?: string,
) {
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
    const fromItem = room.items.find((item) => item.id === from);
    const toItem = room.items.find((item) => item.id === to);
    appendRoomActivity(room, {
      actor,
      itemId: from,
      itemTitle: fromItem?.title,
      message: `Linked "${fromItem?.title ?? "card"}" to "${toItem?.title ?? "card"}".`,
      type: "connection_created",
    });
    return connection;
  });
}

export async function deleteRoomConnection(id: string, roomId = DEFAULT_ROOM_ID, actor?: string) {
  return mutateRoom(roomId, (room) => {
    const connection = room.connections.find((candidate) => candidate.id === id);
    const before = room.connections.length;
    room.connections = room.connections.filter((connection) => connection.id !== id);
    if (room.connections.length !== before) {
      const fromItem = room.items.find((item) => item.id === connection?.from);
      const toItem = room.items.find((item) => item.id === connection?.to);
      appendRoomActivity(room, {
        actor,
        itemId: connection?.from,
        itemTitle: fromItem?.title,
        message: `Removed link between "${fromItem?.title ?? "card"}" and "${toItem?.title ?? "card"}".`,
        type: "connection_deleted",
      });
    }
    return room.connections.length !== before;
  });
}

export async function deleteRoomItem(id: string, roomId = DEFAULT_ROOM_ID, actor?: string) {
  return mutateRoom(roomId, (room) => {
    const deletedItem = room.items.find((item) => item.id === id);
    const before = room.items.length;
    room.items = room.items.filter((item) => item.id !== id);

    if (room.items.length === before) {
      return false;
    }

    room.connections = room.connections.filter((connection) => connection.from !== id && connection.to !== id);
    appendRoomActivity(room, {
      actor,
      itemId: id,
      itemTitle: deletedItem?.title,
      message: `Deleted "${deletedItem?.title ?? "card"}".`,
      type: "item_deleted",
    });
    return true;
  });
}

export function createRoomStream(roomId = DEFAULT_ROOM_ID, credentials?: RoomCredentials) {
  const clients = getClients(roomId);
  const id = crypto.randomUUID();
  let interval: ReturnType<typeof setInterval>;
  let client: RoomClient | undefined;
  let closed = false;

  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      client = { credentials, id, controller };
      clients.add(client);

      void getRoomSnapshot(roomId, credentials).then((snapshot) => {
        if (snapshot && !closed) {
          try {
            controller.enqueue(encode("room", snapshot));
          } catch {
            closed = true;
            if (client) {
              clients.delete(client);
            }
          }
        }
      });

      interval = setInterval(() => {
        if (closed) {
          return;
        }

        try {
          controller.enqueue(encode("ping", { now: Date.now() }));
        } catch {
          closed = true;
          clearInterval(interval);
          if (client) {
            clients.delete(client);
          }
        }
      }, 5000);
    },
    cancel() {
      closed = true;
      clearInterval(interval);

      for (const candidate of clients) {
        if (candidate.id === id) {
          clients.delete(candidate);
        }
      }
    },
  });

  return stream;
}
