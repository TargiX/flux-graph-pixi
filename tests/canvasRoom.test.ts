import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  buildRoomRecap,
  canAccessRoom,
  canEditRoom,
  closeRoom,
  createRoom,
  getRoomSnapshot,
  listRooms,
  roomItemStatuses,
  setRoomAccess,
  type RoomActivity,
  type RoomItem,
  type RoomSnapshot,
} from "../lib/canvasRoom.ts";

const updatedAt = Date.UTC(2026, 4, 29, 12, 0, 0);

function makeItem(overrides: Partial<RoomItem> = {}): RoomItem {
  return {
    id: "item-1",
    type: "note",
    status: "open",
    title: "Open question",
    body: "What should we decide next?",
    author: "Ilya",
    color: "#facc5c",
    x: 0,
    y: 0,
    width: 240,
    height: 160,
    createdAt: updatedAt - 2000,
    updatedAt: updatedAt - 1000,
    comments: [],
    ...overrides,
  };
}

function makeActivity(overrides: Partial<RoomActivity> = {}): RoomActivity {
  return {
    id: "activity-1",
    actor: "Roomboard",
    createdAt: updatedAt,
    message: "Created a note.",
    type: "item_created",
    ...overrides,
  };
}

function makeSnapshot(items: RoomItem[], activities: RoomActivity[] = []): Pick<RoomSnapshot, "activities" | "connections" | "items" | "room"> {
  const statusCounts = Object.fromEntries(roomItemStatuses.map((status) => [status, 0])) as RoomSnapshot["room"]["statusCounts"];

  for (const item of items) {
    statusCounts[item.status] += 1;
  }

  return {
    activities,
    connections: [
      {
        id: "connection-1",
        from: "approved-note",
        to: "reference-image",
      },
    ],
    items,
    room: {
      id: "review-room",
      name: "Review Room",
      access: "link",
      visibility: "public",
      createdAt: updatedAt - 10000,
      updatedAt,
      itemCount: items.length,
      noteCount: items.filter((item) => item.type === "note").length,
      imageCount: items.filter((item) => item.type === "image").length,
      commentCount: items.reduce((total, item) => total + item.comments.length, 0),
      connectionCount: 1,
      activityCount: activities.length,
      liveCount: 0,
      statusCounts,
      participants: [],
      previewItems: [],
    },
  };
}

describe("room lifecycle permissions", () => {
  it("locks link rooms to invite tokens while keeping owner controls", async () => {
    const roomName = `Lifecycle room ${Date.now()} ${Math.random().toString(36).slice(2)}`;
    const created = await createRoom(roomName);
    const roomId = created.room.id;
    const ownerCredentials = { ownerToken: created.ownerToken };

    const ownerSnapshot = await getRoomSnapshot(roomId, ownerCredentials);
    assert.ok(ownerSnapshot);
    assert.equal(ownerSnapshot.permissions.role, "owner");
    assert.equal(ownerSnapshot.permissions.canManage, true);
    assert.equal(ownerSnapshot.inviteTokens?.editor, ownerSnapshot.inviteTokens?.editor?.trim());

    assert.equal(await canAccessRoom(roomId), true);
    assert.equal(await canEditRoom(roomId), true);

    const locked = await setRoomAccess(roomId, "locked", ownerCredentials);
    assert.equal(locked?.access, "locked");
    assert.equal(await canAccessRoom(roomId), false);
    assert.equal(await canEditRoom(roomId), false);

    const ownerAfterLock = await getRoomSnapshot(roomId, ownerCredentials);
    assert.ok(ownerAfterLock);
    assert.equal(ownerAfterLock.permissions.role, "owner");
    assert.equal(ownerAfterLock.permissions.canManage, true);
    assert.equal(await canAccessRoom(roomId, ownerCredentials), true);
    assert.equal(await canEditRoom(roomId, ownerCredentials), true);

    const viewerToken = ownerSnapshot.inviteTokens?.viewer;
    assert.ok(viewerToken);
    const viewerSnapshot = await getRoomSnapshot(roomId, { inviteToken: viewerToken });
    assert.ok(viewerSnapshot);
    assert.equal(viewerSnapshot.permissions.role, "viewer");
    assert.equal(viewerSnapshot.permissions.canEdit, false);
    assert.equal(viewerSnapshot.inviteTokens, undefined);

    const editorToken = ownerSnapshot.inviteTokens?.editor;
    assert.ok(editorToken);
    const editorSnapshot = await getRoomSnapshot(roomId, { inviteToken: editorToken });
    assert.ok(editorSnapshot);
    assert.equal(editorSnapshot.permissions.role, "editor");
    assert.equal(editorSnapshot.permissions.canEdit, true);
    assert.equal(editorSnapshot.permissions.canManage, false);
  });

  it("removes closed rooms from snapshots, access checks, and recent rooms", async () => {
    const roomName = `Closed room ${Date.now()} ${Math.random().toString(36).slice(2)}`;
    const created = await createRoom(roomName);
    const roomId = created.room.id;
    const ownerCredentials = { ownerToken: created.ownerToken };

    const closed = await closeRoom(roomId, ownerCredentials);
    assert.equal(closed?.id, roomId);
    assert.equal(await getRoomSnapshot(roomId, ownerCredentials), null);
    assert.equal(await canAccessRoom(roomId, ownerCredentials), false);
    assert.equal((await listRooms()).some((room) => room.id === roomId), false);
  });
});

