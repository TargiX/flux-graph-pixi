import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { RoomCapacityError, RoomNotFoundError } from "../lib/canvasRoom.ts";
import { withRoomNotFoundAs404 } from "../lib/roomRouteErrors.ts";

describe("withRoomNotFoundAs404", () => {
  it("passes a successful response straight through", async () => {
    const ok = new Response("{}", { status: 200 });

    assert.equal(await withRoomNotFoundAs404(async () => ok), ok);
  });

  it("turns a raced room disappearance into 404 rather than an unhandled 500", async () => {
    const response = await withRoomNotFoundAs404(async () => {
      throw new RoomNotFoundError("smoke-pending-upload-room-c21745e7");
    });

    assert.equal(response.status, 404);
    assert.deepEqual(await response.json(), { error: "Room not found." });
  });

  it("turns an expected room capacity boundary into a stable 409", async () => {
    const response = await withRoomNotFoundAs404(async () => {
      throw new RoomCapacityError("items", 80);
    });

    assert.equal(response.status, 409);
    assert.deepEqual(await response.json(), {
      error: "Room items limit of 80 reached.",
      kind: "items",
      limit: 80,
    });
  });

  it("still surfaces genuine faults so they stay visible in runtime logs", async () => {
    await assert.rejects(
      () =>
        withRoomNotFoundAs404(async () => {
          throw new Error("Supabase unreachable");
        }),
      /Supabase unreachable/,
    );
  });
});
