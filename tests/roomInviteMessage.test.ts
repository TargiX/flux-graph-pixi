import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { buildRoomInviteMessage } from "../lib/roomInviteMessage.ts";

describe("buildRoomInviteMessage", () => {
  it("gives collaborators a clear private editor invite without an account gate", () => {
    const message = buildRoomInviteMessage({
      prompt: "Please review the page direction and leave comments or status updates here:",
      roomName: "Landing review",
      url: "https://www.roomboard.online/rooms/landing-review#invite=editor-token",
    });

    assert.match(message, /private Roomboard room/);
    assert.match(message, /editor link without an account/);
    assert.match(message, /Please review the page direction/);
    assert.match(message, /#invite=editor-token/);
  });

  it("trims prompt spacing without changing the invite URL", () => {
    const message = buildRoomInviteMessage({
      prompt: "  Add comments here:  ",
      roomName: "Moodboard",
      url: "https://roomboard.test/rooms/moodboard#invite=abc",
    });

    assert.equal(message.includes("  Add comments here:"), false);
    assert.ok(message.endsWith("https://roomboard.test/rooms/moodboard#invite=abc"));
  });
});
