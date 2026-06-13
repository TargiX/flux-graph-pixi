import type { RoomAccess, RoomPermissions } from "./canvasRoom.ts";

export type LifecycleCopy = {
  accessBanner: string;
  accessBadge: string;
  emptyStateAction: string;
  emptyStateBody: string;
  emptyStateTitle: string;
};

export function getLifecycleCopy(
  permissions: RoomPermissions,
  access: RoomAccess,
  displayName: string,
  hasInvitedTokens: boolean,
): LifecycleCopy {
  const name = displayName.trim() || "guest";
  const role = permissions.role;

  if (access === "locked") {
    if (role === "owner") {
      return {
        accessBadge: "Locked · invite only",
        accessBanner: "Room is invite-only. Share the editor or viewer link from the header.",
        emptyStateTitle: `${name}, the room is locked`,
        emptyStateBody: "Collaborators with an invite link can join this room. You can share the editor or viewer invite from the toolbar.",
        emptyStateAction: "Review invite links",
      };
    }

    if (role === "editor") {
      return {
        accessBadge: "Locked · editor",
        accessBanner: "This room is invite-only. You joined with an editor link and can still edit the board.",
        emptyStateTitle: `Hi ${name}, ready to start`,
        emptyStateBody: "Drop a note or upload an image to start the review. Other invited editors will see your changes in realtime.",
        emptyStateAction: "Add the first card",
      };
    }

    return {
      accessBadge: "Locked · viewer",
      accessBanner: "This room is invite-only. You're viewing a read-only snapshot.",
      emptyStateTitle: `${name}, this room is empty`,
      emptyStateBody: "The creator has not added any cards yet. Check back later or ask them to share what to review.",
      emptyStateAction: hasInvitedTokens ? "Stay in the room" : "Open dashboard",
    };
  }

  if (role === "owner") {
    return {
      accessBadge: "Open · link access",
      accessBanner: "Anyone with the room link can join as an editor. Use Lock in the header to switch to invite-only.",
      emptyStateTitle: `${name}, this is a fresh room`,
      emptyStateBody: "Add a note or upload an image to start the review. You can change the access at any time from the header.",
      emptyStateAction: "Add the first card",
    };
  }

  if (role === "editor") {
    return {
      accessBadge: "Open · editor",
      accessBanner: "This room is open to anyone with the link. Your edits are visible to other editors in realtime.",
      emptyStateTitle: `Hi ${name}, ready to start`,
      emptyStateBody: "Drop a note or upload an image to start the review. Other editors will see your changes in realtime.",
      emptyStateAction: "Add the first card",
    };
  }

  return {
    accessBadge: "Open · viewer",
    accessBanner: "You're viewing this room as a read-only guest. Ask the creator for editor access to contribute.",
    emptyStateTitle: `${name}, this room is empty`,
    emptyStateBody: "The creator has not added any cards yet. Check back later, or ask the creator to share what to review.",
    emptyStateAction: "Open dashboard",
  };
}
