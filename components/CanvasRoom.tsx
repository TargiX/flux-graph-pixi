"use client";

import { FormEvent, useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { 
  Archive,
  FileImage, 
  MessageSquarePlus, 
  MousePointer2, 
  Send, 
  StickyNote, 
  Link2,
  Trash2,
  X,
  ZoomIn,
  ZoomOut,
  Maximize2,
  Copy,
  LayoutGrid,
  LockKeyhole,
  Upload,
  UnlockKeyhole
} from "lucide-react";
import { Application, Container, Graphics, Text, Sprite, Texture } from "pixi.js";
import type { RoomAccess, RoomItem, RoomSnapshot, RoomConnection } from "@/lib/canvasRoom";
import type { PresenceSnapshot } from "@/lib/presence";
import {
  createRoomboardRealtimeSession,
  type RoomboardBoardEventInput,
  type RoomboardRealtimeSession,
} from "@/lib/roomboardRealtime";

type LocalUser = {
  profileComplete?: boolean;
  id: string;
  name: string;
  color: string;
};

type PixiScene = {
  app: Application;
  cursorLayer: Container;
  host: HTMLDivElement;
  itemLayer: Container;
  itemMap: Map<string, Container>;
  world: Container;
  connectionGraphics: Graphics;
};

type LocalMove = {
  sentAt?: number;
  x: number;
  y: number;
};

const colors = ["#ffd166", "#0ea5e9", "#10b981", "#f43f5e", "#6366f1"];
const localUserKey = "canvas-room-user";
const realtimeEndpoint = process.env.NEXT_PUBLIC_ROOMBOARD_REALTIME_URL?.trim() ?? "";
const imageCardChromeHeight = 128;
const imageCardPaddingX = 32;
const minImageFrameWidth = 220;
const maxImageFrameWidth = 420;
const minImageFrameHeight = 116;
const maxImageFrameHeight = 320;
const pixiFont = "Geist, Inter, system-ui, sans-serif";
const pixiMonoFont = "Geist Mono, ui-monospace, monospace";

function toColor(hex: string) {
  return Number.parseInt(hex.replace("#", ""), 16);
}

function mixHex(hex: string, mixWith: string, amount: number) {
  const clean = (value: string) => value.replace("#", "");
  const a = Number.parseInt(clean(hex).slice(0, 6), 16);
  const b = Number.parseInt(clean(mixWith).slice(0, 6), 16);

  if (Number.isNaN(a) || Number.isNaN(b)) {
    return toColor(mixWith);
  }

  const ar = (a >> 16) & 255;
  const ag = (a >> 8) & 255;
  const ab = a & 255;
  const br = (b >> 16) & 255;
  const bg = (b >> 8) & 255;
  const bb = b & 255;
  const r = Math.round(ar * amount + br * (1 - amount));
  const g = Math.round(ag * amount + bg * (1 - amount));
  const bl = Math.round(ab * amount + bb * (1 - amount));

  return (r << 16) + (g << 8) + bl;
}

function getRectIntersection(
  p1: { x: number; y: number },
  p2: { x: number; y: number },
  rect: { x: number; y: number; width: number; height: number }
) {
  const { x, y, width, height } = rect;
  const xMin = x;
  const xMax = x + width;
  const yMin = y;
  const yMax = y + height;

  if (p1.x >= xMin && p1.x <= xMax && p1.y >= yMin && p1.y <= yMax) {
    return p1;
  }

  const dx = p2.x - p1.x;
  const dy = p2.y - p1.y;

  if (Math.abs(dx) < 0.001 && Math.abs(dy) < 0.001) {
    return p2;
  }

  let tMin = 1.0;

  if (dx !== 0) {
    const tL = (xMin - p1.x) / dx;
    if (tL >= 0 && tL <= 1) {
      const intersectY = p1.y + tL * dy;
      if (intersectY >= yMin && intersectY <= yMax) {
        tMin = Math.min(tMin, tL);
      }
    }
    const tR = (xMax - p1.x) / dx;
    if (tR >= 0 && tR <= 1) {
      const intersectY = p1.y + tR * dy;
      if (intersectY >= yMin && intersectY <= yMax) {
        tMin = Math.min(tMin, tR);
      }
    }
  }

  if (dy !== 0) {
    const tT = (yMin - p1.y) / dy;
    if (tT >= 0 && tT <= 1) {
      const intersectX = p1.x + tT * dx;
      if (intersectX >= xMin && intersectX <= xMax) {
        tMin = Math.min(tMin, tT);
      }
    }
    const tB = (yMax - p1.y) / dy;
    if (tB >= 0 && tB <= 1) {
      const intersectX = p1.x + tB * dx;
      if (intersectX >= xMin && intersectX <= xMax) {
        tMin = Math.min(tMin, tB);
      }
    }
  }

  return {
    x: p1.x + tMin * dx,
    y: p1.y + tMin * dy,
  };
}

function truncate(value: string, length = 96) {
  return value.length > length ? `${value.slice(0, length - 2)}...` : value;
}

function getDomain(url?: string) {
  if (!url) return "Link";
  try {
    const parsed = new URL(url);
    return parsed.hostname.replace("www.", "");
  } catch {
    return "Link";
  }
}

function loadImageTexture(src: string) {
  return new Promise<Texture>((resolve, reject) => {
    const image = new Image();

    if (/^https?:\/\//.test(src)) {
      image.crossOrigin = "anonymous";
    }

    image.onload = () => resolve(Texture.from(image));
    image.onerror = () => reject(new Error("Image could not be decoded."));
    image.src = src;
  });
}

function getLocalUser(): LocalUser {
  const saved = typeof window !== "undefined" ? window.localStorage.getItem(localUserKey) : null;

  if (saved) {
    const parsed = JSON.parse(saved) as LocalUser;
    const profileComplete = parsed.profileComplete ?? !parsed.name.startsWith("Guest ");
    return {
      ...parsed,
      name: profileComplete ? parsed.name : "",
      profileComplete,
    };
  }

  return {
    id: crypto.randomUUID(),
    name: "",
    color: colors[Math.floor(Math.random() * colors.length)],
    profileComplete: false,
  };
}

function getInitials(name: string) {
  const trimmed = name.trim();
  return trimmed ? trimmed.slice(0, 2).toUpperCase() : "ME";
}

function getImageCardSize(width?: number, height?: number) {
  if (!width || !height || width <= 0 || height <= 0) {
    return { width: 268, height: 220 };
  }

  const aspectRatio = Math.min(3.2, Math.max(0.35, width / height));
  let frameWidth = Math.min(maxImageFrameWidth, Math.max(minImageFrameWidth, width));
  let frameHeight = frameWidth / aspectRatio;

  if (frameHeight > maxImageFrameHeight) {
    frameHeight = maxImageFrameHeight;
    frameWidth = frameHeight * aspectRatio;
  }

  if (frameHeight < minImageFrameHeight) {
    frameHeight = minImageFrameHeight;
    frameWidth = frameHeight * aspectRatio;
  }

  frameWidth = Math.min(maxImageFrameWidth, Math.max(minImageFrameWidth, frameWidth));

  return {
    width: Math.round(frameWidth + imageCardPaddingX),
    height: Math.round(frameHeight + imageCardChromeHeight),
  };
}

function getImageDimensions(src: string) {
  return new Promise<{ width: number; height: number }>((resolve, reject) => {
    const image = new Image();

    if (/^https?:\/\//.test(src)) {
      image.crossOrigin = "anonymous";
    }

    image.onload = () => resolve({ width: image.naturalWidth || image.width, height: image.naturalHeight || image.height });
    image.onerror = () => reject(new Error("Image dimensions could not be read."));
    image.src = src;
  });
}

function getCardSize(item: RoomItem) {
  if (item.type !== "image") {
    return { width: item.width, height: item.height };
  }

  return {
    width: Math.max(252, item.width),
    height: Math.max(220, item.height),
  };
}

function isSamePosition(item: RoomItem, move: LocalMove) {
  return Math.round(item.x) === Math.round(move.x) && Math.round(item.y) === Math.round(move.y);
}

function getOwnerToken(roomId: string) {
  if (roomId === "pitch-deck-review") {
    return "demo-owner";
  }

  if (typeof window === "undefined") {
    return "";
  }

  try {
    const tokens = JSON.parse(localStorage.getItem("roomboard-owner-tokens") ?? "{}") as Record<string, string>;
    return tokens[roomId] ?? "";
  } catch {
    return "";
  }
}

function mergePresenceSnapshots(current: PresenceSnapshot[], incoming: PresenceSnapshot[]) {
  const now = Date.now();
  const merged = new Map<string, PresenceSnapshot>();

  for (const snapshot of current) {
    if (now - snapshot.updatedAt < 15000) {
      merged.set(snapshot.id, snapshot);
    }
  }

  for (const snapshot of incoming) {
    const existing = merged.get(snapshot.id);

    if (!existing || snapshot.updatedAt >= existing.updatedAt) {
      merged.set(snapshot.id, snapshot);
    }
  }

  return Array.from(merged.values()).sort((a, b) => b.updatedAt - a.updatedAt);
}

type CanvasRoomProps = {
  roomId: string;
  roomName: string;
};

export function CanvasRoom({ roomId, roomName }: CanvasRoomProps) {
  const router = useRouter();
  const hostRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const sceneRef = useRef<PixiScene | null>(null);
  const realtimeSessionRef = useRef<RoomboardRealtimeSession | null>(null);
  const tickerCleanupRef = useRef<(() => void)[]>([]);
  const draggingPositionsRef = useRef(new Map<string, LocalMove>());
  const pendingMovesRef = useRef(new Map<string, LocalMove>());
  const [items, setItems] = useState<RoomItem[]>([]);
  const [connections, setConnections] = useState<RoomConnection[]>([]);
  const [displayRoomName, setDisplayRoomName] = useState(roomName);
  const [roomAccess, setRoomAccessState] = useState<RoomAccess>("link");
  const [ownerToken, setOwnerToken] = useState("");
  const [hasLoadedOwnerToken, setHasLoadedOwnerToken] = useState(false);
  const [selectedId, setSelectedId] = useState("");
  const [presence, setPresence] = useState<PresenceSnapshot[]>([]);
  const [sceneReady, setSceneReady] = useState(false);
  const [draftTitle, setDraftTitle] = useState("");
  const [draftBody, setDraftBody] = useState("");
  const [imageUrl, setImageUrl] = useState("");
  const [toolbarImageUrl, setToolbarImageUrl] = useState("");
  const [isDraggingImage, setIsDraggingImage] = useState(false);
  const [comment, setComment] = useState("");
  const [user, setUser] = useState<LocalUser | null>(null);
  
  // Connection Mode States
  const [isConnecting, setIsConnecting] = useState(false);
  const [connectFromId, setConnectFromId] = useState<string | null>(null);
  const isConnectingRef = useRef(false);
  const connectFromIdRef = useRef<string | null>(null);
  
  // Zoom State
  const [zoomPercent, setZoomPercent] = useState(100);
  
  // Profile Modal State
  const [showProfileModal, setShowProfileModal] = useState(false);
  const [tempName, setTempName] = useState("");
  const [tempColor, setTempColor] = useState("");
  const [requiresProfile, setRequiresProfile] = useState(false);
  const [copiedShare, setCopiedShare] = useState(false);
  const [showCloseModal, setShowCloseModal] = useState(false);
  const [isClosingRoom, setIsClosingRoom] = useState(false);

  const selected = items.find((item) => item.id === selectedId) ?? null;
  const roomApi = `/api/rooms/${roomId}`;
  const roomStreamApi = ownerToken ? `${roomApi}?ownerToken=${encodeURIComponent(ownerToken)}` : roomApi;
  const presenceApi = `${roomApi}/presence`;
  const presenceChannelName = `roomboard-presence:${roomId}`;
  const ownerHeaders: Record<string, string> = ownerToken ? { "X-Room-Owner-Token": ownerToken } : {};

  const withLocalPositions = useCallback((nextItems: RoomItem[]) => {
    return nextItems.map((item) => {
      const draggingPosition = draggingPositionsRef.current.get(item.id);
      if (draggingPosition) {
        return {
          ...item,
          x: draggingPosition.x,
          y: draggingPosition.y,
        };
      }

      const pendingMove = pendingMovesRef.current.get(item.id);
      if (!pendingMove) {
        return item;
      }

      if (isSamePosition(item, pendingMove)) {
        pendingMovesRef.current.delete(item.id);
        return item;
      }

      if (pendingMove.sentAt && item.updatedAt < pendingMove.sentAt) {
        return {
          ...item,
          updatedAt: pendingMove.sentAt,
          x: pendingMove.x,
          y: pendingMove.y,
        };
      }

      return item;
    });
  }, []);

  const applyRoomSnapshot = useCallback(
    (snapshot: RoomSnapshot) => {
      const nextItems = withLocalPositions(snapshot.items || []);

      setDisplayRoomName(snapshot.room?.name ?? roomName);
      setRoomAccessState(snapshot.room?.access ?? "link");
      setItems(nextItems);
      setConnections(snapshot.connections || []);
      setSelectedId((current) =>
        nextItems.some((item) => item.id === current) ? current : nextItems[0]?.id ?? "",
      );
    },
    [roomName, withLocalPositions],
  );

  const applyBoardEvent = useCallback(
    (event: RoomboardBoardEventInput) => {
      if (event.type === "item:created" || event.type === "item:updated" || event.type === "item:moved") {
        setItems((current) => {
          const next = new Map(current.map((item) => [item.id, item]));
          next.set(event.item.id, withLocalPositions([event.item])[0]);
          return withLocalPositions(Array.from(next.values())).sort((a, b) => a.createdAt - b.createdAt);
        });
        return;
      }

      if (event.type === "item:deleted") {
        setItems((current) => current.filter((item) => item.id !== event.itemId));
        setConnections((current) => current.filter((connection) => connection.from !== event.itemId && connection.to !== event.itemId));
        setSelectedId((current) => (current === event.itemId ? "" : current));
        return;
      }

      if (event.type === "comment:created") {
        setItems((current) =>
          current.map((item) => {
            if (item.id !== event.itemId || item.comments.some((comment) => comment.id === event.comment.id)) {
              return item;
            }

            return {
              ...item,
              comments: [...item.comments, event.comment],
              updatedAt: Math.max(item.updatedAt, event.comment.createdAt),
            };
          }),
        );
        return;
      }

      if (event.type === "connection:created") {
        setConnections((current) => {
          const next = new Map(current.map((connection) => [connection.id, connection]));
          next.set(event.connection.id, event.connection);
          return Array.from(next.values());
        });
        return;
      }

      if (event.type === "connection:deleted") {
        setConnections((current) => current.filter((connection) => connection.id !== event.connectionId));
        return;
      }

      if (event.type === "room:updated") {
        setDisplayRoomName(event.room.name);
        setRoomAccessState(event.room.access);
        return;
      }

      if (event.type === "room:closed") {
        router.push("/");
      }
    },
    [router, withLocalPositions],
  );

  const publishBoardEvent = useCallback(
    (event: RoomboardBoardEventInput) => {
      if (!user?.profileComplete) {
        return;
      }

      realtimeSessionRef.current?.sendRoomEvent({
        ...event,
        clientId: user?.id,
      });
    },
    [user],
  );

  const requestProfile = () => {
    setRequiresProfile(true);
    setShowProfileModal(true);
  };

  useEffect(() => {
    isConnectingRef.current = isConnecting;
    connectFromIdRef.current = connectFromId;
  }, [isConnecting, connectFromId]);

  useEffect(() => {
    const defaultUser = getLocalUser();
    setUser(defaultUser);
    setTempName(defaultUser.name);
    setTempColor(defaultUser.color);
    setRequiresProfile(!defaultUser.profileComplete);
    setShowProfileModal(!defaultUser.profileComplete);
  }, []);

  useEffect(() => {
    setOwnerToken(getOwnerToken(roomId));
    setHasLoadedOwnerToken(true);
  }, [roomId]);

  useEffect(() => {
    if (!hasLoadedOwnerToken) {
      return;
    }

    if (realtimeEndpoint) {
      let cancelled = false;

      fetch(roomApi, {
        headers: ownerToken ? { "X-Room-Owner-Token": ownerToken } : undefined,
      })
        .then(async (response) => {
          if (!response.ok) {
            throw new Error(`Room snapshot failed with ${response.status}`);
          }

          return (await response.json()) as RoomSnapshot;
        })
        .then((snapshot) => {
          if (!cancelled) {
            applyRoomSnapshot(snapshot);
          }
        })
        .catch(() => {
          if (!cancelled) {
            router.push("/");
          }
        });

      return () => {
        cancelled = true;
      };
    }

    const source = new EventSource(roomStreamApi);

    source.addEventListener("room", (event) => {
      const snapshot = JSON.parse((event as MessageEvent).data) as RoomSnapshot;
      applyRoomSnapshot(snapshot);
    });
    source.addEventListener("closed", () => {
      router.push("/");
    });
    source.onerror = () => {
      router.push("/");
    };

    return () => source.close();
  }, [applyRoomSnapshot, hasLoadedOwnerToken, ownerToken, roomApi, roomStreamApi, router]);

  useEffect(() => {
    setDraftTitle(selected?.title ?? "");
    setDraftBody(selected?.body ?? "");
    setImageUrl(selected?.imageUrl ?? "");
  }, [selected]);

  useEffect(() => {
    if (!user?.profileComplete) {
      return;
    }

    if (realtimeEndpoint) {
      const session = createRoomboardRealtimeSession({
        endpoint: realtimeEndpoint,
        onBoardEvent: applyBoardEvent,
        onPresenceState: (snapshots) => {
          setPresence(
            snapshots
              .filter((snapshot) => snapshot.id !== user.id)
              .sort((a, b) => b.updatedAt - a.updatedAt),
          );
        },
        onPresenceUpdate: (snapshot) => {
          if (snapshot.id !== user.id) {
            setPresence((current) => mergePresenceSnapshots(current, [snapshot]));
          }
        },
        roomId,
        user,
      });

      realtimeSessionRef.current = session;

      return () => {
        realtimeSessionRef.current = null;
        session.disconnect();
      };
    }

    const source = new EventSource(presenceApi);
    const channel = new BroadcastChannel(presenceChannelName);

    source.addEventListener("presence", (event) => {
      const snapshots = JSON.parse((event as MessageEvent).data) as PresenceSnapshot[];
      setPresence((current) =>
        mergePresenceSnapshots(
          current,
          snapshots.filter((snapshot) => snapshot.id !== user.id),
        ),
      );
    });
    channel.addEventListener("message", (event) => {
      const snapshot = event.data as PresenceSnapshot;

      if (snapshot.id !== user.id) {
        setPresence((current) => mergePresenceSnapshots(current, [snapshot]));
      }
    });

    return () => {
      source.close();
      channel.close();
      void fetch(`${presenceApi}?id=${user.id}`, { method: "DELETE" });
    };
  }, [applyBoardEvent, presenceApi, presenceChannelName, roomId, user]);

  useEffect(() => {
    if (!user?.profileComplete) {
      return;
    }

    const channel = realtimeEndpoint ? null : new BroadcastChannel(presenceChannelName);
    let lastLocalSent = 0;
    let lastServerSent = 0;
    const sendPresence = (x = 0, y = 0) => {
      const now = Date.now();
      const snapshot = {
        id: user.id,
        name: user.name,
        color: user.color,
        focus: selected ? selected.title : "canvas",
        x,
        y,
        updatedAt: now,
      };

      if (channel && now - lastLocalSent >= 16) {
        lastLocalSent = now;
        channel.postMessage(snapshot);
      }

      if (realtimeEndpoint) {
        realtimeSessionRef.current?.updatePresence(snapshot);
        return;
      }

      if (now - lastServerSent < 180) {
        return;
      }

      lastServerSent = now;
      void fetch(presenceApi, {
        body: JSON.stringify(snapshot),
        headers: { "Content-Type": "application/json", ...ownerHeaders },
        method: "POST",
      });
    };

    sendPresence();
    const onPointerMove = (event: PointerEvent) => sendPresence(event.clientX, event.clientY);
    window.addEventListener("pointermove", onPointerMove);
    const interval = window.setInterval(() => sendPresence(), 3000);

    return () => {
      channel?.close();
      window.removeEventListener("pointermove", onPointerMove);
      window.clearInterval(interval);
    };
  }, [presenceApi, presenceChannelName, selected, user]);

  useEffect(() => {
    const host = hostRef.current;

    if (!host) {
      return;
    }

    const hostEl = host;
    let disposed = false;
    const app = new Application();
    const world = new Container();
    const itemLayer = new Container();
    const cursorLayer = new Container();
    const connectionGraphics = new Graphics();
    const itemMap = new Map<string, Container>();
    let draggingStage = false;
    let lastPointer = { x: 0, y: 0 };

    async function boot() {
      try {
        await app.init({
          antialias: true,
          autoDensity: true,
          backgroundAlpha: 0,
          preserveDrawingBuffer: true,
          resizeTo: hostEl,
          resolution: Math.min(window.devicePixelRatio || 1, 2),
        });
      } catch (err) {
        console.error("Failed to initialize Pixi Application:", err);
        throw err;
      }

      if (disposed) {
        try {
          app.destroy(true, { children: true });
        } catch (e) {
          console.warn("Error destroying Pixi app on early dispose:", e);
        }
        return;
      }

      hostEl.appendChild(app.canvas);
      world.position.set(hostEl.clientWidth / 2 + 80, hostEl.clientHeight / 2 - 20);
      app.stage.addChild(world, cursorLayer);
      world.addChild(connectionGraphics, itemLayer);
      sceneRef.current = { app, cursorLayer, host: hostEl, itemLayer, itemMap, world, connectionGraphics };
      setSceneReady(true);

      app.stage.eventMode = "static";
      app.stage.hitArea = app.screen;
      app.stage.on("pointerdown", (event) => {
        if (event.target !== app.stage) {
          return;
        }

        draggingStage = true;
        lastPointer = { x: event.global.x, y: event.global.y };
      });
      app.stage.on("pointerup", () => {
        draggingStage = false;
      });
      app.stage.on("pointerupoutside", () => {
        draggingStage = false;
      });
      app.stage.on("pointertap", (event) => {
        if (event.target === app.stage) {
          setSelectedId("");
        }
      });
      app.stage.on("globalpointermove", (event) => {
        if (!draggingStage) {
          return;
        }

        world.x += event.global.x - lastPointer.x;
        world.y += event.global.y - lastPointer.y;
        lastPointer = { x: event.global.x, y: event.global.y };
      });

      const onWheel = (event: WheelEvent) => {
        event.preventDefault();
        const direction = event.deltaY > 0 ? 0.92 : 1.08;
        const nextScale = Math.min(1.55, Math.max(0.62, world.scale.x * direction));
        world.scale.set(nextScale);
        setZoomPercent(Math.round(nextScale * 100));
      };

      hostEl.addEventListener("wheel", onWheel, { passive: false });

      return () => hostEl.removeEventListener("wheel", onWheel);
    }

    let cleanupWheel: (() => void) | undefined;
    boot().then((cleanup) => {
      cleanupWheel = cleanup;
    });

    return () => {
      disposed = true;
      cleanupWheel?.();
      tickerCleanupRef.current.forEach((cleanup) => cleanup());
      tickerCleanupRef.current = [];
      sceneRef.current = null;
      setSceneReady(false);
      try {
        app.destroy(true, { children: true });
      } catch (e) {
        console.warn("Error destroying Pixi app on unmount:", e);
      }
      hostEl.replaceChildren();
    };
  }, []);

  useEffect(() => {
    const scene = sceneRef.current;

    if (!sceneReady || !scene) {
      return;
    }

    tickerCleanupRef.current.forEach((cleanup) => cleanup());
    tickerCleanupRef.current = [];
    scene.itemLayer.removeChildren();
    scene.itemMap.clear();
    scene.connectionGraphics.clear();

    if (items.length === 0) {
      return;
    }

    let draggingItem: Container | null = null;
    let activeDragId = "";
    let didMove = false;
    let lastPointer = { x: 0, y: 0 };
    let disposed = false;

    const commitLocalMove = (itemId: string, x: number, y: number) => {
      const move = {
        sentAt: Date.now(),
        x: Math.round(x),
        y: Math.round(y),
      };

      draggingPositionsRef.current.delete(itemId);
      pendingMovesRef.current.set(itemId, move);
      setItems((current) =>
        current.map((item) =>
          item.id === itemId
            ? {
                ...item,
                updatedAt: Math.max(item.updatedAt, move.sentAt),
                x: move.x,
                y: move.y,
              }
            : item,
        ),
      );

      return move;
    };

    const persistMove = (itemId: string, x: number, y: number) => {
      const move = commitLocalMove(itemId, x, y);

      void fetch(roomApi, {
        body: JSON.stringify({ id: itemId, x: move.x, y: move.y }),
        headers: { "Content-Type": "application/json", ...ownerHeaders },
        method: "PATCH",
      })
        .then(async (response) => {
          if (!response.ok) {
            return null;
          }

          return (await response.json()) as { item?: RoomItem };
        })
        .then((data) => {
          if (data?.item) {
            pendingMovesRef.current.delete(itemId);
            setItems((current) => current.map((item) => (item.id === itemId ? data.item! : item)));
            publishBoardEvent({ type: "item:moved", item: data.item });
          }
        })
        .catch((error) => {
          pendingMovesRef.current.delete(itemId);
          console.warn("Failed to persist item move", error);
        });
    };

    const drawItem = (item: RoomItem) => {
      const cardSize = getCardSize(item);
      const cardWidth = cardSize.width;
      const cardHeight = cardSize.height;
      const active = selectedId === item.id;
      const imageFrame = {
        x: 12,
        y: 54,
        width: cardWidth - 24,
        height: Math.max(minImageFrameHeight, cardHeight - 118),
      };
      const root = new Container();
      const card = new Graphics();
      const typeDot = new Graphics();
      const typeLabel = new Text({
        text: item.type === "image" ? "IMAGE" : "NOTE",
        style: {
          fill: "#6a7280",
          fontFamily: pixiMonoFont,
          fontSize: 9.5,
          fontWeight: "700",
          letterSpacing: 0.7,
        },
      });
      const idText = new Text({
        text: `#${item.id.slice(0, 4).toUpperCase()}`,
        style: {
          fill: "#4a525e",
          fontFamily: pixiMonoFont,
          fontSize: 10,
          fontWeight: "600",
        },
      });
      const titleText = new Text({
        text: truncate(item.title, 48),
        style: {
          fill: "#e7eaf0",
          fontFamily: pixiFont,
          fontSize: 13,
          fontWeight: "700",
          lineHeight: 17,
          wordWrap: true,
          wordWrapWidth: cardWidth - 28,
        },
      });
      const bodyText = new Text({
        text: truncate(item.body || item.imageUrl || "", item.type === "image" ? 74 : 96),
        style: {
          fill: "#9ba3b0",
          fontFamily: pixiFont,
          fontSize: 12,
          fontWeight: "500",
          lineHeight: 18,
          wordWrap: true,
          wordWrapWidth: cardWidth - 28,
        },
      });
      const commentText = new Text({
        text: `${item.comments.length} comment${item.comments.length === 1 ? "" : "s"}`,
        style: {
          fill: "#9ba3b0",
          fontFamily: pixiMonoFont,
          fontSize: 10.5,
          fontWeight: "700",
        },
      });
      const authorText = new Text({
        text: item.author ? truncate(item.author, 14) : "Roomboard",
        style: {
          fill: "#6a7280",
          fontFamily: pixiFont,
          fontSize: 11,
          fontWeight: "600",
        },
      });

      root.position.set(item.x, item.y);
      root.eventMode = "static";
      root.cursor = "pointer";
      typeDot.roundRect(0, 0, 6, 6, 1.5).fill({ color: toColor(item.color) });
      typeDot.position.set(12, 14);
      typeLabel.position.set(24, 11);
      idText.position.set(cardWidth - 56, 11);
      titleText.position.set(12, item.type === "image" ? cardHeight - 56 : 44);
      
      if (item.type === "image") {
        bodyText.visible = true;
        if (item.imageUrl) {
          bodyText.text = truncate(item.body || "Image Reference", 40);
          bodyText.style.fontSize = 11;
          bodyText.style.fill = "#6a7280";
          bodyText.style.wordWrapWidth = cardWidth - 32;
          bodyText.position.set(12, cardHeight - 36);
        } else {
          titleText.position.set(12, 48);
          bodyText.text = truncate(item.body || "No image URL. Click to edit.", 72);
          bodyText.style.fill = "#9ba3b0";
          bodyText.style.wordWrapWidth = cardWidth - 32;
          bodyText.position.set(12, 76);
        }
      } else {
        bodyText.visible = true;
        bodyText.position.set(12, 72);
      }
      commentText.position.set(12, cardHeight - 22);
      authorText.position.set(cardWidth - Math.min(96, authorText.width + 12), cardHeight - 22);
      
      root.addChild(card, typeDot, typeLabel, idText, titleText, bodyText, commentText, authorText);

      if (item.type === "image" && item.imageUrl) {
        const linkPill = new Container();
        const pillBg = new Graphics();
        const domain = getDomain(item.imageUrl);
        const truncatedDomain = truncate(domain, 14);
        const linkText = new Text({
          text: truncatedDomain,
          style: {
            fill: "#3d7eff",
            fontFamily: pixiMonoFont,
            fontSize: 9.5,
            fontWeight: "600",
          },
        });
        
        linkPill.addChild(pillBg, linkText);
        
        const pillW = 120;
        const pillH = 22;
        
        linkText.anchor.set(0.5);
        linkText.position.set(pillW / 2, pillH / 2);
        
        const drawPill = (hovered = false) => {
          pillBg.clear();
          pillBg.roundRect(0, 0, pillW, pillH, 999)
            .fill({ alpha: hovered ? 0.18 : 0.11, color: 0x3d7eff });
          pillBg.roundRect(0, 0, pillW, pillH, 999)
            .stroke({ alpha: hovered ? 0.55 : 0.28, color: 0x3d7eff, width: 1 });
        };
        
        drawPill(false);
        linkPill.position.set(cardWidth - pillW - 10, cardHeight - 27);
        linkPill.eventMode = "static";
        linkPill.cursor = "pointer";
        
        linkPill.on("pointerover", () => drawPill(true));
        linkPill.on("pointerout", () => drawPill(false));
        linkPill.on("pointertap", (e) => {
          e.stopPropagation();
          window.open(item.imageUrl, "_blank", "noopener,noreferrer");
        });
        
        root.addChild(linkPill);
      }

      if (item.type === "image" && item.imageUrl) {
        loadImageTexture(item.imageUrl).then((texture) => {
          if (disposed || !texture) return;
          const sprite = new Sprite(texture);
          const imageW = imageFrame.width;
          const imageH = imageFrame.height;
          
          const scale = Math.max(imageW / texture.width, imageH / texture.height);
          sprite.width = texture.width * scale;
          sprite.height = texture.height * scale;
          
          sprite.x = imageFrame.x + (imageW - sprite.width) / 2;
          sprite.y = imageFrame.y + (imageH - sprite.height) / 2;
          
          const mask = new Graphics();
          mask.roundRect(imageFrame.x, imageFrame.y, imageW, imageH, 6).fill({ color: 0xffffff });
          sprite.mask = mask;
          
          root.addChildAt(sprite, 1);
          root.addChildAt(mask, 1);
        }).catch((err) => {
          console.error("Failed to load image texture:", err);
        });
      }

      const repaint = () => {
        card.clear();
        const fill = mixHex(item.color, "#1a1e26", item.type === "image" ? 0.035 : 0.07);

        card.roundRect(0, 0, cardWidth, cardHeight, 8).fill({ alpha: 0.98, color: fill });
        card.rect(0, 0, 3, cardHeight).fill({ color: toColor(item.color) });
        card.rect(3, 34, cardWidth - 3, 1).fill({ alpha: 0.95, color: 0x1d2128 });
        card.rect(3, cardHeight - 32, cardWidth - 3, 1).fill({ alpha: 0.95, color: 0x1d2128 });
        card.rect(3, cardHeight - 31, cardWidth - 3, 31).fill({ alpha: 0.52, color: 0x20242d });

        if (item.type === "image" && item.imageUrl) {
          card.roundRect(imageFrame.x, imageFrame.y, imageFrame.width, imageFrame.height, 6).fill({ color: 0x0a0c10 });
        }

        if (item.type === "image" && !item.imageUrl) {
          card.roundRect(imageFrame.x, imageFrame.y, imageFrame.width, imageFrame.height, 6).fill({ alpha: 0.72, color: 0x0a0c10 });
          card.roundRect(imageFrame.x, imageFrame.y, imageFrame.width, imageFrame.height, 6).stroke({ alpha: 0.8, color: 0x232830, width: 1 });
        }

        card.roundRect(0, 0, cardWidth, cardHeight, 8).stroke({
          alpha: active ? 1 : 0.95,
          color: active ? 0x3d7eff : 0x232830,
          width: active ? 2 : 1,
        });
      };

      root.on("pointertap", () => {
        if (!didMove) {
          if (isConnectingRef.current) {
            const fromId = connectFromIdRef.current;
            if (!fromId) {
              setConnectFromId(item.id);
            } else if (fromId === item.id) {
              setConnectFromId(null);
            } else {
              void handleCreateConnection(fromId, item.id);
              setConnectFromId(null);
              setIsConnecting(false);
            }
          } else {
            setSelectedId(item.id);
          }
        }
      });

      root.on("pointerdown", (event) => {
        draggingItem = root;
        activeDragId = item.id;
        didMove = false;
        lastPointer = { x: event.global.x, y: event.global.y };
        draggingPositionsRef.current.set(item.id, { x: root.x, y: root.y });
      });

      const endDrag = () => {
        if (draggingItem && activeDragId) {
          if (didMove) {
            persistMove(activeDragId, draggingItem.x, draggingItem.y);
          } else {
            draggingPositionsRef.current.delete(activeDragId);
          }
        }

        draggingItem = null;
        activeDragId = "";
      };

      root.on("pointerup", endDrag);
      root.on("pointerupoutside", endDrag);
      root.on("globalpointermove", (event) => {
        if (draggingItem !== root) {
          return;
        }

        const dx = (event.global.x - lastPointer.x) / scene.world.scale.x;
        const dy = (event.global.y - lastPointer.y) / scene.world.scale.y;

        if (Math.abs(dx) + Math.abs(dy) > 1) {
          didMove = true;
        }

        root.x += dx;
        root.y += dy;
        draggingPositionsRef.current.set(activeDragId, { x: root.x, y: root.y });
        lastPointer = { x: event.global.x, y: event.global.y };
      });

      scene.app.ticker.add(repaint);
      tickerCleanupRef.current.push(() => scene.app.ticker.remove(repaint));
      scene.itemLayer.addChild(root);
      scene.itemMap.set(item.id, root);
    };

    for (const item of items) {
      drawItem(item);
    }

    const drawConnections = () => {
      scene.connectionGraphics.clear();
      
      for (const c of connections) {
        const fromContainer = scene.itemMap.get(c.from);
        const toContainer = scene.itemMap.get(c.to);
        if (!fromContainer || !toContainer) continue;

        const fromItem = items.find(item => item.id === c.from);
        const toItem = items.find(item => item.id === c.to);
        if (!fromItem || !toItem) continue;

        const fromSize = getCardSize(fromItem);
        const toSize = getCardSize(toItem);
        const fromWidth = fromSize.width;
        const fromHeight = fromSize.height;
        const toWidth = toSize.width;
        const toHeight = toSize.height;

        const p1 = {
          x: fromContainer.x + fromWidth / 2,
          y: fromContainer.y + fromHeight / 2
        };

        const p2 = {
          x: toContainer.x + toWidth / 2,
          y: toContainer.y + toHeight / 2
        };

        const dx = p2.x - p1.x;
        const dy = p2.y - p1.y;
        const len = Math.sqrt(dx * dx + dy * dy);
        if (len < 5) continue;

        const perpX = -dy / len;
        const perpY = dx / len;
        const ctrl = {
          x: (p1.x + p2.x) / 2 + perpX * 45,
          y: (p1.y + p2.y) / 2 + perpY * 45
        };

        const startPt = getRectIntersection(ctrl, p1, {
          x: fromContainer.x,
          y: fromContainer.y,
          width: fromWidth,
          height: fromHeight
        });

        const endPt = getRectIntersection(ctrl, p2, {
          x: toContainer.x,
          y: toContainer.y,
          width: toWidth,
          height: toHeight
        });

        const active = selectedId === c.from || selectedId === c.to;
        const colorStr = active ? c.color || fromItem.color || "#3d7eff" : "#6a7280";
        const color = toColor(colorStr);

        scene.connectionGraphics.moveTo(startPt.x, startPt.y);
        scene.connectionGraphics.quadraticCurveTo(ctrl.x, ctrl.y, endPt.x, endPt.y);
        scene.connectionGraphics.stroke({ color, width: active ? 2 : 1.5, alpha: active ? 0.95 : 0.55 });

        const angle = Math.atan2(endPt.y - ctrl.y, endPt.x - ctrl.x);
        const arrowSize = 10;
        const arrowX1 = endPt.x - arrowSize * Math.cos(angle - Math.PI / 6);
        const arrowY1 = endPt.y - arrowSize * Math.sin(angle - Math.PI / 6);
        const arrowX2 = endPt.x - arrowSize * Math.cos(angle + Math.PI / 6);
        const arrowY2 = endPt.y - arrowSize * Math.sin(angle + Math.PI / 6);

        scene.connectionGraphics.poly([endPt.x, endPt.y, arrowX1, arrowY1, arrowX2, arrowY2]).fill({ color, alpha: active ? 0.95 : 0.6 });
      }
    };

    scene.app.ticker.add(drawConnections);
    tickerCleanupRef.current.push(() => scene.app.ticker.remove(drawConnections));

    return () => {
      disposed = true;
    };
  }, [items, connections, publishBoardEvent, sceneReady, selectedId]);

  useEffect(() => {
    const scene = sceneRef.current;

    if (!scene) {
      return;
    }

    scene.cursorLayer.removeChildren();

    for (const snapshot of presence) {
      if (snapshot.x === 0 && snapshot.y === 0) {
        continue;
      }

      const cursor = new Container();
      const shape = new Graphics();
      const pill = new Graphics();
      const label = new Text({
        text: snapshot.name,
        style: {
          fill: "#ffffff",
          fontFamily: pixiFont,
          fontSize: 10.5,
          fontWeight: "700",
        },
      });

      const hostRect = scene.host.getBoundingClientRect();
      cursor.position.set(snapshot.x - hostRect.left, snapshot.y - hostRect.top);
      cursor.eventMode = "none";
      shape.poly([0, 0, 16, 7, 7, 13]).fill(toColor(snapshot.color));
      pill.roundRect(0, 0, label.width + 14, 20, 5).fill({ color: toColor(snapshot.color), alpha: 0.98 });
      pill.position.set(12, 15);
      label.position.set(19, 17);
      cursor.addChild(shape, pill, label);
      scene.cursorLayer.addChild(cursor);
    }
  }, [presence]);

  const createItem = async (type: "image" | "note", url?: string, size?: { width: number; height: number }) => {
    if (!user?.profileComplete) {
      requestProfile();
      return;
    }

    const response = await fetch(roomApi, {
      body: JSON.stringify({
        action: "item",
        author: user.name,
        body: type === "image" ? "Reference image for review." : "New note",
        color: user.color,
        height: size?.height,
        imageUrl: url,
        title: type === "image" ? "Image reference" : "Untitled note",
        type,
        width: size?.width,
      }),
      headers: { "Content-Type": "application/json", ...ownerHeaders },
      method: "POST",
    });
    const data = (await response.json()) as { item?: RoomItem };

    if (data.item) {
      setItems((current) => {
        const next = new Map(current.map((item) => [item.id, item]));
        next.set(data.item!.id, data.item!);
        return Array.from(next.values()).sort((a, b) => a.createdAt - b.createdAt);
      });
      setSelectedId(data.item.id);
      publishBoardEvent({ type: "item:created", item: data.item });
    }
  };

  const createImageFromFile = async (file: File) => {
    if (!user?.profileComplete) {
      requestProfile();
      return;
    }

    if (!file.type.startsWith("image/")) {
      return;
    }

    const localPreviewUrl = URL.createObjectURL(file);
    const imageSize = await getImageDimensions(localPreviewUrl)
      .then((dimensions) => getImageCardSize(dimensions.width, dimensions.height))
      .catch(() => getImageCardSize())
      .finally(() => URL.revokeObjectURL(localPreviewUrl));

    const formData = new FormData();
    formData.append("file", file);
    formData.append("roomId", roomId);

    const response = await fetch("/api/uploads", {
      body: formData,
      method: "POST",
    });
    const data = (await response.json()) as { url?: string };

    if (data.url) {
      await createItem("image", data.url, imageSize);
    }
  };

  const createImageFromUrl = async (url: string) => {
    const trimmedUrl = url.trim();
    const imageSize = await getImageDimensions(trimmedUrl)
      .then((dimensions) => getImageCardSize(dimensions.width, dimensions.height))
      .catch(() => getImageCardSize());

    await createItem("image", trimmedUrl, imageSize);
  };

  const saveSelected = async () => {
    if (!selected) {
      return;
    }

    const nextImageSize =
      selected.type === "image" && imageUrl.trim() && imageUrl.trim() !== (selected.imageUrl ?? "")
        ? await getImageDimensions(imageUrl.trim())
            .then((dimensions) => getImageCardSize(dimensions.width, dimensions.height))
            .catch(() => undefined)
        : undefined;

    const response = await fetch(roomApi, {
      body: JSON.stringify({
        body: draftBody,
        height: nextImageSize?.height,
        id: selected.id,
        imageUrl,
        title: draftTitle,
        width: nextImageSize?.width,
      }),
      headers: { "Content-Type": "application/json", ...ownerHeaders },
      method: "PATCH",
    });
    const data = (await response.json()) as { item?: RoomItem };

    if (data.item) {
      setItems((current) => current.map((item) => (item.id === data.item!.id ? data.item! : item)));
      publishBoardEvent({ type: "item:updated", item: data.item });
    }
  };

  const submitComment = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (!selected || !user?.profileComplete || comment.trim().length === 0) {
      if (!user?.profileComplete) {
        requestProfile();
      }
      return;
    }

    const response = await fetch(roomApi, {
      body: JSON.stringify({
        action: "comment",
        author: user.name,
        body: comment,
        color: user.color,
        itemId: selected.id,
      }),
      headers: { "Content-Type": "application/json", ...ownerHeaders },
      method: "POST",
    });
    const data = (await response.json()) as { comment?: RoomItem["comments"][number] };

    if (data.comment) {
      setItems((current) =>
        current.map((item) =>
          item.id === selected.id
            ? {
                ...item,
                comments: item.comments.some((entry) => entry.id === data.comment!.id)
                  ? item.comments
                  : [...item.comments, data.comment!],
                updatedAt: Math.max(item.updatedAt, data.comment!.createdAt),
              }
            : item,
        ),
      );
      publishBoardEvent({ type: "comment:created", comment: data.comment, itemId: selected.id });
    }

    setComment("");
  };

  const handleCreateConnection = async (fromId: string, toId: string) => {
    if (!user?.profileComplete) {
      requestProfile();
      return;
    }

    const response = await fetch(roomApi, {
      body: JSON.stringify({
        action: "connection",
        from: fromId,
        to: toId,
        color: user?.color || "#48a7ff",
      }),
      headers: { "Content-Type": "application/json", ...ownerHeaders },
      method: "POST",
    });
    const data = (await response.json()) as { connection?: RoomConnection };

    if (data.connection) {
      setConnections((current) => {
        const next = new Map(current.map((connection) => [connection.id, connection]));
        next.set(data.connection!.id, data.connection!);
        return Array.from(next.values());
      });
      publishBoardEvent({ type: "connection:created", connection: data.connection });
    }
  };

  const handleDeleteConnection = async (connId: string) => {
    const response = await fetch(roomApi, {
      body: JSON.stringify({
        action: "delete-connection",
        connectionId: connId,
      }),
      headers: { "Content-Type": "application/json", ...ownerHeaders },
      method: "POST",
    });
    const data = (await response.json()) as { ok?: boolean };

    if (data.ok) {
      setConnections((current) => current.filter((connection) => connection.id !== connId));
      publishBoardEvent({ type: "connection:deleted", connectionId: connId });
    }
  };

  const handleDeleteItem = async (itemId: string) => {
    if (!itemId) return;

    const response = await fetch(roomApi, {
      body: JSON.stringify({
        action: "delete-item",
        id: itemId,
      }),
      headers: { "Content-Type": "application/json", ...ownerHeaders },
      method: "POST",
    });
    const data = (await response.json()) as { ok?: boolean };

    if (data.ok) {
      setItems((current) => current.filter((item) => item.id !== itemId));
      setConnections((current) => current.filter((connection) => connection.from !== itemId && connection.to !== itemId));
      publishBoardEvent({ type: "item:deleted", itemId });
    }

    if (selectedId === itemId) {
      setSelectedId("");
    }
  };

  const toggleRoomAccess = async () => {
    if (!ownerToken) {
      return;
    }

    const nextAccess: RoomAccess = roomAccess === "locked" ? "link" : "locked";
    const response = await fetch(roomApi, {
      body: JSON.stringify({ action: "access", access: nextAccess }),
      headers: { "Content-Type": "application/json", ...ownerHeaders },
      method: "PATCH",
    });

    if (response.ok) {
      setRoomAccessState(nextAccess);
      const data = (await response.json()) as { room?: RoomSnapshot["room"] };

      if (data.room) {
        publishBoardEvent({ type: "room:updated", room: data.room });
      }
    }
  };

  const closeRoom = async () => {
    setIsClosingRoom(true);

    try {
      const response = await fetch(roomApi, { headers: ownerHeaders, method: "DELETE" });

      if (response.ok || response.status === 404) {
        if (response.ok) {
          const data = (await response.json()) as { room?: RoomSnapshot["room"] };
          publishBoardEvent({ type: "room:closed", room: data.room });
        }

        router.push("/");
      }
    } finally {
      setIsClosingRoom(false);
      setShowCloseModal(false);
    }
  };

  // Zoom handlers
  const handleZoomIn = () => {
    const scene = sceneRef.current;
    if (!scene) return;
    const nextScale = Math.min(1.55, scene.world.scale.x * 1.15);
    scene.world.scale.set(nextScale);
    setZoomPercent(Math.round(nextScale * 100));
  };

  const handleZoomOut = () => {
    const scene = sceneRef.current;
    if (!scene) return;
    const nextScale = Math.max(0.62, scene.world.scale.x / 1.15);
    scene.world.scale.set(nextScale);
    setZoomPercent(Math.round(nextScale * 100));
  };

  const handleZoomReset = () => {
    const scene = sceneRef.current;
    if (!scene) return;
    scene.world.scale.set(1.0);
    setZoomPercent(100);
  };

  const handleZoomFit = () => {
    const scene = sceneRef.current;
    if (!scene || items.length === 0) return;

    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    items.forEach((item) => {
      const size = getCardSize(item);
      minX = Math.min(minX, item.x);
      minY = Math.min(minY, item.y);
      maxX = Math.max(maxX, item.x + size.width);
      maxY = Math.max(maxY, item.y + size.height);
    });

    const padding = 60;
    const boardW = maxX - minX + padding * 2;
    const boardH = maxY - minY + padding * 2;

    const hostW = scene.host.clientWidth;
    const hostH = scene.host.clientHeight;

    let idealScale = Math.min(hostW / boardW, hostH / boardH);
    idealScale = Math.min(1.55, Math.max(0.62, idealScale));

    scene.world.scale.set(idealScale);

    const centerX = minX + (maxX - minX) / 2;
    const centerY = minY + (maxY - minY) / 2;

    scene.world.x = hostW / 2 - centerX * idealScale;
    scene.world.y = hostH / 2 - centerY * idealScale;

    setZoomPercent(Math.round(idealScale * 100));
  };

  // Keyboard integration
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      const activeEl = document.activeElement;
      if (
        activeEl &&
        (activeEl.tagName === "INPUT" ||
          activeEl.tagName === "TEXTAREA" ||
          activeEl.getAttribute("contenteditable") === "true")
      ) {
        return;
      }

      if (event.key === "Delete" || event.key === "Backspace") {
        if (selectedId) {
          event.preventDefault();
          void handleDeleteItem(selectedId);
        }
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [selectedId]);

  const onDrop = async (event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    setIsDraggingImage(false);
    const file = event.dataTransfer.files[0];

    if (!file) {
      return;
    }

    await createImageFromFile(file);
  };

  const selectedConnections = selected
    ? connections.filter((connection) => connection.from === selected.id || connection.to === selected.id)
    : [];
  const peopleCount = presence.length + 1;

  return (
    <div className="rb-app" data-theme="dark">
      <div
        ref={hostRef}
        className={`canvas-host rb-canvas-wrap ${isConnecting ? "linking" : ""}`}
        onDragEnter={(event) => {
          event.preventDefault();
          if (Array.from(event.dataTransfer.items).some((item) => item.type.startsWith("image/"))) {
            setIsDraggingImage(true);
          }
        }}
        onDragLeave={(event) => {
          if (event.currentTarget === event.target) {
            setIsDraggingImage(false);
          }
        }}
        onDragOver={(event) => event.preventDefault()}
        onDrop={onDrop}
      />
      {isDraggingImage && (
        <div className="drop-target-overlay">
          <div>
            <Upload size={18} aria-hidden="true" />
            <span>Drop image to add it to the board</span>
          </div>
        </div>
      )}

      <header className="rb-header">
        <div className="rb-header__left">
          <div className="rb-logo" aria-label="Roomboard">
            <span className="rb-logo__mark">
              <LayoutGrid size={12} aria-hidden="true" />
            </span>
            <h1 className="header-title rb-logo__word">Roomboard</h1>
          </div>
          <div className="rb-breadcrumb" aria-label="Current room">
            <span className="rb-breadcrumb__sep">/</span>
            <span className="rb-breadcrumb__name">{displayRoomName}</span>
          </div>
          <span className={`rb-status ${roomAccess === "locked" ? "locked" : ""}`}>
            <span className="rb-status__dot" />
            {roomAccess === "locked" ? "Creator only" : "Anyone with link"}
          </span>
        </div>

        <div className="rb-header__right">
          <div className="rb-presence" aria-label={`${peopleCount} people in room`}>
            {user && (
              <button
                className="rb-presence__avatar you"
                onClick={() => {
                  setTempName(user.name);
                  setTempColor(user.color);
                  setRequiresProfile(false);
                  setShowProfileModal(true);
                }}
                style={{ backgroundColor: user.color }}
                title="Customize profile"
                type="button"
              >
                {getInitials(user.name)}
              </button>
            )}
            {presence.slice(0, 4).map((snapshot) => (
              <span
                className="rb-presence__avatar"
                key={snapshot.id}
                style={{ backgroundColor: snapshot.color }}
                title={snapshot.name}
              >
                {getInitials(snapshot.name)}
              </span>
            ))}
            <span className="rb-presence__count">{peopleCount}</span>
          </div>
          <span className="rb-divider" />
          {ownerToken && (
            <>
              <button className="rb-btn" onClick={() => void toggleRoomAccess()} type="button">
                {roomAccess === "locked" ? (
                  <UnlockKeyhole size={14} aria-hidden="true" />
                ) : (
                  <LockKeyhole size={14} aria-hidden="true" />
                )}
                <span>{roomAccess === "locked" ? "Unlock" : "Lock"}</span>
              </button>
              <button className="rb-btn" onClick={() => setShowCloseModal(true)} type="button">
                <Archive size={14} aria-hidden="true" />
                <span>Close</span>
              </button>
            </>
          )}
          <button
            className="rb-btn primary"
            onClick={async () => {
              await navigator.clipboard.writeText(window.location.href);
              setCopiedShare(true);
              window.setTimeout(() => setCopiedShare(false), 1400);
            }}
            type="button"
          >
            <Copy size={14} aria-hidden="true" />
            <span>{copiedShare ? "Copied" : "Share"}</span>
          </button>
        </div>
      </header>

      {isConnecting && (
        <div className="rb-banner">
          <Link2 size={13} aria-hidden="true" />
          <span>
            {connectFromId 
              ? `Select destination for "${items.find((item) => item.id === connectFromId)?.title || "card"}"` 
              : "Select source card to create a connection"}
          </span>
          <button 
            className="rb-btn ghost sm"
            onClick={() => { setIsConnecting(false); setConnectFromId(null); }}
            type="button"
          >
            Cancel
          </button>
        </div>
      )}

      <div className="rb-toolbar" aria-label="Canvas tools">
        <button
          className={`rb-tool ${isConnecting ? "" : "active"}`}
          onClick={() => {
            setIsConnecting(false);
            setConnectFromId(null);
          }}
          type="button"
        >
          <MousePointer2 size={14} aria-hidden="true" />
          <span>Select</span>
        </button>
        <button aria-label="Add note" className="rb-tool" onClick={() => void createItem("note")} type="button">
          <StickyNote size={14} aria-hidden="true" />
          <span>Add note</span>
        </button>
        <button
          className={`rb-tool ${isConnecting ? "active" : ""}`}
          onClick={() => {
            setIsConnecting(!isConnecting);
            setConnectFromId(null);
          }}
          type="button"
        >
          <Link2 size={14} aria-hidden="true" />
          <span>{isConnecting ? "Linking" : "Link"}</span>
        </button>
        <span className="rb-toolbar__sep" />
        <form
          className="rb-toolbar__url"
          onSubmit={(event) => {
            event.preventDefault();
            if (toolbarImageUrl.trim()) {
              void createImageFromUrl(toolbarImageUrl);
              setToolbarImageUrl("");
            }
          }}
        >
          <FileImage size={12} aria-hidden="true" />
          <input
            aria-label="Image URL"
            onChange={(event) => setToolbarImageUrl(event.target.value)}
            placeholder="Paste image URL"
            value={toolbarImageUrl}
          />
          <button aria-label="Add image from URL" type="submit">
            Add
          </button>
        </form>
        <input
          ref={fileInputRef}
          accept="image/*"
          aria-hidden="true"
          className="file-upload-input"
          onChange={(event) => {
            const file = event.target.files?.[0];
            if (file) {
              void createImageFromFile(file);
            }
            event.currentTarget.value = "";
          }}
          tabIndex={-1}
          type="file"
        />
        <button className="rb-tool" onClick={() => fileInputRef.current?.click()} type="button">
          <Upload size={14} aria-hidden="true" />
          <span>Upload</span>
        </button>
      </div>

      <aside className={`rb-inspector ${selected ? "" : "empty"}`} aria-label="Selected item details">
        <div className="rb-inspector__head">
          <span className="rb-inspector__type">
            <span className="presence-dot" style={{ background: selected?.color ?? "var(--accent)" }} />
            {selected ? selected.type : "Board"}
          </span>
          <button
            aria-label="Close inspector"
            className="rb-inspector__close"
            disabled={!selected}
            onClick={() => setSelectedId("")}
            type="button"
          >
            <X size={14} aria-hidden="true" />
          </button>
        </div>
        {selected ? (
          <div className="rb-inspector__body">
            <div className="rb-field">
              <label className="rb-field__label" htmlFor="room-title">Title</label>
              <input
                className="rb-input"
                id="room-title"
                onBlur={() => void saveSelected()}
                onChange={(event) => setDraftTitle(event.target.value)}
                value={draftTitle}
              />
            </div>

            <div className="rb-field">
              <span className="rb-field__label">Color</span>
              <div className="rb-color-swatches">
                {colors.map((c) => (
                  <button
                    aria-label={`Set color ${c}`}
                    className={`rb-color-swatch ${selected.color === c ? "selected" : ""}`}
                    key={c}
                    onClick={async () => {
                      const response = await fetch(roomApi, {
                        body: JSON.stringify({ id: selected.id, color: c }),
                        headers: { "Content-Type": "application/json", ...ownerHeaders },
                        method: "PATCH",
                      });
                      const data = (await response.json()) as { item?: RoomItem };

                      if (data.item) {
                        setItems((current) => current.map((item) => (item.id === data.item!.id ? data.item! : item)));
                        publishBoardEvent({ type: "item:updated", item: data.item });
                      }
                    }}
                    style={{ backgroundColor: c }}
                    type="button"
                  />
                ))}
              </div>
            </div>

            <div className="rb-field">
              <label className="rb-field__label" htmlFor="room-body">Notes</label>
              <textarea
                className="rb-input"
                id="room-body"
                onBlur={() => void saveSelected()}
                onChange={(event) => setDraftBody(event.target.value)}
                rows={4}
                value={draftBody}
              />
            </div>

            {selected.type === "image" ? (
              <div className="rb-field">
                <label className="rb-field__label" htmlFor="room-image-url">Image link</label>
                <input
                  className="rb-input"
                  id="room-image-url"
                  onBlur={() => void saveSelected()}
                  onChange={(event) => setImageUrl(event.target.value)}
                  placeholder="Enter image URL"
                  value={imageUrl}
                />
                {selected.imageUrl ? (
                  <div className="rb-image-preview">
                    <img alt={selected.title} src={selected.imageUrl} />
                  </div>
                ) : null}
              </div>
            ) : null}

            <div className="rb-inspector__section">
              <div className="rb-inspector__section-title">
                Connections <span className="count">{selectedConnections.length}</span>
              </div>
              {selectedConnections.length > 0 ? (
                selectedConnections.map((connection) => {
                  const otherId = connection.from === selected.id ? connection.to : connection.from;
                  const otherItem = items.find((item) => item.id === otherId);
                  const relation = connection.from === selected.id ? "to" : "from";

                  return (
                    <div className="rb-conn-row" key={connection.id}>
                      <Link2 size={12} aria-hidden="true" />
                      <span className="name">{otherItem ? truncate(otherItem.title, 24) : "Unknown card"}</span>
                      <span className="type">{relation}</span>
                      <button
                        aria-label="Delete connection"
                        onClick={() => void handleDeleteConnection(connection.id)}
                        type="button"
                      >
                        <X size={12} aria-hidden="true" />
                      </button>
                    </div>
                  );
                })
              ) : (
                <p className="rb-empty-copy">No connections yet.</p>
              )}
            </div>

            <div className="rb-inspector__section">
              <div className="rb-inspector__section-title">
                Comments <span className="count">{selected.comments.length}</span>
              </div>
              {selected.comments.length > 0 ? (
                selected.comments.map((entry) => (
                  <div className="rb-comment" key={entry.id}>
                    <div className="rb-comment__head">
                      <span className="rb-comment__avatar" style={{ background: entry.color }}>
                        {getInitials(entry.author)}
                      </span>
                      <span className="rb-comment__name">{entry.author}</span>
                    </div>
                    <div className="rb-comment__body">{entry.body}</div>
                  </div>
                ))
              ) : (
                <p className="rb-empty-copy">No comments yet.</p>
              )}
              <form className="rb-comment-compose" onSubmit={submitComment}>
                <input
                  aria-label="Add comment"
                  onChange={(event) => setComment(event.target.value)}
                  placeholder="Add a comment"
                  value={comment}
                />
                <button disabled={comment.trim().length === 0} type="submit">
                  <Send size={13} aria-hidden="true" />
                </button>
              </form>
            </div>

            <div className="rb-inspector__danger">
              <button
                className="rb-btn danger-line"
                onClick={() => void handleDeleteItem(selected.id)}
                type="button"
              >
                <Trash2 size={14} aria-hidden="true" />
                Delete card
              </button>
            </div>
          </div>
        ) : (
          <div className="rb-inspector__body">
            <MessageSquarePlus size={22} aria-hidden="true" />
            <h2>Nothing selected</h2>
            <p>Select a note or image to inspect details, links, and comments.</p>
          </div>
        )}
      </aside>

      <div className="rb-coords" aria-hidden="true">
        <div className="rb-coords__chip"><span className="rb-coords__label">objects</span>{items.length}</div>
        <div className="rb-coords__chip"><span className="rb-coords__label">links</span>{connections.length}</div>
        <div className="rb-coords__chip"><span className="rb-coords__label">sync</span>{realtimeEndpoint ? "elixir" : "local"}</div>
      </div>

      <div className="rb-zoom">
        <button onClick={handleZoomOut} title="Zoom out" type="button">
          <ZoomOut size={14} aria-hidden="true" />
        </button>
        <div className="rb-zoom__level">{zoomPercent}%</div>
        <button onClick={handleZoomIn} title="Zoom in" type="button">
          <ZoomIn size={14} aria-hidden="true" />
        </button>
        <span className="rb-zoom__sep" />
        <button onClick={handleZoomFit} title="Fit all elements" type="button">
          <Maximize2 size={13} aria-hidden="true" />
        </button>
      </div>

      <div className="room-presence" aria-hidden="true">
        <div className="ui-card-title">{peopleCount}</div>
        <div>people in room</div>
      </div>

      {showCloseModal && (
        <div className="rb-modal-scrim" onClick={() => setShowCloseModal(false)}>
          <div className="rb-modal" onClick={(event) => event.stopPropagation()}>
            <div className="rb-modal__head">
              <div className="rb-modal__eyebrow">Room state</div>
              <div className="rb-modal__title">Close this room?</div>
              <div className="rb-modal__sub">
                The room leaves the dashboard and active collaborators return home.
              </div>
            </div>
            <div className="rb-modal__foot">
              <button className="rb-btn ghost" onClick={() => setShowCloseModal(false)} type="button">
                Keep open
              </button>
              <button className="rb-btn primary" disabled={isClosingRoom} onClick={() => void closeRoom()} type="button">
                <Archive size={13} aria-hidden="true" />
                {isClosingRoom ? "Closing" : "Close room"}
              </button>
            </div>
          </div>
        </div>
      )}

      {showProfileModal && (
        <div className="rb-modal-scrim" onClick={() => !requiresProfile && setShowProfileModal(false)}>
          <div className="rb-modal" onClick={(event) => event.stopPropagation()}>
            <div className="rb-modal__head">
              <div className="rb-modal__eyebrow">Live session</div>
              <div className="rb-modal__title">{requiresProfile ? `Join "${displayRoomName}"` : "Customize profile"}</div>
              <div className="rb-modal__sub">
                Pick a display name and cursor color for realtime presence.
              </div>
            </div>
            <div className="rb-modal__body">
              <div className="rb-modal__row">
                <label className="rb-field__label" htmlFor="profile-name">Display name</label>
                <input
                  autoFocus
                  className="rb-input"
                  id="profile-name"
                  onChange={(event) => setTempName(event.target.value.slice(0, 24))}
                  placeholder="Enter your name"
                  value={tempName}
                />
              </div>
              <div className="rb-modal__row">
                <span className="rb-field__label">Cursor color</span>
                <div className="rb-color-pick">
                  {colors.map((c) => (
                    <button
                      className={tempColor === c ? "sel" : ""}
                      key={c}
                      onClick={() => setTempColor(c)}
                      style={{ background: c }}
                      type="button"
                    />
                  ))}
                </div>
              </div>
            </div>
            <div className="rb-modal__foot">
              {!requiresProfile && (
                <button className="rb-btn ghost" onClick={() => setShowProfileModal(false)} type="button">
                  Cancel
                </button>
              )}
              <button
                className="rb-btn primary"
                disabled={tempName.trim().length === 0}
                onClick={() => {
                  if (tempName.trim() && user) {
                    const updatedUser = {
                      ...user,
                      name: tempName.trim(),
                      color: tempColor,
                      profileComplete: true,
                    };
                    setUser(updatedUser);
                    setRequiresProfile(false);
                    localStorage.setItem(localUserKey, JSON.stringify(updatedUser));
                    setShowProfileModal(false);
                  }
                }}
                type="button"
              >
                {requiresProfile ? "Join room" : "Save changes"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
