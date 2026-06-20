import { NextResponse } from "next/server";
import {
  addRoomComment,
  createRoomItem,
  createRoomStream,
  getRoomSnapshot,
  updateRoomItem,
  createRoomConnection,
  deleteRoomConnection,
  deleteRoomItem,
  reverseRoomConnection,
  roomItemStatuses,
  type RoomConnectionSide,
  type RoomItemStatus,
  type RoomItemType,
} from "@/lib/canvasRoom";
import {
  isServerRealtimeFallbackAllowed,
  serverRealtimeFallbackStreamDisabledInit,
} from "@/lib/serverRealtimeFallback";

export const dynamic = "force-dynamic";

function isRoomItemStatus(value: unknown): value is RoomItemStatus {
  return typeof value === "string" && roomItemStatuses.includes(value as RoomItemStatus);
}

export async function GET(request: Request) {
  const accepts = request.headers.get("accept") ?? "";

  if (!accepts.includes("text/event-stream")) {
    return NextResponse.json(await getRoomSnapshot());
  }

  if (!isServerRealtimeFallbackAllowed()) {
    return new Response(null, serverRealtimeFallbackStreamDisabledInit);
  }

  return new Response(createRoomStream(), {
    headers: {
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "Content-Type": "text/event-stream",
    },
  });
}

export async function POST(request: Request) {
  const payload = (await request.json()) as {
    action?: "comment" | "item" | "connection" | "reverse-connection" | "delete-connection" | "delete-item";
    itemId?: string;
    type?: RoomItemType;
    title?: string;
    body?: string;
    imageUrl?: string;
    author?: string;
    color?: string;
    status?: RoomItemStatus;
    x?: number;
    y?: number;
    from?: string;
    fromSide?: RoomConnectionSide;
    to?: string;
    toSide?: RoomConnectionSide;
    connectionId?: string;
    id?: string;
  };

  if (payload.action === "comment") {
    if (!payload.itemId || !payload.body || payload.body.trim().length < 1) {
      return NextResponse.json({ error: "Comment body is required." }, { status: 400 });
    }

    const comment = await addRoomComment({
      itemId: payload.itemId,
      author: payload.author ?? "Visitor",
      body: payload.body,
      color: payload.color ?? "#48a7ff",
    });

    if (!comment) {
      return NextResponse.json({ error: "Item not found." }, { status: 404 });
    }

    return NextResponse.json({ comment });
  }

  if (payload.action === "connection") {
    if (!payload.from || !payload.to) {
      return NextResponse.json({ error: "from and to IDs are required." }, { status: 400 });
    }
    const connection = await createRoomConnection(payload.from, payload.to, payload.color, undefined, payload.author, {
      fromSide: payload.fromSide,
      toSide: payload.toSide,
    });
    return NextResponse.json({ connection });
  }

  if (payload.action === "reverse-connection") {
    if (!payload.connectionId) {
      return NextResponse.json({ error: "connectionId is required." }, { status: 400 });
    }
    const connection = await reverseRoomConnection(payload.connectionId, undefined, payload.author);

    if (!connection) {
      return NextResponse.json({ error: "Connection not found." }, { status: 404 });
    }

    return NextResponse.json({ connection });
  }

  if (payload.action === "delete-connection") {
    if (!payload.connectionId) {
      return NextResponse.json({ error: "connectionId is required." }, { status: 400 });
    }
    const deleted = await deleteRoomConnection(payload.connectionId, undefined, payload.author);
    return NextResponse.json({ ok: deleted });
  }

  if (payload.action === "delete-item") {
    const itemId = payload.id || payload.itemId;
    if (!itemId) {
      return NextResponse.json({ error: "id is required." }, { status: 400 });
    }
    const deleted = await deleteRoomItem(itemId, undefined, payload.author);
    return NextResponse.json({ ok: deleted });
  }

  if (!payload.type || !["image", "note"].includes(payload.type)) {
    return NextResponse.json({ error: "Item type is required." }, { status: 400 });
  }

  if (payload.status !== undefined && !isRoomItemStatus(payload.status)) {
    return NextResponse.json({ error: "Valid item status is required." }, { status: 400 });
  }

  const item = await createRoomItem({
    type: payload.type,
    status: payload.status,
    title: payload.title ?? (payload.type === "image" ? "Image" : "Note"),
    body: payload.body,
    imageUrl: payload.imageUrl,
    author: payload.author ?? "Visitor",
    actor: payload.author,
    color: payload.color ?? "#48a7ff",
    x: payload.x,
    y: payload.y,
  });

  return NextResponse.json({ item });
}

export async function PATCH(request: Request) {
  const payload = (await request.json()) as {
    id?: string;
    title?: string;
    body?: string;
    imageUrl?: string;
    x?: number;
    y?: number;
    color?: string;
    status?: RoomItemStatus;
    author?: string;
  };

  if (!payload.id) {
    return NextResponse.json({ error: "Item id is required." }, { status: 400 });
  }

  if (payload.status !== undefined && !isRoomItemStatus(payload.status)) {
    return NextResponse.json({ error: "Valid item status is required." }, { status: 400 });
  }

  const item = await updateRoomItem({
    id: payload.id,
    status: payload.status,
    title: payload.title,
    body: payload.body,
    imageUrl: payload.imageUrl,
    x: payload.x,
    y: payload.y,
    color: payload.color,
    actor: payload.author,
  });

  if (!item) {
    return NextResponse.json({ error: "Item not found." }, { status: 404 });
  }

  return NextResponse.json({ item });
}
