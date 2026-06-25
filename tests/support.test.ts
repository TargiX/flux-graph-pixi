import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { buildRoomboardSupportMailto, roomboardSupportEmail, roomboardSupportMailto } from "../lib/support.ts";

describe("roomboard support links", () => {
  it("opens a prefilled support email without asking users to send tokens", () => {
    assert.equal(roomboardSupportEmail, process.env.NEXT_PUBLIC_ROOMBOARD_SUPPORT_EMAIL ?? "support@roomboard.online");
    assert.match(roomboardSupportMailto, /^mailto:[^?]+\?subject=Roomboard%20support&body=/);

    const body = decodeURIComponent(roomboardSupportMailto.split("body=")[1] ?? "");
    assert.match(body, /What happened\?/);
    assert.match(body, /Please do not include owner or invite tokens/);
  });

  it("can include a safe product context without leaking room links or tokens", () => {
    const mailto = buildRoomboardSupportMailto("Room canvas");
    const body = decodeURIComponent(mailto.split("body=")[1] ?? "");

    assert.match(body, /Room context: Room canvas/);
    assert.doesNotMatch(body, /ownerToken|invite=|\/rooms\//);
  });
});
