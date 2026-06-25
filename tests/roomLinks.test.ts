import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  buildRoomPathWithHashToken,
  normalizeRoomRouteFromInput,
  readRoomTokenFromUrl,
  setRoomHashToken,
  stripRoomTokensFromUrl,
} from "../lib/roomLinks.ts";

describe("room link helpers", () => {
  it("builds new room paths with sensitive tokens in the hash fragment", () => {
    assert.equal(
      buildRoomPathWithHashToken("private-room", "ownerToken", "secret owner", {
        new: "1",
        starter: "landing-review",
      }),
      "/rooms/private-room?new=1&starter=landing-review#ownerToken=secret+owner",
    );
  });

  it("reads hash tokens before legacy query tokens", () => {
    const url = new URL("https://roomboard.test/rooms/a?ownerToken=query-token#ownerToken=hash-token");

    assert.equal(readRoomTokenFromUrl(url, ["ownerToken"]), "hash-token");
  });

  it("keeps legacy query token links readable", () => {
    const url = new URL("https://roomboard.test/rooms/a?invite=legacy-invite");

    assert.equal(readRoomTokenFromUrl(url, ["invite", "inviteToken"]), "legacy-invite");
  });

  it("strips credential params without removing unrelated routing params", () => {
    const url = new URL("https://roomboard.test/rooms/a?new=1&ownerToken=query-token#invite=hash-token&panel=open");

    stripRoomTokensFromUrl(url, ["ownerToken", "invite"]);

    assert.equal(url.toString(), "https://roomboard.test/rooms/a?new=1#panel=open");
  });

  it("sets invite tokens into an existing hash fragment", () => {
    const url = new URL("https://roomboard.test/rooms/a?new=1#panel=open");

    setRoomHashToken(url, "invite", "editor-token");

    assert.equal(url.toString(), "https://roomboard.test/rooms/a?new=1#panel=open&invite=editor-token");
  });

  it("normalizes pasted invite links without dropping token fragments", () => {
    assert.equal(
      normalizeRoomRouteFromInput("https://roomboard.online/rooms/private-room-1#invite=editor-token"),
      "/rooms/private-room-1#invite=editor-token",
    );
  });

  it("normalizes plain room ids for manual entry", () => {
    assert.equal(normalizeRoomRouteFromInput("private-room-1"), "/rooms/private-room-1");
  });

  it("rejects unrelated paths", () => {
    assert.equal(normalizeRoomRouteFromInput("https://roomboard.online/privacy"), "");
  });
});
