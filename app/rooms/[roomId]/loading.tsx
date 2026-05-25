import { RoomboardLoader } from "@/components/RoomboardLoader";

export default function RoomLoading() {
  return (
    <main className="shell">
      <section className="atlas-stage" aria-label="Opening room">
        <RoomboardLoader
          detail="Preparing the board surface before live collaboration starts."
          message="Opening room"
          tone="route"
        />
      </section>
    </main>
  );
}
