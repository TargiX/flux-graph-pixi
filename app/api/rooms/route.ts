import { NextResponse } from "next/server";
import { createRoom, listRooms, roomStarterTemplates, type RoomAccess, type RoomStarterTemplate, type RoomVisibility } from "@/lib/canvasRoom";
import { checkRateLimit, getRequestClientKey } from "@/lib/requestRateLimit";

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
  const rateLimit = checkRateLimit(`rooms:create:${getRequestClientKey(request)}`, 12, 60 * 60 * 1000);

  if (!rateLimit.allowed) {
    return NextResponse.json(
      { error: "Too many rooms created. Try again later." },
      { headers: { "Retry-After": String(rateLimit.retryAfter) }, status: 429 },
    );
  }

  const payload = (await request.json()) as {
    name?: string;
    access?: RoomAccess;
    visibility?: RoomVisibility;
    seeded?: boolean;
    starterTemplate?: RoomStarterTemplate;
  };

  const visibility: RoomVisibility = "private";
  const access: RoomAccess = "locked";
  const starterTemplate = roomStarterTemplates.includes(payload.starterTemplate as RoomStarterTemplate)
    ? payload.starterTemplate
    : payload.seeded === true
      ? "landing-review"
      : false;
  const created = await createRoom(payload.name ?? "Untitled room", visibility, starterTemplate, access);

  return NextResponse.json(created);
}
