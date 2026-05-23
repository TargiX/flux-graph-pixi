import { chromium } from "playwright";

const baseUrl = process.env.SMOKE_BASE_URL ?? "http://localhost:3002";

const browser = await chromium.launch({ headless: true });
const errors = [];

async function completeJoinIfNeeded(page, name) {
  const joinButton = page.getByRole("button", { name: /^join room$/i });

  if ((await joinButton.count()) === 0) {
    return;
  }

  await page.locator("#profile-name").fill(name);
  await joinButton.click();
  await joinButton.waitFor({ state: "detached", timeout: 10000 });
}

try {
  const desktop = await browser.newPage({ viewport: { width: 1440, height: 960 } });
  desktop.on("console", (message) => {
    console.log(`[Desktop Console] [${message.type().toUpperCase()}] ${message.text()}`);
    if (message.type() === "error") {
      errors.push(message.text());
    }
  });
  desktop.on("pageerror", (error) => {
    console.error(`[Desktop PageError]`, error);
    errors.push(error.message);
  });

  try {
    await desktop.goto(baseUrl, { timeout: 15000, waitUntil: "domcontentloaded" });
    await desktop.getByRole("heading", { name: /start a shared board/i }).waitFor({ timeout: 15000 });
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

  await desktop.evaluate(
    ({ roomId, token }) => {
      localStorage.setItem("roomboard-owner-tokens", JSON.stringify({ [roomId]: token }));
    },
    { roomId: room.id, token: ownerToken },
  );

  await desktop.goto(`${baseUrl}/rooms/${room.id}`, { timeout: 15000, waitUntil: "domcontentloaded" });
  await desktop.waitForSelector("canvas", { timeout: 15000 });
  await completeJoinIfNeeded(desktop, "Smoke Desktop");
  await desktop.getByRole("button", { name: /add note/i }).click();
  await desktop.waitForFunction(
    async (roomId) => {
      const response = await fetch(`/api/rooms/${roomId}`);
      const snapshot = await response.json();
      return snapshot.items.length > 0;
    },
    room.id,
    { timeout: 15000 },
  );
  await desktop.waitForTimeout(800);

  const heading = await desktop.locator(".header-title").first().innerText();
  const canvasPixels = await desktop.evaluate(() => {
    const canvas = document.querySelector("canvas");
    if (!canvas) {
      return 0;
    }

    const sample = document.createElement("canvas");
    sample.width = canvas.width;
    sample.height = canvas.height;
    const context = sample.getContext("2d", { willReadFrequently: true });

    if (!context) {
      return 0;
    }

    context.drawImage(canvas, 0, 0);
    const data = context.getImageData(0, 0, sample.width, sample.height).data;
    let nonBlank = 0;

    for (let index = 0; index < data.length; index += 16) {
      if (data[index] || data[index + 1] || data[index + 2] || data[index + 3]) {
        nonBlank += 1;
      }
    }

    return nonBlank;
  });

  if (heading !== "Roomboard") {
    throw new Error(`Expected room heading to be "Roomboard", got "${heading}".`);
  }

  if (canvasPixels < 1000) {
    throw new Error(`Expected a nonblank Pixi canvas, got ${canvasPixels} sampled pixels.`);
  }

  await desktop.locator('input[type="file"]').setInputFiles({
    buffer: Buffer.from(
      `<svg xmlns="http://www.w3.org/2000/svg" width="96" height="64" viewBox="0 0 96 64">
        <rect width="96" height="64" rx="10" fill="#0ea5e9"/>
        <circle cx="30" cy="28" r="12" fill="#f8fafc"/>
        <path d="M10 54 40 34 58 46 72 28 90 54Z" fill="#10b981"/>
      </svg>`,
    ),
    mimeType: "image/svg+xml",
    name: "smoke-reference.svg",
  });
  await desktop.waitForFunction(
    async (roomId) => {
      const response = await fetch(`/api/rooms/${roomId}`);
      const snapshot = await response.json();
      return snapshot.items.some((item) => item.type === "image" && item.imageUrl?.startsWith("data:image/svg+xml"));
    },
    room.id,
    { timeout: 15000 },
  );

  const lockResponse = await fetch(`${baseUrl}/api/rooms/${room.id}`, {
    body: JSON.stringify({ action: "access", access: "locked" }),
    headers: { "Content-Type": "application/json", "X-Room-Owner-Token": ownerToken },
    method: "PATCH",
  });
  const guestResponse = await fetch(`${baseUrl}/api/rooms/${room.id}`);
  const ownerResponse = await fetch(`${baseUrl}/api/rooms/${room.id}`, {
    headers: { "X-Room-Owner-Token": ownerToken },
  });
  const unlockResponse = await fetch(`${baseUrl}/api/rooms/${room.id}`, {
    body: JSON.stringify({ action: "access", access: "link" }),
    headers: { "Content-Type": "application/json", "X-Room-Owner-Token": ownerToken },
    method: "PATCH",
  });
  const lockResult = {
    guestStatus: guestResponse.status,
    lockStatus: lockResponse.status,
    ownerStatus: ownerResponse.status,
    unlockStatus: unlockResponse.status,
  };

  if (
    lockResult.lockStatus !== 200 ||
    lockResult.guestStatus !== 403 ||
    lockResult.ownerStatus !== 200 ||
    lockResult.unlockStatus !== 200
  ) {
    throw new Error(`Expected room lock to gate link access, got ${JSON.stringify(lockResult)}.`);
  }

  const mobile = await browser.newPage({ viewport: { width: 390, height: 844 } });
  mobile.on("console", (message) => {
    if (message.type() === "error") {
      errors.push(message.text());
    }
  });
  mobile.on("pageerror", (error) => errors.push(error.message));

  await mobile.goto(`${baseUrl}/rooms/${room.id}`, { timeout: 15000, waitUntil: "domcontentloaded" });
  await mobile.waitForSelector("canvas", { timeout: 15000 });
  await completeJoinIfNeeded(mobile, "Smoke Mobile");
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
  await mobile.getByRole("heading", { name: /start a shared board/i }).waitFor({ timeout: 15000 });

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

  console.log("Smoke passed: dashboard creates a room, file upload works, link access can lock/unlock, notes work, and rooms can close.");
} finally {
  await browser.close();
}
