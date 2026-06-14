import { NextResponse } from "next/server";
import { createRoom, listRooms, type RoomVisibility } from "@/lib/canvasRoom";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  let ownedRoomIds: Record<string, string> | undefined;

  try {
    const header = request.headers.get("X-Owned-Rooms");
    if (header) ownedRoomIds = JSON.parse(header);
  } catch {}

  return NextResponse.json({ rooms: await listRooms(ownedRoomIds) });
}

export async function POST(request: Request) {
  const payload = (await request.json()) as {
    name?: string;
    visibility?: RoomVisibility;
  };

  const visibility: RoomVisibility = payload.visibility === "private" ? "private" : "public";
  const created = await createRoom(payload.name ?? "Untitled room", visibility);

  return NextResponse.json(created);
}
