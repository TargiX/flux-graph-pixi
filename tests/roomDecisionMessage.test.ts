import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { buildRoomDecisionMessage } from "../lib/roomDecisionMessage.ts";

const url = "https://www.roomboard.online/rooms/launch-review#invite=editor-token";

function room(statusCounts: Record<string, number>, itemCount = 1) {
  return { itemCount, name: "Launch review", statusCounts };
}

describe("buildRoomDecisionMessage", () => {
  it("turns requested revisions into a focused collaborator handoff", () => {
    const result = buildRoomDecisionMessage(room({ changes_requested: 2, open: 1 }, 3), url);

    assert.equal(result.tone, "needs_changes");
    assert.match(result.message, /2 cards need changes/);
    assert.match(result.message, /1 card still needs a response/);
    assert.ok(result.message.endsWith(url));
  });

  it("uses singular grammar for every non-ready decision state", () => {
    const needsChanges = buildRoomDecisionMessage(room({ changes_requested: 1, open: 1 }, 2), url);
    const needsDecision = buildRoomDecisionMessage(room({ open: 1 }, 1), url);
    const reviewing = buildRoomDecisionMessage(room({ reviewing: 1 }, 1), url);

    assert.match(needsChanges.message, /1 card needs changes/);
    assert.match(needsChanges.message, /1 card still needs a response/);
    assert.match(needsDecision.message, /1 card needs a decision/);
    assert.match(reviewing.message, /1 card is in review/);
  });

  it("makes a decision-ready room shareable without exposing card content", () => {
    const result = buildRoomDecisionMessage(room({ approved: 3 }, 3), url);

    assert.equal(result.tone, "ready");
    assert.match(result.message, /Decision ready: 3\/3 cards approved/);
    assert.equal(result.message.includes("card title"), false);
    assert.ok(result.message.endsWith(url));
  });
});
