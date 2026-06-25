import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { buildDeploymentInfo } from "../lib/deploymentInfo.ts";

describe("buildDeploymentInfo", () => {
  it("returns safe Vercel deployment metadata for launch readiness", () => {
    const info = buildDeploymentInfo({
      NODE_ENV: "production",
      VERCEL_ENV: "production",
      VERCEL_GIT_COMMIT_REF: "main",
      VERCEL_GIT_COMMIT_SHA: "abc123",
      VERCEL_URL: "roomboard-showcase.vercel.app",
    });

    assert.deepEqual(info, {
      env: "production",
      gitCommitRef: "main",
      gitCommitSha: "abc123",
      url: "https://roomboard-showcase.vercel.app",
    });
  });

  it("does not expose arbitrary environment variables or secrets", () => {
    const info = buildDeploymentInfo({
      NODE_ENV: "production",
      SUPABASE_SERVICE_ROLE_KEY: "secret",
      VERCEL_URL: "https://roomboard.online",
    } as Parameters<typeof buildDeploymentInfo>[0]);

    assert.equal(info.url, "https://roomboard.online");
    assert.equal("SUPABASE_SERVICE_ROLE_KEY" in info, false);
    assert.equal(JSON.stringify(info).includes("secret"), false);
  });
});
