import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";
import {
  isServerRealtimeFallbackAllowed,
  serverRealtimeFallbackStreamDisabledInit,
} from "../lib/serverRealtimeFallback.ts";

const originalNodeEnv = process.env.NODE_ENV;
const originalOverride = process.env.ROOMBOARD_ALLOW_SERVER_REALTIME_FALLBACK;

function setNodeEnv(value: string | undefined) {
  if (value === undefined) {
    Reflect.deleteProperty(process.env, "NODE_ENV");
    return;
  }

  Reflect.set(process.env, "NODE_ENV", value);
}

afterEach(() => {
  setNodeEnv(originalNodeEnv);

  if (originalOverride === undefined) {
    delete process.env.ROOMBOARD_ALLOW_SERVER_REALTIME_FALLBACK;
  } else {
    process.env.ROOMBOARD_ALLOW_SERVER_REALTIME_FALLBACK = originalOverride;
  }
});

describe("server realtime fallback guard", () => {
  it("allows the SSE fallback outside production", () => {
    setNodeEnv("development");
    delete process.env.ROOMBOARD_ALLOW_SERVER_REALTIME_FALLBACK;

    assert.equal(isServerRealtimeFallbackAllowed(), true);
  });

  it("disables the SSE fallback in production by default", () => {
    setNodeEnv("production");
    delete process.env.ROOMBOARD_ALLOW_SERVER_REALTIME_FALLBACK;

    assert.equal(isServerRealtimeFallbackAllowed(), false);
  });

  it("allows an explicit production override for emergency local-style fallback", () => {
    setNodeEnv("production");
    process.env.ROOMBOARD_ALLOW_SERVER_REALTIME_FALLBACK = "true";

    assert.equal(isServerRealtimeFallbackAllowed(), true);
  });

  it("uses 204 for disabled SSE streams so EventSource stops reconnecting", () => {
    assert.equal(serverRealtimeFallbackStreamDisabledInit.status, 204);
  });
});
