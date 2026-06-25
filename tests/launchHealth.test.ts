import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { buildLaunchHealth } from "../lib/launchHealth.ts";

describe("buildLaunchHealth", () => {
  it("marks local/dev posture as not launch ready with concrete checks", () => {
    const health = buildLaunchHealth({
      appUrl: "http://localhost:3050",
      durableStorage: false,
      realtimeEndpoint: "http://localhost:4001",
      realtimeSignedTokens: false,
      serverRealtimeFallback: true,
      storage: "local",
      supportEmail: "replace-me@example.com",
      uploadBucket: "replace-bucket",
      uploadStorageConfigured: false,
      uploadStoragePrivate: false,
    });

    assert.equal(health.launchReady, false);
    assert.deepEqual(health.checks.map((check) => [check.key, check.ok]), [
      ["app_origin", false],
      ["durable_storage", false],
      ["upload_storage", false],
      ["realtime_signed_tokens", false],
      ["realtime_endpoint", false],
      ["server_realtime_fallback", false],
      ["support_contact", false],
    ]);
    assert.match(health.checks[0].remediation, /NEXT_PUBLIC_APP_URL/);
    assert.match(health.checks[1].remediation, /SUPABASE_URL/);
    assert.match(health.checks[2].remediation, /ROOMBOARD_UPLOAD_BUCKET/);
    assert.match(health.checks[4].remediation, /REALTIME_URL/);
    assert.match(health.checks[6].remediation, /SUPPORT_EMAIL/);
  });

  it("marks hosted production posture as launch ready", () => {
    const health = buildLaunchHealth({
      appUrl: "https://www.roomboard.online",
      durableStorage: true,
      realtimeEndpoint: "https://roomboard-realtime.onrender.com",
      realtimeSignedTokens: true,
      serverRealtimeFallback: false,
      storage: "supabase",
      supportEmail: "support@roomboard.online",
      uploadBucket: "roomboard-uploads",
      uploadStorageConfigured: true,
      uploadStoragePrivate: true,
    });

    assert.equal(health.launchReady, true);
    assert.equal(health.checks.every((check) => check.ok), true);
  });

  it("does not mark a public upload bucket as launch ready", () => {
    const health = buildLaunchHealth({
      appUrl: "https://www.roomboard.online",
      durableStorage: true,
      realtimeEndpoint: "https://roomboard-realtime.onrender.com",
      realtimeSignedTokens: true,
      serverRealtimeFallback: false,
      storage: "supabase",
      supportEmail: "support@roomboard.online",
      uploadBucket: "roomboard-uploads",
      uploadStorageConfigured: true,
      uploadStoragePrivate: false,
    });

    const uploadCheck = health.checks.find((check) => check.key === "upload_storage");

    assert.equal(health.launchReady, false);
    assert.equal(uploadCheck?.ok, false);
    assert.match(uploadCheck?.remediation ?? "", /private/);
  });
});
