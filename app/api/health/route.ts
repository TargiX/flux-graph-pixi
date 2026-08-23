import { NextResponse } from "next/server";
import { getRoomStoreMode } from "@/lib/canvasRoom";
import { buildDeploymentInfo } from "@/lib/deploymentInfo";
import { buildLaunchHealth } from "@/lib/launchHealth";
import { hasRoomboardRealtimeAccessSecret } from "@/lib/roomboardRealtimeAccess";
import { getRoomboardUploadStorageState, roomboardUploadBucket } from "@/lib/roomboardUploads";
import { isServerRealtimeFallbackAllowed } from "@/lib/serverRealtimeFallback";
import { roomboardSupportEmail } from "@/lib/support";

export const dynamic = "force-dynamic";

export async function GET() {
  // Build-time stamp from next.config.ts, not a request-time process.env read:
  // the browser bundle has its PostHog token inlined at build, so only the
  // build-time answer describes what the deployed client can actually send.
  const analyticsConfigured = process.env.ROOMBOARD_ANALYTICS_CONFIGURED_AT_BUILD === "true";
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "";
  const realtimeEndpoint = process.env.NEXT_PUBLIC_ROOMBOARD_REALTIME_URL ?? "";
  const storage = getRoomStoreMode();
  const uploadStorageConfigured = Boolean(process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY);
  const uploadStorage = await getRoomboardUploadStorageState();
  const realtimeSignedTokens = hasRoomboardRealtimeAccessSecret();
  const serverRealtimeFallback = isServerRealtimeFallbackAllowed();
  const durableStorage = storage === "supabase";
  const deployment = buildDeploymentInfo();
  const launch = buildLaunchHealth({
    analyticsConfigured,
    appUrl,
    durableStorage,
    realtimeEndpoint,
    realtimeSignedTokens,
    serverRealtimeFallback,
    storage,
    supportEmail: roomboardSupportEmail,
    uploadBucket: roomboardUploadBucket,
    uploadStorageConfigured,
    uploadStoragePrivate: uploadStorage.private,
  });

  return NextResponse.json({
    analyticsConfigured,
    appUrl: appUrl || null,
    deployment,
    realtimeEndpoint: realtimeEndpoint || null,
    ok: true,
    launch,
    launchReady: launch.launchReady,
    realtimeSignedTokens,
    serverRealtimeFallback,
    storage,
    durableStorage,
    supportEmail: roomboardSupportEmail,
    uploadBucket: roomboardUploadBucket,
    uploadStorage,
    uploadStorageConfigured,
  });
}
