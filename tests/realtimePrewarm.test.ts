import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { buildRealtimePrewarmUrl } from "../lib/realtimePrewarm.ts";

describe("buildRealtimePrewarmUrl", () => {
  it("targets the sidecar health endpoint", () => {
    assert.equal(
      buildRealtimePrewarmUrl("https://roomboard-realtime.onrender.com"),
      "https://roomboard-realtime.onrender.com/health",
    );
  });

  it("replaces an existing path rather than appending to it", () => {
    assert.equal(buildRealtimePrewarmUrl("https://example.test/socket"), "https://example.test/health");
  });

  it("stays inert when no endpoint is configured", () => {
    assert.equal(buildRealtimePrewarmUrl(""), "");
    assert.equal(buildRealtimePrewarmUrl("   "), "");
  });

  it("refuses an unparseable endpoint instead of throwing into the landing page", () => {
    assert.equal(buildRealtimePrewarmUrl("not a url"), "");
  });
});
