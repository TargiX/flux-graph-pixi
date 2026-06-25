export type RoomInviteMessageInput = {
  prompt: string;
  roomName: string;
  url: string;
};

export function buildRoomInviteMessage({ prompt, roomName, url }: RoomInviteMessageInput) {
  return [
    `I opened a private Roomboard room for ${roomName}.`,
    "You can open this editor link without an account.",
    "",
    prompt.trim(),
    url,
  ].join("\n");
}
