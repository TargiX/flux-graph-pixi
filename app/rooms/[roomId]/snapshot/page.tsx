import { notFound } from "next/navigation";
import {
  getRoomSnapshot,
  getRoomSummary,
} from "@/lib/canvasRoom";
import { RoomSnapshotView } from "@/components/RoomSnapshotView";

export const dynamic = "force-dynamic";

type SnapshotPageProps = {
  params: Promise<{
    roomId: string;
  }>;
};

export async function generateMetadata({ params }: SnapshotPageProps) {
  const { roomId } = await params;
  const room = await getRoomSummary(roomId);

  if (!room) {
    return { title: "Room not found | Roomboard" };
  }

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
  const summary = await getRoomSummary(roomId);

  if (!summary) {
    notFound();
  }

  // No credentials → only publicly viewable rooms resolve
  // (the demo room and link-access rooms).
  const snapshot = await getRoomSnapshot(roomId);

  if (!snapshot) {
    return (
      <main className="snapshot-shell">
        <section className="snapshot-locked">
          <div className="snapshot-locked-badge" aria-hidden>
            🔒
          </div>
          <h1>{summary.name}</h1>
          <p>
            This room is invite-only, so its snapshot isn&apos;t publicly
            viewable. Open the live room to request access.
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
      roomName={summary.name}
      items={snapshot.items}
      connections={snapshot.connections}
      activities={snapshot.activities.slice(0, 12)}
      statusCounts={summary.statusCounts}
      participants={summary.participants}
      capturedAt={snapshot.room.updatedAt}
    />
  );
}