describe("buildRoomRecap", () => {
  it("groups cards by review status and summarizes decision progress", () => {
    const items = [
      makeItem({
        id: "approved-note",
        status: "approved",
        title: "Homepage direction",
        comments: [{ id: "comment-1", author: "Mira", body: "Ship it.", color: "#10b981", createdAt: updatedAt }],
      }),
      makeItem({
        id: "reference-image",
        type: "image",
        status: "reviewing",
        title: "Reference mood",
        imageUrl: "https://www.example.com/assets/mood.png",
        updatedAt: updatedAt - 500,
      }),
      makeItem({ id: "changes-note", status: "changes_requested", title: "Revise copy" }),
    ];

    const recap = buildRoomRecap(makeSnapshot(items, [makeActivity({ createdAt: updatedAt - 100 }), makeActivity({ id: "activity-2", createdAt: updatedAt })]));

    assert.equal(recap.roomId, "review-room");
    assert.equal(recap.totalItems, 3);
    assert.equal(recap.decidedCount, 2);
    assert.equal(recap.unresolvedCount, 1);
    assert.equal(recap.noteCount, 2);
    assert.equal(recap.imageCount, 1);
    assert.equal(recap.commentCount, 1);
    assert.equal(recap.connectionCount, 1);
    assert.deepEqual(
      recap.sections.map((section) => [section.status, section.count]),
      [
        ["approved", 1],
        ["changes_requested", 1],
        ["reviewing", 1],
        ["open", 0],
      ],
    );
    assert.equal(recap.sections[2].items[0].source, "example.com");
    assert.deepEqual(recap.recentActivities.map((activity) => activity.id), ["activity-2", "activity-1"]);
    assert.match(recap.markdown, /Progress: 2\/3 cards decided, 1 unresolved/);
    assert.match(recap.markdown, /- Reference mood .*source: example\.com/);
  });

  it("keeps exported markdown compact for long card bodies", () => {
    const longBody = "  This   text should be normalized before it is exported. ".repeat(6);
    const recap = buildRoomRecap(makeSnapshot([makeItem({ body: longBody, status: "approved", title: "Decision" })]));
    const decisionLine = recap.markdown.split("\n").find((line) => line.startsWith("- Decision"));

    if (!decisionLine) {
      assert.fail("expected the approved decision to appear in markdown");
    }

    assert.ok(
      decisionLine.length < 190,
      `expected compact decision line, got ${decisionLine.length} chars`,
    );
    assert.match(decisionLine, /\.\.\./);
    assert.doesNotMatch(decisionLine, /\s{2,}/);
  });
});
