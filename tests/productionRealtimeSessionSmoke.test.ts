import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  formatSessionFailure,
  redactSensitiveValues,
  resolveProductionSessionBaseUrl,
} from "../scripts/production-realtime-session-smoke.mjs";

describe("production realtime session smoke helpers", () => {
  it("defaults strictly to the canonical production origin", () => {
    assert.equal(resolveProductionSessionBaseUrl({}), "https://www.roomboard.online");
  });

  it("accepts only a valid explicit https base URL override", () => {
    assert.equal(
      resolveProductionSessionBaseUrl({ PRODUCTION_REALTIME_BASE_URL: "https://preview.roomboard.online/" }),
      "https://preview.roomboard.online",
    );
    assert.throws(
      () => resolveProductionSessionBaseUrl({ PRODUCTION_REALTIME_BASE_URL: "http://localhost:3050" }),
      /requires an https base URL/,
    );
    assert.throws(
      () => resolveProductionSessionBaseUrl({ PRODUCTION_REALTIME_BASE_URL: "" }),
      /must not be empty/,
    );
    assert.throws(
      () => resolveProductionSessionBaseUrl({ PRODUCTION_REALTIME_BASE_URL: "https://preview.roomboard.online/?target=prod" }),
      /must not contain a query string or fragment/,
    );
    assert.throws(
      () => resolveProductionSessionBaseUrl({ PRODUCTION_REALTIME_BASE_URL: "https://preview.roomboard.online/#prod" }),
      /must not contain a query string or fragment/,
    );
  });

  it("redacts tokens and reports cleanup failure after the primary failure", () => {
    const token = "owner-secret-token";
    assert.equal(redactSensitiveValues(`request included ${token}`, [token]), "request included [REDACTED]");

    const message = formatSessionFailure(
      new Error(`assertion failed with ${token}`),
      new Error("DELETE returned 500"),
      [],
      [token],
    );

    assert.equal(
      message,
      "Primary failure: assertion failed with [REDACTED]\nCleanup failure: DELETE returned 500",
    );
  });
});
