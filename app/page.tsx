import { LandingPage } from "@/components/LandingPage";
import { listRooms } from "@/lib/canvasRoom";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  return <LandingPage initialRooms={await listRooms()} />;
}
