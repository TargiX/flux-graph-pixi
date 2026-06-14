import { NextResponse } from "next/server";
import { createRoom, listRooms } from "@/lib/canvasRoom";

export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json({ rooms: await listRooms() });
}

export async function POST(request: Request) {
  const payload = (await request.json()) as {
    name?: string;
    seeded?: boolean;
  };

  const created = await createRoom(payload.name ?? "Untitled room", payload.seeded === true);

  return NextResponse.json(created);
}
