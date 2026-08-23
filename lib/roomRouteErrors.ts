import { isRoomNotFoundError } from "./canvasRoom.ts";

/**
 * Room routes authorize against a snapshot and then mutate, so a room can be
 * closed or deleted in between — from another tab, or by the owner mid-request.
 * That raced the mutation into an unhandled throw and a 500; the honest answer
 * is the same 404 the pre-check would have produced a moment earlier.
 *
 * Only that one case is translated. Anything else still surfaces as a 500 so
 * genuine faults stay visible in runtime logs.
 *
 * Returns a plain Response rather than NextResponse so this stays importable
 * from the test runner, which cannot resolve `next/server`.
 */
export async function withRoomNotFoundAs404(handler: () => Promise<Response>): Promise<Response> {
  try {
    return await handler();
  } catch (error) {
    if (isRoomNotFoundError(error)) {
      return Response.json({ error: "Room not found." }, { status: 404 });
    }

    throw error;
  }
}
