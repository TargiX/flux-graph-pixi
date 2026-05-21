import { NextResponse } from "next/server";
import { createRoom, listRooms } from "@/lib/canvasRoom";

export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json({ rooms: listRooms() });
}

export async function POST(request: Request) {
  const payload = (await request.json()) as {
    name?: string;
  };

  const created = createRoom(payload.name ?? "Untitled room");

  return NextResponse.json(created);
}
