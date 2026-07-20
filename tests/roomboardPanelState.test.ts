import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { getRoomboardPanelState } from "../lib/roomboardPanelState.ts";

describe("Roomboard panel state", () => {
  it("distinguishes board review from selected-item inspection", () => {
    assert.equal(getRoomboardPanelState(false), "board");
    assert.equal(getRoomboardPanelState(true), "item");
  });

  it("keeps the mobile profile trigger visible while hiding collaborator avatars", () => {
    const globalStyles = readFileSync(new URL("../app/globals.css", import.meta.url), "utf8");

    assert.match(globalStyles, /\.rb-presence__avatar:not\(\.you\)\s*\{\s*display:\s*none;/);
    assert.doesNotMatch(globalStyles, /\.rb-presence__avatar\s*\{\s*display:\s*none;/);
  });
});
