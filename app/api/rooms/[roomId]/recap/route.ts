import { NextResponse } from "next/server";
import {
  buildRoomRecap,
  getRoomSnapshot,
  getRoomSummary,
  type RoomCredentials,
} from "@/lib/canvasRoom";

export const dynamic = "force-dynamic";

type RoomRecapRouteProps = {
  params: Promise<{
    roomId: string;
  }>;
};

function getRoomCredentials(request: Request): RoomCredentials {
  const url = new URL(request.url);
  return {
    inviteToken:
      request.headers.get("x-room-invite-token") ??
      url.searchParams.get("inviteToken") ??
      url.searchParams.get("invite"),
    ownerToken: request.headers.get("x-room-owner-token") ?? url.searchParams.get("ownerToken"),
  };
}

export async function GET(request: Request, { params }: RoomRecapRouteProps) {
  const { roomId } = await params;
  const room = await getRoomSummary(roomId);

  if (!room) {
    return NextResponse.json({ error: "Room not found." }, { status: 404 });
  }

  const snapshot = await getRoomSnapshot(roomId, getRoomCredentials(request));

  if (!snapshot) {
    return NextResponse.json({ error: "Room is locked." }, { status: 403 });
  }

  return NextResponse.json({ recap: buildRoomRecap(snapshot) });
}
