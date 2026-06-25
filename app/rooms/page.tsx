import type { Metadata } from "next";
import { RoomsDashboard } from "@/components/RoomsDashboard";
import { listRooms } from "@/lib/canvasRoom";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Rooms | Roomboard",
  robots: {
    follow: false,
    index: false,
  },
};

export default async function RoomsPage() {
  return <RoomsDashboard initialRooms={await listRooms()} />;
}
