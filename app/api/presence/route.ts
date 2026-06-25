import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json({ error: "Use /api/rooms/[roomId]/presence with room credentials." }, { status: 410 });
}

export async function POST() {
  return NextResponse.json({ error: "Use /api/rooms/[roomId]/presence with room credentials." }, { status: 410 });
}

export async function DELETE() {
  return NextResponse.json({ error: "Use /api/rooms/[roomId]/presence with room credentials." }, { status: 410 });
}
