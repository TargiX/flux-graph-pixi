import { CanvasRoom } from "@/components/CanvasRoom";
import { getRoomSummary } from "@/lib/canvasRoom";

type RoomPageProps = {
  params: Promise<{
    roomId: string;
  }>;
};

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: RoomPageProps) {
  const { roomId } = await params;
  const room = await getRoomSummary(roomId);

  return {
    title: `${room?.name ?? "Shared room"} | Roomboard`,
    description: "Realtime collaborative room board.",
  };
}

export default async function RoomPage({ params }: RoomPageProps) {
  const { roomId } = await params;
  const room = await getRoomSummary(roomId);

  return (
    <main className="shell">
      <section className="atlas-stage" aria-label={`${room?.name ?? "Shared room"} room board`}>
        <CanvasRoom roomId={room?.id ?? roomId} roomName={room?.name ?? "Shared room"} />
      </section>
    </main>
  );
}
