import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";
import {
  deleteRoomUploads,
  getRoomboardUploadStorageState,
  roomboardUploadBucket,
  uploadRoomImage,
} from "../lib/roomboardUploads.ts";

const originalSupabaseUrl = process.env.SUPABASE_URL;
const originalServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const originalAnonKey = process.env.SUPABASE_ANON_KEY;

function restoreEnv() {
  if (originalSupabaseUrl === undefined) delete process.env.SUPABASE_URL;
  else process.env.SUPABASE_URL = originalSupabaseUrl;

  if (originalServiceRoleKey === undefined) delete process.env.SUPABASE_SERVICE_ROLE_KEY;
  else process.env.SUPABASE_SERVICE_ROLE_KEY = originalServiceRoleKey;

  if (originalAnonKey === undefined) delete process.env.SUPABASE_ANON_KEY;
  else process.env.SUPABASE_ANON_KEY = originalAnonKey;
}

afterEach(restoreEnv);

describe("uploadRoomImage", () => {
  it("exposes the upload bucket used by hosted readiness checks", () => {
    assert.equal(roomboardUploadBucket, process.env.ROOMBOARD_UPLOAD_BUCKET ?? "roomboard-uploads");
  });

  it("falls back to a data URL when private storage has no service role key", async () => {
    process.env.SUPABASE_URL = "https://example.supabase.co";
    process.env.SUPABASE_ANON_KEY = "anon-key";
    delete process.env.SUPABASE_SERVICE_ROLE_KEY;

    const file = new File([new Uint8Array([1, 2, 3])], "tiny.png", { type: "image/png" });
    const uploaded = await uploadRoomImage(file, "private-room");

    assert.equal(uploaded.mode, "data-url");
    assert.match(uploaded.url, /^data:image\/png;base64,/);
  });

  it("reports upload storage as not configured without Supabase service credentials", async () => {
    process.env.SUPABASE_URL = "https://example.supabase.co";
    delete process.env.SUPABASE_SERVICE_ROLE_KEY;

    assert.deepEqual(await getRoomboardUploadStorageState(), {
      bucket: roomboardUploadBucket,
      configured: false,
      private: false,
      public: null,
      reachable: false,
    });
  });

  it("treats permanent upload cleanup as a no-op when hosted storage is not configured", async () => {
    delete process.env.SUPABASE_URL;
    delete process.env.SUPABASE_SERVICE_ROLE_KEY;

    assert.deepEqual(await deleteRoomUploads("private-room"), { configured: false, deleted: 0 });
    await assert.rejects(() => deleteRoomUploads("../unsafe"), /Valid room id/);
  });

  it("rejects SVG uploads before storage is touched", async () => {
    const file = new File(["<svg />"], "vector.svg", { type: "image/svg+xml" });

    await assert.rejects(() => uploadRoomImage(file, "private-room"), /Only JPEG, PNG, GIF, and WebP/);
  });
});
