import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { getRoomboardPanelState } from "../lib/roomboardPanelState.ts";

describe("Roomboard panel state", () => {
  it("distinguishes board review from selected-item inspection", () => {
    assert.equal(getRoomboardPanelState(false), "board");
    assert.equal(getRoomboardPanelState(true), "item");
  });
});
