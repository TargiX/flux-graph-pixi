import { RoomsDashboard } from "@/components/RoomsDashboard";
import { listRooms } from "@/lib/canvasRoom";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  return <RoomsDashboard initialRooms={await listRooms()} />;
}
