import { chromium } from "playwright";

const baseUrl = process.env.SMOKE_BASE_URL ?? "http://localhost:3050";

const browser = await chromium.launch({ headless: true });
const errors = [];

function isExpectedConsoleNoise(message) {
  return /Failed to load resource: the server responded with a status of 403/.test(message);
}

async function completeJoinIfNeeded(page, name) {
  const joinButton = page.getByRole("button", { name: /^join room$/i });

  if ((await joinButton.count()) === 0) {
    return;
  }

  await page.locator("#profile-name").fill(name);
  await joinButton.click();
  await joinButton.waitFor({ state: "detached", timeout: 10000 });
}

async function waitForRoomReady(page, name) {
  await page.waitForSelector("canvas", { timeout: 15000 });
  await page.locator(".rb-loader").waitFor({ state: "detached", timeout: 15000 });
  await completeJoinIfNeeded(page, name);
}

try {
  const desktop = await browser.newPage({ viewport: { width: 1440, height: 960 } });
  desktop.on("console", (message) => {
    console.log(`[Desktop Console] [${message.type().toUpperCase()}] ${message.text()}`);
    if (message.type() === "error" && !isExpectedConsoleNoise(message.text())) {
      errors.push(message.text());
    }
  });
  desktop.on("pageerror", (error) => {
    console.error(`[Desktop PageError]`, error);
    errors.push(error.message);
  });

  try {
    await desktop.goto(baseUrl, { timeout: 15000, waitUntil: "domcontentloaded" });
    await desktop.getByRole("heading", { name: /decide visually/i }).waitFor({ timeout: 15000 });
  } catch (err) {
    await desktop.screenshot({ path: "screenshot-error.png" });
    console.log("Saved error screenshot to screenshot-error.png");
    throw err;
  }

  const roomResponse = await desktop.evaluate(async () => {
    const response = await fetch("/api/rooms", {
      body: JSON.stringify({ name: "Smoke review room" }),
      headers: { "Content-Type": "application/json" },
      method: "POST",
    });

    if (!response.ok) {
      throw new Error(`Room creation failed with ${response.status}`);
    }

    return response.json();
  });
  const room = roomResponse.room;
  const ownerToken = roomResponse.ownerToken;

  if (!room?.id || !ownerToken) {
    throw new Error(`Expected room creation response, got ${JSON.stringify(roomResponse)}.`);
  }

  const ownerSnapshotResponse = await fetch(`${baseUrl}/api/rooms/${room.id}`, {
    headers: { "X-Room-Owner-Token": ownerToken },
  });
  const ownerSnapshot = await ownerSnapshotResponse.json();
  const editorToken = ownerSnapshot.inviteTokens?.editor;
  const viewerToken = ownerSnapshot.inviteTokens?.viewer;

  if (
    ownerSnapshot.permissions?.role !== "owner" ||
    !ownerSnapshot.permissions?.canManage ||
    !editorToken ||
    !viewerToken
  ) {
    throw new Error(`Expected owner permissions and invite tokens, got ${JSON.stringify(ownerSnapshot)}.`);
  }

  await desktop.evaluate(
    ({ roomId, token }) => {
      localStorage.setItem("roomboard-owner-tokens", JSON.stringify({ [roomId]: token }));
    },
    { roomId: room.id, token: ownerToken },
  );

  await desktop.goto(`${baseUrl}/rooms/${room.id}`, { timeout: 15000, waitUntil: "domcontentloaded" });
  await waitForRoomReady(desktop, "Smoke Desktop");
  await desktop.getByLabel("Add note").click();
  await desktop.waitForFunction(
    async ({ roomId, ownerToken }) => {
      const response = await fetch(`/api/rooms/${roomId}`, {
        headers: { "X-Room-Owner-Token": ownerToken },
      });
      const snapshot = await response.json();
      return snapshot.items.length > 0;
    },
    { roomId: room.id, ownerToken },
    { timeout: 15000 },
  );
  await desktop.waitForTimeout(800);
  await desktop.getByRole("button", { name: /^approved$/i }).click();
  await desktop.waitForFunction(
    async ({ roomId, ownerToken }) => {
      const response = await fetch(`/api/rooms/${roomId}`, {
        headers: { "X-Room-Owner-Token": ownerToken },
      });
      const snapshot = await response.json();
      return snapshot.items.some((item) => item.status === "approved");
    },
    { roomId: room.id, ownerToken },
    { timeout: 15000 },
  );
  await desktop.waitForFunction(
    async ({ roomId, ownerToken }) => {
      const response = await fetch("/api/rooms", {
        headers: { "X-Owned-Rooms": JSON.stringify({ [roomId]: ownerToken }) },
      });
      const snapshot = await response.json();
      const listedRoom = snapshot.rooms.find((candidate) => candidate.id === roomId);
      return listedRoom?.statusCounts?.approved >= 1;
    },
    { roomId: room.id, ownerToken },
    { timeout: 15000 },
  );
  await desktop.waitForFunction(
    async ({ roomId, ownerToken }) => {
      const response = await fetch(`/api/rooms/${roomId}`, {
        headers: { "X-Room-Owner-Token": ownerToken },
      });
      const snapshot = await response.json();
      const types = new Set((snapshot.activities ?? []).map((activity) => activity.type));
      return types.has("item_created") && types.has("status_changed");
    },
    { roomId: room.id, ownerToken },
    { timeout: 15000 },
  );
  await desktop.locator(".rb-review-filters").getByRole("button", { name: /approved/i }).click();
  await desktop.waitForFunction(
    () => document.querySelector(".rb-coords")?.textContent?.includes("objects1/1"),
    undefined,
    { timeout: 15000 },
  );
  await desktop.locator(".rb-review-filters").getByRole("button", { name: /changes/i }).click();
  await desktop.locator(".rb-filter-empty").waitFor({ state: "visible", timeout: 15000 });
  await desktop.locator(".rb-review-filters").getByRole("button", { name: /^all/i }).click();
  await desktop.locator(".rb-filter-empty").waitFor({ state: "detached", timeout: 15000 });
  await desktop.evaluate(async ({ roomId, ownerToken }) => {
    const response = await fetch(`/api/rooms/${roomId}`, {
      body: JSON.stringify({
        action: "item",
        author: "Smoke Desktop",
        body: "Target card for handle connection.",
        color: "#10b981",
        title: "Connection target",
        type: "note",
        x: 260,
        y: -40,
      }),
      headers: { "Content-Type": "application/json", "X-Room-Owner-Token": ownerToken },
      method: "POST",
    });

    if (!response.ok) {
      throw new Error(`Connection target creation failed with ${response.status}`);
    }
  }, { roomId: room.id, ownerToken });
  await desktop.waitForFunction(
    async ({ roomId, ownerToken }) => {
      const response = await fetch(`/api/rooms/${roomId}`, {
        headers: { "X-Room-Owner-Token": ownerToken },
      });
      const snapshot = await response.json();
      return snapshot.items.length >= 2;
    },
    { roomId: room.id, ownerToken },
    { timeout: 15000 },
  );
  await desktop.reload({ timeout: 15000, waitUntil: "domcontentloaded" });
  await waitForRoomReady(desktop, "Smoke Desktop");
  await desktop.waitForFunction(
    () => document.querySelector(".rb-coords")?.textContent?.includes("objects2/2"),
    undefined,
    { timeout: 15000 },
  );
  const connectionItems = await desktop.evaluate(async ({ roomId, ownerToken }) => {
    const response = await fetch(`/api/rooms/${roomId}`, {
      headers: { "X-Room-Owner-Token": ownerToken },
    });
    const snapshot = await response.json();
    return {
      from: snapshot.items.find((item) => item.status === "approved"),
      to: snapshot.items.find((item) => item.title === "Connection target"),
    };
  }, { roomId: room.id, ownerToken });
  const canvasHost = await desktop.locator(".canvas-host").boundingBox();

  if (!canvasHost || !connectionItems.from || !connectionItems.to) {
    throw new Error(`Expected cards for handle connection, got ${JSON.stringify({ canvasHost, connectionItems })}.`);
  }

  const worldOrigin = {
    x: canvasHost.x + canvasHost.width / 2 + 80,
    y: canvasHost.y + canvasHost.height / 2 - 20,
  };
  const fromHandle = {
    x: worldOrigin.x + connectionItems.from.x + connectionItems.from.width,
    y: worldOrigin.y + connectionItems.from.y + connectionItems.from.height / 2,
  };
  const toHandle = {
    x: worldOrigin.x + connectionItems.to.x,
    y: worldOrigin.y + connectionItems.to.y + connectionItems.to.height / 2,
  };
  await desktop.mouse.move(fromHandle.x, fromHandle.y);
  await desktop.waitForTimeout(120);
  await desktop.mouse.down();
  await desktop.waitForTimeout(120);
  await desktop.mouse.move((fromHandle.x + toHandle.x) / 2, fromHandle.y - 36, { steps: 6 });
  await desktop.mouse.move(toHandle.x, toHandle.y, { steps: 6 });
  await desktop.waitForTimeout(120);
  await desktop.mouse.up();
  await desktop.waitForFunction(
    async ({ roomId, ownerToken }) => {
      const response = await fetch(`/api/rooms/${roomId}`, {
        headers: { "X-Room-Owner-Token": ownerToken },
      });
      const snapshot = await response.json();
      return snapshot.connections.length >= 1;
    },
    { roomId: room.id, ownerToken },
    { timeout: 15000 },
  );
  await desktop.waitForFunction(
    () => document.querySelector(".rb-coords")?.textContent?.includes("links1/1"),
    undefined,
    { timeout: 15000 },
  );
  const closeInspectorButton = desktop.getByRole("button", { name: /close inspector/i });
  if ((await closeInspectorButton.count()) > 0 && await closeInspectorButton.isEnabled()) {
    await closeInspectorButton.click();
  }
  const recapRequest = desktop.waitForResponse(
    (response) => response.url().includes(`/api/rooms/${room.id}/recap`) && response.status() === 200,
    { timeout: 30000 },
  );
  await desktop.getByRole("button", { name: /generate recap/i }).click();
  await recapRequest;

  const recapHeaders = { "X-Room-Owner-Token": ownerToken };
  const recapResponse = await fetch(`${baseUrl}/api/rooms/${room.id}/recap`, { headers: recapHeaders });
  const recapPayload = await recapResponse.json();
  const recapMarkdownResponse = await fetch(`${baseUrl}/api/rooms/${room.id}/recap?format=markdown`, { headers: recapHeaders });
  const recapMarkdown = await recapMarkdownResponse.text();

  if (
    recapResponse.status !== 200 ||
    recapMarkdownResponse.status !== 200 ||
    !recapMarkdownResponse.headers.get("content-type")?.includes("text/markdown") ||
    !recapMarkdownResponse.headers.get("content-disposition")?.includes("smoke-review-room-recap.md") ||
    recapPayload.recap?.decidedCount < 1 ||
    !recapPayload.recap?.markdown?.includes("## Approved") ||
    !recapMarkdown.includes("# Roomboard recap: Smoke review room")
  ) {
    throw new Error(`Expected room recap markdown export, got ${JSON.stringify({ recapPayload, markdownStatus: recapMarkdownResponse.status, recapMarkdown })}.`);
  }

  const heading = await desktop.locator(".header-title").first().innerText();
  const canvasState = await desktop.evaluate(() => {
    const canvas = document.querySelector("canvas");
    if (!canvas) {
      return { height: 0, nonBlank: 0, width: 0 };
    }

    const sample = document.createElement("canvas");
    sample.width = canvas.width;
    sample.height = canvas.height;
    const context = sample.getContext("2d", { willReadFrequently: true });

    if (!context) {
      return { height: canvas.height, nonBlank: 0, width: canvas.width };
    }

    context.drawImage(canvas, 0, 0);
    const data = context.getImageData(0, 0, sample.width, sample.height).data;
    let nonBlank = 0;

    for (let index = 0; index < data.length; index += 16) {
      if (data[index] || data[index + 1] || data[index + 2] || data[index + 3]) {
        nonBlank += 1;
      }
    }

    return { height: canvas.height, nonBlank, width: canvas.width };
  });

  if (heading !== "Roomboard") {
    throw new Error(`Expected room heading to be "Roomboard", got "${heading}".`);
  }

  if (canvasState.width < 100 || canvasState.height < 100) {
    throw new Error(`Expected a mounted Pixi canvas, got ${JSON.stringify(canvasState)}.`);
  }

  if (canvasState.nonBlank < 1000) {
    console.warn(`Pixi canvas readback returned ${canvasState.nonBlank} sampled pixels; continuing because hosted WebGL readback can be blank.`);
  }

  await desktop.locator('input[type="file"]').setInputFiles({
    buffer: Buffer.from(
      "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/p9sAAAAASUVORK5CYII=",
      "base64",
    ),
    mimeType: "image/png",
    name: "smoke-reference.png",
  });
  await desktop.waitForFunction(
    async ({ roomId, ownerToken }) => {
      const response = await fetch(`/api/rooms/${roomId}`, {
        headers: { "X-Room-Owner-Token": ownerToken },
      });
      const snapshot = await response.json();
      return snapshot.items.some(
        (item) =>
          item.type === "image" &&
          item.imageUrl,
      );
    },
    { roomId: room.id, ownerToken },
    { timeout: 15000 },
  );

  const lockResponse = await fetch(`${baseUrl}/api/rooms/${room.id}`, {
    body: JSON.stringify({ action: "access", access: "locked" }),
    headers: { "Content-Type": "application/json", "X-Room-Owner-Token": ownerToken },
    method: "PATCH",
  });
  const guestResponse = await fetch(`${baseUrl}/api/rooms/${room.id}`);
  const viewerResponse = await fetch(`${baseUrl}/api/rooms/${room.id}`, {
    headers: { "X-Room-Invite-Token": viewerToken },
  });
  const guestRecapResponse = await fetch(`${baseUrl}/api/rooms/${room.id}/recap`);
  const guestMarkdownResponse = await fetch(`${baseUrl}/api/rooms/${room.id}/recap?format=markdown`);
  const viewerRecapResponse = await fetch(`${baseUrl}/api/rooms/${room.id}/recap`, {
    headers: { "X-Room-Invite-Token": viewerToken },
  });
  const viewerMarkdownResponse = await fetch(`${baseUrl}/api/rooms/${room.id}/recap?format=markdown`, {
    headers: { "X-Room-Invite-Token": viewerToken },
  });
  const viewerMutationResponse = await fetch(`${baseUrl}/api/rooms/${room.id}`, {
    body: JSON.stringify({ action: "item", title: "Viewer mutation should fail", type: "note" }),
    headers: { "Content-Type": "application/json", "X-Room-Invite-Token": viewerToken },
    method: "POST",
  });
  const editorMutationResponse = await fetch(`${baseUrl}/api/rooms/${room.id}`, {
    body: JSON.stringify({ action: "item", title: "Editor invite note", type: "note" }),
    headers: { "Content-Type": "application/json", "X-Room-Invite-Token": editorToken },
    method: "POST",
  });
  const viewerSnapshot = await viewerResponse.json();
  const ownerResponse = await fetch(`${baseUrl}/api/rooms/${room.id}`, {
    headers: { "X-Room-Owner-Token": ownerToken },
  });
  const unlockResponse = await fetch(`${baseUrl}/api/rooms/${room.id}`, {
    body: JSON.stringify({ action: "access", access: "link" }),
    headers: { "Content-Type": "application/json", "X-Room-Owner-Token": ownerToken },
    method: "PATCH",
  });
  const lockResult = {
    editorMutationStatus: editorMutationResponse.status,
    guestMarkdownStatus: guestMarkdownResponse.status,
    guestRecapStatus: guestRecapResponse.status,
    guestStatus: guestResponse.status,
    lockStatus: lockResponse.status,
    ownerStatus: ownerResponse.status,
    unlockStatus: unlockResponse.status,
    viewerCanEdit: viewerSnapshot.permissions?.canEdit,
    viewerMarkdownStatus: viewerMarkdownResponse.status,
    viewerRecapStatus: viewerRecapResponse.status,
    viewerRole: viewerSnapshot.permissions?.role,
    viewerMutationStatus: viewerMutationResponse.status,
    viewerStatus: viewerResponse.status,
  };

  if (
    lockResult.lockStatus !== 200 ||
    lockResult.guestStatus !== 403 ||
    lockResult.guestRecapStatus !== 403 ||
    lockResult.guestMarkdownStatus !== 403 ||
    lockResult.viewerStatus !== 200 ||
    lockResult.viewerRecapStatus !== 200 ||
    lockResult.viewerMarkdownStatus !== 200 ||
    lockResult.viewerRole !== "viewer" ||
    lockResult.viewerCanEdit !== false ||
    lockResult.viewerMutationStatus !== 403 ||
    lockResult.editorMutationStatus !== 200 ||
    lockResult.ownerStatus !== 200 ||
    lockResult.unlockStatus !== 200
  ) {
    throw new Error(`Expected room lock and invite roles to gate access, got ${JSON.stringify(lockResult)}.`);
  }

  const mobile = await browser.newPage({ viewport: { width: 390, height: 844 } });
  mobile.on("console", (message) => {
    if (message.type() === "error" && !isExpectedConsoleNoise(message.text())) {
      errors.push(message.text());
    }
  });
  mobile.on("pageerror", (error) => errors.push(error.message));

  await mobile.goto(`${baseUrl}/rooms/${room.id}`, { timeout: 15000, waitUntil: "domcontentloaded" });
  await waitForRoomReady(mobile, "Smoke Mobile");
  await mobile.getByRole("button", { name: /add note/i }).click();

  await mobile.waitForFunction(async (roomId) => {
    const response = await fetch(`/api/rooms/${roomId}`);
    const snapshot = await response.json();
    return snapshot.items.length > 2;
  }, room.id);

  const countText = await mobile.locator(".room-presence .ui-card-title").innerText();
  const count = Number.parseInt(countText, 10);

  if (Number.isNaN(count) || count < 1) {
    throw new Error(`Expected presence count, got "${countText}".`);
  }

  const closeStatus = await mobile.evaluate(async ({ roomId, token }) => {
    const response = await fetch(`/api/rooms/${roomId}`, {
      headers: { "X-Room-Owner-Token": token },
      method: "DELETE",
    });
    return response.status;
  }, { roomId: room.id, token: ownerToken });

  if (closeStatus !== 200) {
    throw new Error(`Expected room close to return 200, got ${closeStatus}.`);
  }

  await mobile.goto(baseUrl, { timeout: 15000, waitUntil: "domcontentloaded" });
  await mobile.getByRole("heading", { name: /decide visually/i }).waitFor({ timeout: 15000 });

  const roomStillListed = await mobile.evaluate(async (roomId) => {
    const response = await fetch("/api/rooms");
    const snapshot = await response.json();
    return snapshot.rooms.some((listedRoom) => listedRoom.id === roomId);
  }, room.id);

  if (roomStillListed) {
    throw new Error("Expected closed room to be removed from active rooms.");
  }

  if (errors.length > 0) {
    throw new Error(`Browser errors:\n${errors.join("\n")}`);
  }

  console.log("Smoke passed: landing renders, room backend creates boards, file upload works, link access can lock/unlock, notes work, and rooms can close.");
} finally {
  await browser.close();
}
