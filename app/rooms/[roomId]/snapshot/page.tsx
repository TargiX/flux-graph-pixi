import { getRoomSnapshot } from "@/lib/canvasRoom";
import { RoomSnapshotView } from "@/components/RoomSnapshotView";

export const dynamic = "force-dynamic";

// Time formatting happens on the server (force-dynamic renders per request)
// so the client never calls Date.now()/toLocaleString during hydration —
// that avoids React hydration mismatches from server/client TZ or locale drift
// and from a minute boundary crossing between SSR and mount.
function formatRelative(timestamp: number): string {
  const diff = Date.now() - timestamp;
  const minutes = Math.round(diff / 60000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  if (days < 30) return `${days}d ago`;
  return new Date(timestamp).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
  });
}

function formatActivityTime(timestamp: number): string {
  return new Date(timestamp).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

type SnapshotPageProps = {
  params: Promise<{
    roomId: string;
  }>;
};

export async function generateMetadata({ params }: SnapshotPageProps) {
  const { roomId } = await params;

  // Only reveal room-specific metadata when the snapshot is publicly
  // accessible AND genuinely read-only (no credentials → demo room + link-access
  // rooms only). Link-access rooms grant editor rights, so we treat them as
  // not snapshot-able to avoid advertising editable content as read-only.
  // Unknown/locked/private rooms get generic metadata to avoid leaking names.
  const snapshot = await getRoomSnapshot(roomId);

  if (!snapshot || snapshot.permissions.canEdit) {
    return { title: "Room snapshot | Roomboard" };
  }

  const { room } = snapshot;

  return {
    title: `${room.name} — snapshot | Roomboard`,
    description: `Read-only snapshot of the "${room.name}" review room: ${room.itemCount} cards, ${room.commentCount} comments, ${room.connectionCount} connections.`,
    openGraph: {
      title: `${room.name} — snapshot | Roomboard`,
      description: `Read-only snapshot of the "${room.name}" review room: ${room.itemCount} cards, ${room.commentCount} comments.`,
    },
  };
}

export default async function SnapshotPage({ params }: SnapshotPageProps) {
  const { roomId } = await params;

  // No credentials → only genuinely read-only rooms resolve. The demo room
  // grants a viewer role, so it is safe to expose as a read-only snapshot.
  // Link-access rooms grant editor rights to anyone with the room URL, so
  // they are deliberately excluded — exposing their content under a
  // "read-only snapshot" label would imply a read-only guarantee the live
  // room does not honour. Unknown/locked/private ids also return null; for
  // the anonymous visitor they all look identical (locked), which prevents
  // room-id enumeration.
  const snapshot = await getRoomSnapshot(roomId);

  if (!snapshot || snapshot.permissions.canEdit) {
    return (
      <main className="snapshot-shell">
        <section className="snapshot-locked">
          <div className="snapshot-locked-badge" aria-hidden>
            🔒
          </div>
          <h1>This room isn&apos;t publicly viewable</h1>
          <p>
            The owner hasn&apos;t enabled public snapshot access for this room.
            Open the live room to request access.
          </p>
          <a className="snapshot-locked-cta" href={`/rooms/${roomId}`}>
            Open live room →
          </a>
        </section>
      </main>
    );
  }

  const activities = snapshot.activities
    .slice(0, 12)
    .map((a) => ({ ...a, timeLabel: formatActivityTime(a.createdAt) }));

  return (
    <RoomSnapshotView
      roomId={roomId}
      roomName={snapshot.room.name}
      items={snapshot.items}
      connections={snapshot.connections}
      activities={activities}
      statusCounts={snapshot.room.statusCounts}
      participants={snapshot.room.participants}
      capturedRelative={formatRelative(snapshot.room.updatedAt)}
    />
  );
}
