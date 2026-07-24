import type { RoomAccess } from "./canvasRoom";

type RoomAccessAction = {
  ariaLabel: string;
  label: string;
};

export function getRoomAccessAction(access: RoomAccess, isPending: boolean): RoomAccessAction {
  if (access === "locked") {
    return isPending
      ? { ariaLabel: "Opening room to anyone with the link", label: "Opening access…" }
      : { ariaLabel: "Open room to anyone with the link", label: "Open to link" };
  }

  return isPending
    ? { ariaLabel: "Locking room to invite-only access", label: "Locking room…" }
    : { ariaLabel: "Lock room to invite-only access", label: "Lock room" };
}
