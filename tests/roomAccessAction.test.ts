import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { getRoomAccessAction } from "../lib/roomAccessAction.ts";

describe("room access actions", () => {
  it("names the next privacy change before it starts", () => {
    assert.deepEqual(getRoomAccessAction("locked", false), {
      ariaLabel: "Open room to anyone with the link",
      label: "Open to link",
    });
    assert.deepEqual(getRoomAccessAction("link", false), {
      ariaLabel: "Lock room to invite-only access",
      label: "Lock room",
    });
  });

  it("keeps the active privacy transition truthful while the request is pending", () => {
    assert.deepEqual(getRoomAccessAction("locked", true), {
      ariaLabel: "Opening room to anyone with the link",
      label: "Opening access…",
    });
    assert.deepEqual(getRoomAccessAction("link", true), {
      ariaLabel: "Locking room to invite-only access",
      label: "Locking room…",
    });
  });
});
