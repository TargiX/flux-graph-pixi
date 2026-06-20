import { CanvasRoom } from "@/components/CanvasRoom";

type RoomPageProps = {
  params: Promise<{
    roomId: string;
  }>;
};

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: RoomPageProps) {
  await params;

  return {
    title: "Shared room | Roomboard",
    description: "Realtime collaborative room board.",
  };
}

export default async function RoomPage({ params }: RoomPageProps) {
  const { roomId } = await params;

  return (
    <main className="shell">
      <section className="atlas-stage" aria-label="Shared room board">
        <CanvasRoom roomId={roomId} roomName="Shared room" />
      </section>
    </main>
  );
}
