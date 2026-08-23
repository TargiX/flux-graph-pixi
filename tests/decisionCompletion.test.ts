import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { getDecisionCompletionSignal } from "../lib/decisionCompletion.ts";

describe("getDecisionCompletionSignal", () => {
  it("qualifies an explicitly resolved room after a collaborator acts", () => {
    const signal = getDecisionCompletionSignal({
      activities: [
        { actor: "Owner", type: "item_created" },
        { actor: "Reviewer", type: "comment_created" },
        { actor: "Reviewer", type: "status_changed" },
      ],
      currentActor: "Owner",
      items: [
        { commentCount: 1, decisionSignalCount: 1, status: "approved" },
        { commentCount: 0, decisionSignalCount: 0, status: "changes_requested" },
      ],
    });

    assert.deepEqual(signal, {
      approvedCount: 1,
      collaboratorActionCount: 2,
      commentCount: 1,
      decisionSignalCount: 1,
      itemCount: 2,
      qualifiesAsCollaborativeDecision: true,
      revisionCount: 1,
      unresolvedCount: 0,
    });
  });

  it("does not claim collaborative completion for owner-only or unresolved work", () => {
    const signal = getDecisionCompletionSignal({
      activities: [
        { actor: "Owner", type: "comment_created" },
        { actor: "Reviewer", type: "item_created" },
      ],
      currentActor: "Owner",
      items: [
        { commentCount: 1, decisionSignalCount: 0, status: "approved" },
        { commentCount: 0, decisionSignalCount: 0, status: "open" },
      ],
    });

    assert.equal(signal.collaboratorActionCount, 0);
    assert.equal(signal.unresolvedCount, 1);
    assert.equal(signal.qualifiesAsCollaborativeDecision, false);
  });
});
