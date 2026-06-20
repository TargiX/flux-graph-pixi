const baseUrl = (
  process.env.READINESS_BASE_URL ??
  process.env.SMOKE_BASE_URL ??
  "https://roomboard.online"
).replace(/\/$/, "");
const strict = process.argv.includes("--strict") || process.env.READINESS_STRICT === "true";
const demoRoomId = "pitch-deck-review";
const warnings = [];

function fail(message) {
  throw new Error(message);
}

function assert(condition, message) {
  if (!condition) fail(message);
}

async function request(path, options = {}) {
  const response = await fetch(`${baseUrl}${path}`, {
    ...options,
    headers: {
      ...(options.body ? { "Content-Type": "application/json" } : {}),
      ...(options.headers ?? {}),
    },
  });

  let body = null;
  const text = await response.text();
  if (text) {
    try {
      body = JSON.parse(text);
    } catch {
      body = text;
    }
  }

  return { body, response };
}

async function main() {
  let createdRoomId = "";
  let ownerToken = "";

  try {
    const healthResult = await request("/api/health");
    assert(healthResult.response.ok, `Health returned ${healthResult.response.status}`);
    const health = healthResult.body;
    assert(health?.ok === true, `Health did not report ok: ${JSON.stringify(health)}`);
    assert(health.storage === "supabase", `Expected Supabase storage, got ${health.storage}`);
    assert(health.durableStorage === true, "Expected durableStorage=true");

    if (strict) {
      assert(health.realtimeSignedTokens === true, "Strict mode requires realtimeSignedTokens=true");
      assert(health.serverRealtimeFallback === false, "Strict mode requires serverRealtimeFallback=false");
    } else {
      if (health.realtimeSignedTokens !== true) {
        warnings.push("realtimeSignedTokens=false; Phoenix signing secret is not fully rolled out yet.");
      }
      if (health.serverRealtimeFallback !== false) {
        warnings.push("serverRealtimeFallback=true; acceptable for beta bridge, not for stricter launch.");
      }
    }

    const publicRoomsResult = await request("/api/rooms");
    assert(publicRoomsResult.response.ok, `Public rooms returned ${publicRoomsResult.response.status}`);
    const publicRooms = publicRoomsResult.body?.rooms;
    assert(Array.isArray(publicRooms), "Public rooms response did not include rooms array");
    const unexpectedPublicRooms = publicRooms.filter((room) => room.id !== demoRoomId);
    assert(
      unexpectedPublicRooms.length === 0,
      `Unexpected public rooms without credentials: ${unexpectedPublicRooms.map((room) => room.id).join(", ")}`,
    );

    const createResult = await request("/api/rooms", {
      body: JSON.stringify({
        access: "link",
        name: `Readiness audit ${Date.now()}`,
        visibility: "public",
      }),
      method: "POST",
    });
    assert(createResult.response.ok, `Room create returned ${createResult.response.status}`);
    const created = createResult.body;
    createdRoomId = created?.room?.id;
    ownerToken = created?.ownerToken;
    assert(createdRoomId && ownerToken, `Create response missing room/ownerToken: ${JSON.stringify(created)}`);
    assert(created.room.access === "locked", `Expected locked room, got ${created.room.access}`);
    assert(created.room.visibility === "private", `Expected private room, got ${created.room.visibility}`);

    const publicRoomsAfterCreate = await request("/api/rooms");
    assert(
      !publicRoomsAfterCreate.body?.rooms?.some((room) => room.id === createdRoomId),
      "New private room appeared in public room list",
    );

    const bareSnapshot = await request(`/api/rooms/${createdRoomId}`);
    assert(bareSnapshot.response.status === 403, `Bare room snapshot returned ${bareSnapshot.response.status}`);

    const ownerSnapshot = await request(`/api/rooms/${createdRoomId}`, {
      headers: { "X-Room-Owner-Token": ownerToken },
    });
    assert(ownerSnapshot.response.ok, `Owner room snapshot returned ${ownerSnapshot.response.status}`);
    assert(ownerSnapshot.body?.permissions?.role === "owner", "Owner snapshot did not include owner role");
    assert(ownerSnapshot.body?.permissions?.canManage === true, "Owner snapshot did not include canManage=true");
    assert(ownerSnapshot.body?.inviteTokens?.editor, "Owner snapshot missing editor invite token");
    assert(ownerSnapshot.body?.inviteTokens?.viewer, "Owner snapshot missing viewer invite token");
    if (strict) {
      assert(ownerSnapshot.body?.realtimeToken, "Strict mode requires room snapshot realtimeToken");
    }

    const publicVisibilityAttempt = await request(`/api/rooms/${createdRoomId}`, {
      body: JSON.stringify({ action: "visibility", visibility: "public" }),
      headers: { "X-Room-Owner-Token": ownerToken },
      method: "PATCH",
    });
    assert(
      publicVisibilityAttempt.response.status === 400,
      `Public visibility attempt returned ${publicVisibilityAttempt.response.status}`,
    );

    const bareDelete = await request(`/api/rooms/${createdRoomId}`, { method: "DELETE" });
    assert(bareDelete.response.status === 403, `Bare room delete returned ${bareDelete.response.status}`);
  } finally {
    if (createdRoomId && ownerToken) {
      const cleanup = await request(`/api/rooms/${createdRoomId}`, {
        headers: { "X-Room-Owner-Token": ownerToken },
        method: "DELETE",
      });
      assert(cleanup.response.ok, `Cleanup returned ${cleanup.response.status}`);
    }
  }

  for (const warning of warnings) {
    console.warn(`Readiness warning: ${warning}`);
  }
  console.log(`Readiness passed for ${baseUrl}${strict ? " in strict mode" : ""}.`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
