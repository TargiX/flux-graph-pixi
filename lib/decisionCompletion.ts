type DecisionCompletionActivity = {
  actor: string;
  type: string;
};

type DecisionCompletionItem = {
  commentCount: number;
  decisionSignalCount: number;
  status: "approved" | "changes_requested" | "open" | "reviewing";
};

type DecisionCompletionInput = {
  activities: DecisionCompletionActivity[];
  currentActor: string;
  items: DecisionCompletionItem[];
};

export function getDecisionCompletionSignal({ activities, currentActor, items }: DecisionCompletionInput) {
  const normalizedCurrentActor = currentActor.trim().toLowerCase();
  const collaboratorActionCount = activities.filter((activity) => {
    if (activity.type !== "comment_created" && activity.type !== "status_changed") {
      return false;
    }

    return activity.actor.trim().toLowerCase() !== normalizedCurrentActor;
  }).length;
  const approvedCount = items.filter((item) => item.status === "approved").length;
  const revisionCount = items.filter((item) => item.status === "changes_requested").length;
  const unresolvedCount = items.filter((item) => item.status === "open" || item.status === "reviewing").length;
  const commentCount = items.reduce((total, item) => total + item.commentCount, 0);
  const decisionSignalCount = items.reduce((total, item) => total + item.decisionSignalCount, 0);

  return {
    approvedCount,
    collaboratorActionCount,
    commentCount,
    decisionSignalCount,
    itemCount: items.length,
    qualifiesAsCollaborativeDecision: items.length > 0 && unresolvedCount === 0 && collaboratorActionCount > 0,
    revisionCount,
    unresolvedCount,
  };
}
