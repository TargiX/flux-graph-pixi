import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { hasAuthoredFirstCard, recordAuthoredFirstCard, resolveFirstCardEventName } from "../lib/firstCardSignal.ts";

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

describe("first authored card signal", () => {
  it("fires on a seeded starter board, where the room is never empty", () => {
    const storage = createMemoryStorage();

    assert.equal(resolveFirstCardEventName("landing-page-review-c1623b2c", false, storage), "Room First Card Created");
  });

  it("does not fire twice for the same visitor and room", () => {
    const storage = createMemoryStorage();

    assert.equal(recordAuthoredFirstCard("room-a", storage), true);
    assert.equal(resolveFirstCardEventName("room-a", false, storage), "Room Card Created");
  });

  it("treats each room separately", () => {
    const storage = createMemoryStorage();
    recordAuthoredFirstCard("room-a", storage);

    assert.equal(hasAuthoredFirstCard("room-a", storage), true);
    assert.equal(hasAuthoredFirstCard("room-b", storage), false);
    assert.equal(resolveFirstCardEventName("room-b", false, storage), "Room First Card Created");
  });

  it("uses the in-session flag when storage has not caught up", () => {
    const storage = createMemoryStorage();

    assert.equal(resolveFirstCardEventName("room-a", true, storage), "Room Card Created");
  });

  it("over-reports rather than losing the step when storage is corrupt", () => {
    const storage = createMemoryStorage({ "roomboard-authored-first-card": "{broken" });

    assert.equal(hasAuthoredFirstCard("room-a", storage), false);
    assert.equal(resolveFirstCardEventName("room-a", false, storage), "Room First Card Created");
  });

  it("stays inert without any storage at all", () => {
    assert.equal(hasAuthoredFirstCard("room-a", null), false);
    assert.equal(recordAuthoredFirstCard("room-a", null), false);
    assert.equal(resolveFirstCardEventName("room-a", false, null), "Room First Card Created");
  });
});
