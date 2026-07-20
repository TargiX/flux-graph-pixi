export type RoomboardPanelState = "board" | "item";

export function getRoomboardPanelState(hasSelectedItem: boolean): RoomboardPanelState {
  return hasSelectedItem ? "item" : "board";
}
