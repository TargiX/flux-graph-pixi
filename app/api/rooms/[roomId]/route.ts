import { NextResponse } from "next/server";
import {
  addRoomComment,
  canAccessRoom,
  closeRoom,
  createRoomConnection,
  createRoomItem,
  createRoomStream,
  deleteRoomConnection,
  deleteRoomItem,
  getRoomSummary,
  getRoomSnapshot,
  isRoomOwner,
  setRoomAccess,
  updateRoomItem,
  type RoomAccess,
  type RoomItemType,
} from "@/lib/canvasRoom";

export const dynamic = "force-dynamic";

type RoomRouteProps = {
  params: Promise<{
    roomId: string;
  }>;
};

function getOwnerToken(request: Request) {
  const url = new URL(request.url);
  return request.headers.get("x-room-owner-token") ?? url.searchParams.get("ownerToken");
}

export async function GET(request: Request, { params }: RoomRouteProps) {
  const { roomId } = await params;
  const accepts = request.headers.get("accept") ?? "";
  const ownerToken = getOwnerToken(request);
  const snapshot = await getRoomSnapshot(roomId);

  if (!snapshot) {
    return NextResponse.json({ error: "Room not found." }, { status: 404 });
  }

  if (!(await canAccessRoom(roomId, ownerToken))) {
    return NextResponse.json({ error: "Room is locked." }, { status: 403 });
  }

  if (!accepts.includes("text/event-stream")) {
    return NextResponse.json(snapshot);
  }

  return new Response(createRoomStream(roomId), {
    headers: {
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "Content-Type": "text/event-stream",
    },
  });
}

export async function POST(request: Request, { params }: RoomRouteProps) {
  const { roomId } = await params;
  const ownerToken = getOwnerToken(request);
  const room = await getRoomSummary(roomId);

  if (!room) {
    return NextResponse.json({ error: "Room not found." }, { status: 404 });
  }

  if (!(await canAccessRoom(roomId, ownerToken))) {
    return NextResponse.json({ error: "Room is locked." }, { status: 403 });
  }

  const payload = (await request.json()) as {
    action?: "comment" | "item" | "connection" | "delete-connection" | "delete-item";
    itemId?: string;
    type?: RoomItemType;
    title?: string;
    body?: string;
    imageUrl?: string;
    author?: string;
    color?: string;
    x?: number;
    y?: number;
    width?: number;
    height?: number;
    from?: string;
    to?: string;
    connectionId?: string;
    id?: string;
  };

  if (payload.action === "comment") {
    if (!payload.itemId || !payload.body || payload.body.trim().length < 1) {
      return NextResponse.json({ error: "Comment body is required." }, { status: 400 });
    }

    const comment = await addRoomComment(
      {
        itemId: payload.itemId,
        author: payload.author ?? "Visitor",
        body: payload.body,
        color: payload.color ?? "#48a7ff",
      },
      roomId,
    );

    if (!comment) {
      return NextResponse.json({ error: "Item not found." }, { status: 404 });
    }

    return NextResponse.json({ comment });
  }

  if (payload.action === "connection") {
    if (!payload.from || !payload.to) {
      return NextResponse.json({ error: "from and to IDs are required." }, { status: 400 });
    }

    const connection = await createRoomConnection(payload.from, payload.to, payload.color, roomId);
    return NextResponse.json({ connection });
  }

  if (payload.action === "delete-connection") {
    if (!payload.connectionId) {
      return NextResponse.json({ error: "connectionId is required." }, { status: 400 });
    }

    const deleted = await deleteRoomConnection(payload.connectionId, roomId);
    return NextResponse.json({ ok: deleted });
  }

  if (payload.action === "delete-item") {
    const itemId = payload.id || payload.itemId;
    if (!itemId) {
      return NextResponse.json({ error: "id is required." }, { status: 400 });
    }

    const deleted = await deleteRoomItem(itemId, roomId);
    return NextResponse.json({ ok: deleted });
  }

  if (!payload.type || !["image", "note"].includes(payload.type)) {
    return NextResponse.json({ error: "Item type is required." }, { status: 400 });
  }

  const item = await createRoomItem(
    {
      type: payload.type,
      title: payload.title ?? (payload.type === "image" ? "Image" : "Note"),
      body: payload.body,
      imageUrl: payload.imageUrl,
      author: payload.author ?? "Visitor",
      color: payload.color ?? "#48a7ff",
      x: payload.x,
      y: payload.y,
      width: payload.width,
      height: payload.height,
    },
    roomId,
  );

  return NextResponse.json({ item });
}

export async function PATCH(request: Request, { params }: RoomRouteProps) {
  const { roomId } = await params;
  const ownerToken = getOwnerToken(request);
  const room = await getRoomSummary(roomId);

  if (!room) {
    return NextResponse.json({ error: "Room not found." }, { status: 404 });
  }

  const payload = (await request.json()) as {
    action?: "access";
    access?: RoomAccess;
    id?: string;
    title?: string;
    body?: string;
    imageUrl?: string;
    x?: number;
    y?: number;
    width?: number;
    height?: number;
    color?: string;
  };

  if (payload.action === "access") {
    if (!payload.access || !["link", "locked"].includes(payload.access)) {
      return NextResponse.json({ error: "Valid access mode is required." }, { status: 400 });
    }

    if (!(await isRoomOwner(roomId, ownerToken))) {
      return NextResponse.json({ error: "Only the room creator can change access." }, { status: 403 });
    }

    return NextResponse.json({ room: await setRoomAccess(roomId, payload.access, ownerToken) });
  }

  if (!(await canAccessRoom(roomId, ownerToken))) {
    return NextResponse.json({ error: "Room is locked." }, { status: 403 });
  }

  if (!payload.id) {
    return NextResponse.json({ error: "Item id is required." }, { status: 400 });
  }

  const item = await updateRoomItem(
    {
      id: payload.id,
      title: payload.title,
      body: payload.body,
      imageUrl: payload.imageUrl,
      x: payload.x,
      y: payload.y,
      width: payload.width,
      height: payload.height,
      color: payload.color,
    },
    roomId,
  );

  if (!item) {
    return NextResponse.json({ error: "Item not found." }, { status: 404 });
  }

  return NextResponse.json({ item });
}

export async function DELETE(request: Request, { params }: RoomRouteProps) {
  const { roomId } = await params;
  const ownerToken = getOwnerToken(request);

  if (!(await getRoomSummary(roomId))) {
    return NextResponse.json({ error: "Room not found." }, { status: 404 });
  }

  if (!(await isRoomOwner(roomId, ownerToken))) {
    return NextResponse.json({ error: "Only the room creator can close it." }, { status: 403 });
  }

  const room = await closeRoom(roomId, ownerToken);

  if (!room) {
    return NextResponse.json({ error: "Room not found." }, { status: 404 });
  }

  return NextResponse.json({ room });
}
