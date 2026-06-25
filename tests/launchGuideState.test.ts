import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { dismissRoomLaunchGuide, isRoomLaunchGuideDismissed } from "../lib/launchGuideState.ts";

function createMemoryStorage(initial: Record<string, string> = {}) {
  const data = new Map(Object.entries(initial));

  return {
    getItem(key: string) {
      return data.get(key) ?? null;
    },
    setItem(key: string, value: string) {
      data.set(key, value);
    },
  };
}

describe("launch guide dismissal state", () => {
  it("remembers dismissal per room", () => {
    const storage = createMemoryStorage();

    assert.equal(isRoomLaunchGuideDismissed("room-a", storage), false);
    assert.equal(dismissRoomLaunchGuide("room-a", storage), true);
    assert.equal(isRoomLaunchGuideDismissed("room-a", storage), true);
    assert.equal(isRoomLaunchGuideDismissed("room-b", storage), false);
  });

  it("treats corrupt storage as empty instead of blocking onboarding", () => {
    const storage = createMemoryStorage({
      "roomboard-dismissed-launch-guides": "{broken",
    });

    assert.equal(isRoomLaunchGuideDismissed("room-a", storage), false);
    assert.equal(dismissRoomLaunchGuide("room-a", storage), true);
    assert.equal(isRoomLaunchGuideDismissed("room-a", storage), true);
  });

  it("does nothing safely when storage is unavailable", () => {
    assert.equal(isRoomLaunchGuideDismissed("room-a", null), false);
    assert.equal(dismissRoomLaunchGuide("room-a", null), false);
  });
});
