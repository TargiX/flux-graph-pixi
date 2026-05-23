import { NextResponse } from "next/server";
import { uploadRoomImage } from "@/lib/roomboardUploads";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const formData = await request.formData();
  const file = formData.get("file");
  const roomId = formData.get("roomId");

  if (!(file instanceof File)) {
    return NextResponse.json({ error: "Image file is required." }, { status: 400 });
  }

  if (typeof roomId !== "string" || !/^[a-zA-Z0-9][a-zA-Z0-9_-]{1,96}$/.test(roomId)) {
    return NextResponse.json({ error: "Valid room id is required." }, { status: 400 });
  }

  try {
    const uploaded = await uploadRoomImage(file, roomId);
    return NextResponse.json(uploaded);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Image upload failed." },
      { status: 400 },
    );
  }
}
