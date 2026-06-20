import { NextResponse } from "next/server";
import { getRoomStoreMode } from "@/lib/canvasRoom";
import { hasRoomboardRealtimeAccessSecret } from "@/lib/roomboardRealtimeAccess";
import { isServerRealtimeFallbackAllowed } from "@/lib/serverRealtimeFallback";

export const dynamic = "force-dynamic";

export async function GET() {
  const storage = getRoomStoreMode();

  return NextResponse.json({
    ok: true,
    realtimeSignedTokens: hasRoomboardRealtimeAccessSecret(),
    serverRealtimeFallback: isServerRealtimeFallbackAllowed(),
    storage,
    durableStorage: storage === "supabase",
  });
}
