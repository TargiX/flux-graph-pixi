import { NextResponse } from "next/server";
import { createRoomStream, getRoomSnapshot } from "@/lib/canvasRoom";
import {
  isServerRealtimeFallbackAllowed,
  serverRealtimeFallbackStreamDisabledInit,
} from "@/lib/serverRealtimeFallback";

export const dynamic = "force-dynamic";

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

export async function POST() {
  return NextResponse.json({ error: "Use /api/rooms/[roomId] with room credentials." }, { status: 410 });
}

export async function PATCH() {
  return NextResponse.json({ error: "Use /api/rooms/[roomId] with room credentials." }, { status: 410 });
}
