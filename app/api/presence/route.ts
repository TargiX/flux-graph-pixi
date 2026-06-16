import { NextResponse } from "next/server";
import { createPresenceStream, publishPresence, removePresence, type PresenceSnapshot } from "@/lib/presence";

export const runtime = "edge";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET() {
  return new Response(createPresenceStream(), {
    headers: {
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "Content-Type": "text/event-stream",
    },
  });
}

export async function POST(request: Request) {
  const payload = (await request.json()) as PresenceSnapshot;

  if (!payload.id || !payload.name || !payload.color || !payload.focus) {
    return NextResponse.json({ error: "Invalid presence payload" }, { status: 400 });
  }

  publishPresence({
    id: payload.id,
    name: payload.name.slice(0, 24),
    color: payload.color,
    focus: payload.focus,
    x: Number.isFinite(payload.x) ? payload.x : 0,
    y: Number.isFinite(payload.y) ? payload.y : 0,
    updatedAt: Date.now(),
  });

  return NextResponse.json({ ok: true });
}

export async function DELETE(request: Request) {
  const { searchParams } = new URL(request.url);
  const id = searchParams.get("id");

  if (id) {
    removePresence(id);
  }

  return NextResponse.json({ ok: true });
}
