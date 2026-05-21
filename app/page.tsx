import { RoomsDashboard } from "@/components/RoomsDashboard";
import { listRooms } from "@/lib/canvasRoom";

export default function HomePage() {
  return <RoomsDashboard initialRooms={listRooms()} />;
}
