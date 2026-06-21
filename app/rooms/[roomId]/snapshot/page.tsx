import { notFound } from "next/navigation";
import { getRoomSnapshot, getRoomSummary } from "@/lib/canvasRoom";
import { RoomSnapshotView } from "@/components/RoomSnapshotView";

export const dynamic = "force-dynamic";

type SnapshotPageProps = {
  params: Promise<{
    roomId: string;
  }>;
};

export async function generateMetadata({ params }: SnapshotPageProps) {
  const { roomId } = await params;

  // Only reveal room-specific metadata when the snapshot is publicly
  // accessible (no credentials → demo room + link-access rooms only).
  // Locked/private rooms get generic metadata to avoid leaking their name.
  const snapshot = await getRoomSnapshot(roomId);

  if (!snapshot) {
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

  // No credentials → only publicly viewable rooms resolve
  // (the demo room and link-access rooms). Locked rooms return null.
  const snapshot = await getRoomSnapshot(roomId);

  if (!snapshot) {
    if (!snapshot) {
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

  return (
    <RoomSnapshotView
      roomId={roomId}
      roomName={snapshot.room.name}
      items={snapshot.items}
      connections={snapshot.connections}
      activities={snapshot.activities.slice(0, 12)}
      statusCounts={snapshot.room.statusCounts}
      participants={snapshot.room.participants}
      capturedAt={snapshot.room.updatedAt}
    />
  );
}
