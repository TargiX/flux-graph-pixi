"use client";

import { FormEvent, useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { 
  Archive,
  FileImage, 
  MessageSquarePlus, 
  MousePointer2, 
  Plus, 
  Send, 
  StickyNote, 
  UsersRound,
  Link2,
  Trash2,
  X,
  ZoomIn,
  ZoomOut,
  Maximize2,
  Sparkles,
  Copy,
  LayoutGrid,
  LockKeyhole,
  Upload,
  UnlockKeyhole
} from "lucide-react";
import { Application, Container, Graphics, Text, Sprite, Texture } from "pixi.js";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { Textarea } from "@/components/ui/textarea";
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

const colors = ["#ffd166", "#0ea5e9", "#10b981", "#f43f5e", "#6366f1"];
const localUserKey = "canvas-room-user";
const realtimeEndpoint = process.env.NEXT_PUBLIC_ROOMBOARD_REALTIME_URL?.trim() ?? "";
const imageCardChromeHeight = 128;
const imageCardPaddingX = 32;
const minImageFrameWidth = 220;
const maxImageFrameWidth = 420;
const minImageFrameHeight = 116;
const maxImageFrameHeight = 320;

function toColor(hex: string) {
  return Number.parseInt(hex.replace("#", ""), 16);
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

  const selected = items.find((item) => item.id === selectedId) ?? items[0];
  const roomApi = `/api/rooms/${roomId}`;
  const roomStreamApi = ownerToken ? `${roomApi}?ownerToken=${encodeURIComponent(ownerToken)}` : roomApi;
  const presenceApi = `${roomApi}/presence`;
  const presenceChannelName = `roomboard-presence:${roomId}`;
  const ownerHeaders: Record<string, string> = ownerToken ? { "X-Room-Owner-Token": ownerToken } : {};

  const applyRoomSnapshot = useCallback(
    (snapshot: RoomSnapshot) => {
      setDisplayRoomName(snapshot.room?.name ?? roomName);
      setRoomAccessState(snapshot.room?.access ?? "link");
      setItems(snapshot.items || []);
      setConnections(snapshot.connections || []);
      setSelectedId((current) =>
        snapshot.items.some((item) => item.id === current) ? current : snapshot.items[0]?.id ?? "",
      );
    },
    [roomName],
  );

  const applyBoardEvent = useCallback(
    (event: RoomboardBoardEventInput) => {
      if (event.type === "item:created" || event.type === "item:updated" || event.type === "item:moved") {
        setItems((current) => {
          const next = new Map(current.map((item) => [item.id, item]));
          next.set(event.item.id, event.item);
          return Array.from(next.values()).sort((a, b) => a.createdAt - b.createdAt);
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
    [router],
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
      app.stage.addChild(world);
      world.addChild(connectionGraphics, itemLayer, cursorLayer);
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

    if (!sceneReady || !scene || items.length === 0) {
      return;
    }

    tickerCleanupRef.current.forEach((cleanup) => cleanup());
    tickerCleanupRef.current = [];
    scene.itemLayer.removeChildren();
    scene.itemMap.clear();

    let draggingItem: Container | null = null;
    let activeDragId = "";
    let didMove = false;
    let lastPointer = { x: 0, y: 0 };
    let disposed = false;

    const persistMove = (itemId: string, x: number, y: number) => {
      void fetch(roomApi, {
        body: JSON.stringify({ id: itemId, x, y }),
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
            publishBoardEvent({ type: "item:moved", item: data.item });
          }
        });
    };

    const drawItem = (item: RoomItem) => {
      const cardSize = getCardSize(item);
      const cardWidth = cardSize.width;
      const cardHeight = cardSize.height;
      const imageFrame = {
        x: 16,
        y: 56,
        width: cardWidth - imageCardPaddingX,
        height: Math.max(minImageFrameHeight, cardHeight - imageCardChromeHeight),
      };
      const root = new Container();
      const card = new Graphics();
      const typeLabel = new Text({
        text: item.type === "image" ? "IMAGE" : "NOTE",
        style: {
          fill: item.color,
          fontFamily: "Inter, system-ui, sans-serif",
          fontSize: 10,
          fontWeight: "900",
        },
      });
      const titleText = new Text({
        text: truncate(item.title, 48),
        style: {
          fill: "#fff8ea",
          fontFamily: "Inter, system-ui, sans-serif",
          fontSize: 15,
          fontWeight: "900",
          lineHeight: 17,
          wordWrap: true,
          wordWrapWidth: cardWidth - 32,
        },
      });
      const bodyText = new Text({
        text: truncate(item.body || item.imageUrl || "", item.type === "image" ? 74 : 96),
        style: {
          fill: "#d7d0c5",
          fontFamily: "Inter, system-ui, sans-serif",
          fontSize: 12,
          fontWeight: "600",
          lineHeight: 15,
          wordWrap: true,
          wordWrapWidth: cardWidth - 32,
        },
      });
      const commentText = new Text({
        text: `${item.comments.length} comments`,
        style: {
          fill: "#aaa39b",
          fontFamily: "Inter, system-ui, sans-serif",
          fontSize: 11,
          fontWeight: "800",
        },
      });

      root.position.set(item.x, item.y);
      root.eventMode = "static";
      root.cursor = "pointer";
      typeLabel.position.set(16, 14);
      titleText.position.set(16, 36);
      
      if (item.type === "image") {
        bodyText.visible = true;
        if (item.imageUrl) {
          bodyText.text = truncate(item.body || "Image Reference", 40);
          bodyText.style.fontSize = 10;
          bodyText.style.fill = "#8e95a5";
          bodyText.position.set(16, imageFrame.y + imageFrame.height + 10);
        } else {
          bodyText.text = truncate(item.body || "No image URL. Click to edit.", 60);
          bodyText.style.fontSize = 11;
          bodyText.style.fill = "#8e95a5";
          bodyText.style.wordWrapWidth = cardWidth - 48;
          bodyText.position.set(24, 76);
        }
        commentText.position.set(16, cardHeight - 24);
      } else {
        bodyText.visible = true;
        bodyText.position.set(16, 72);
        commentText.position.set(16, cardHeight - 24);
      }
      
      root.addChild(card, typeLabel, titleText, bodyText, commentText);

      if (item.type === "image" && item.imageUrl) {
        const linkPill = new Container();
        const pillBg = new Graphics();
        const domain = getDomain(item.imageUrl);
        const truncatedDomain = truncate(domain, 14);
        const linkText = new Text({
          text: `🔗 ${truncatedDomain}`,
          style: {
            fill: "#0ea5e9",
            fontFamily: "Inter, system-ui, sans-serif",
            fontSize: 9.5,
            fontWeight: "700",
          },
        });
        
        linkPill.addChild(pillBg, linkText);
        
        const pillW = 120;
        const pillH = 22;
        
        linkText.anchor.set(0.5);
        linkText.position.set(pillW / 2, pillH / 2);
        
        const drawPill = (hovered = false) => {
          pillBg.clear();
          pillBg.roundRect(0, 0, pillW, pillH, 6)
                .fill({ alpha: hovered ? 0.16 : 0.08, color: 0x0ea5e9 });
          pillBg.roundRect(0, 0, pillW, pillH, 6)
                .stroke({ alpha: hovered ? 0.5 : 0.25, color: 0x0ea5e9, width: 1 });
        };
        
        drawPill(false);
        linkPill.position.set(cardWidth - pillW - 16, cardHeight - 29);
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
          
          const scale = Math.min(imageW / texture.width, imageH / texture.height);
          sprite.width = texture.width * scale;
          sprite.height = texture.height * scale;
          
          sprite.x = imageFrame.x + (imageW - sprite.width) / 2;
          sprite.y = imageFrame.y + (imageH - sprite.height) / 2;
          
          const mask = new Graphics();
          mask.roundRect(imageFrame.x, imageFrame.y, imageW, imageH, 8).fill({ color: 0xffffff });
          sprite.mask = mask;
          
          root.addChildAt(sprite, 1);
          root.addChildAt(mask, 1);
        }).catch((err) => {
          console.error("Failed to load image texture:", err);
        });
      }

      const repaint = () => {
        const active = selectedId === item.id;
        card.clear();
        
        // 1. Fill the card background (rounded rect)
        card.roundRect(0, 0, cardWidth, cardHeight, 12).fill({ alpha: 0.90, color: 0x0f111a });
        
        // 2. Draw the top bar shape (rounded top-left/top-right corners, flat bottom)
        card.roundRect(0, 0, cardWidth, 24, 12).fill({ alpha: 1, color: toColor(item.color) });
        card.rect(0, 12, cardWidth, 12).fill({ alpha: 1, color: toColor(item.color) });

        // 3. Draw placeholder for missing image
        if (item.type === "image" && !item.imageUrl) {
          card.roundRect(imageFrame.x, imageFrame.y, imageFrame.width, imageFrame.height, 8).fill({ alpha: 0.08, color: 0xffffff });
          card.roundRect(imageFrame.x, imageFrame.y, imageFrame.width, imageFrame.height, 8).stroke({ alpha: 0.15, color: 0xffffff, width: 1 });
        }

        // 4. Draw stroke border on top of all fills
        card.roundRect(0, 0, cardWidth, cardHeight, 12).stroke({
          alpha: active ? 1 : 0.32,
          color: toColor(item.color),
          width: active ? 2.5 : 1,
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
      });

      const endDrag = () => {
        if (draggingItem && activeDragId) {
          persistMove(activeDragId, draggingItem.x, draggingItem.y);
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

        const colorStr = c.color || fromItem.color || "#48a7ff";
        const color = toColor(colorStr);

        scene.connectionGraphics.moveTo(startPt.x, startPt.y);
        scene.connectionGraphics.quadraticCurveTo(ctrl.x, ctrl.y, endPt.x, endPt.y);
        scene.connectionGraphics.stroke({ color, width: 2, alpha: 0.7 });

        const angle = Math.atan2(endPt.y - ctrl.y, endPt.x - ctrl.x);
        const arrowSize = 10;
        const arrowX1 = endPt.x - arrowSize * Math.cos(angle - Math.PI / 6);
        const arrowY1 = endPt.y - arrowSize * Math.sin(angle - Math.PI / 6);
        const arrowX2 = endPt.x - arrowSize * Math.cos(angle + Math.PI / 6);
        const arrowY2 = endPt.y - arrowSize * Math.sin(angle + Math.PI / 6);

        scene.connectionGraphics.poly([endPt.x, endPt.y, arrowX1, arrowY1, arrowX2, arrowY2]).fill({ color, alpha: 0.8 });
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
      const label = new Text({
        text: snapshot.name,
        style: {
          fill: "#f6f2e9",
          fontFamily: "Inter, system-ui, sans-serif",
          fontSize: 12,
          fontWeight: "800",
        },
      });

      const worldPoint = scene.world.toLocal({ x: snapshot.x, y: snapshot.y });
      cursor.position.set(worldPoint.x, worldPoint.y);
      shape.poly([0, 0, 18, 8, 7, 13]).fill(toColor(snapshot.color));
      label.position.set(14, 12);
      cursor.addChild(shape, label);
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

  return (
    <>
      <div
        ref={hostRef}
        className="canvas-host"
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

      {/* Professional Top Header Bar */}
      <header className="header-bar">
        <div className="header-left">
          <LayoutGrid size={18} style={{ color: "var(--accent-blue)" }} />
          <h1 className="header-title">Roomboard</h1>
          <span className="header-subtitle">/ {displayRoomName}</span>
        </div>
        
        <div className="header-center">
          <span className="board-status-badge">
            <span
              className="presence-dot"
              style={{ background: roomAccess === "locked" ? "var(--accent-amber)" : "var(--accent-emerald)" }}
            />
            {roomAccess === "locked" ? "Creator only" : "Anyone with link"}
          </span>
        </div>
        
        <div className="header-right">
          {ownerToken && (
            <>
              <Button onClick={() => void toggleRoomAccess()} size="sm" type="button" variant="secondary">
                {roomAccess === "locked" ? (
                  <UnlockKeyhole size={14} aria-hidden="true" />
                ) : (
                  <LockKeyhole size={14} aria-hidden="true" />
                )}
                <span>{roomAccess === "locked" ? "Unlock" : "Lock"}</span>
              </Button>
              <Button onClick={() => setShowCloseModal(true)} size="sm" type="button" variant="outline">
                <Archive size={14} aria-hidden="true" />
                <span>Close room</span>
              </Button>
            </>
          )}
          <Button
            onClick={async () => {
              await navigator.clipboard.writeText(window.location.href);
              setCopiedShare(true);
              window.setTimeout(() => setCopiedShare(false), 1400);
            }}
            size="sm"
            type="button"
            variant="secondary"
          >
            <Copy size={14} aria-hidden="true" />
            <span>{copiedShare ? "Copied" : "Share"}</span>
          </Button>
          <div className="presence-strip">
            {user && (
              <div
                className="presence-avatar-circle"
                onClick={() => {
                  setTempName(user.name);
                  setTempColor(user.color);
                  setRequiresProfile(false);
                  setShowProfileModal(true);
                }}
                style={{ backgroundColor: user.color, zIndex: 10 }}
                title="Customize Profile (You)"
              >
                {getInitials(user.name)}
              </div>
            )}
            {presence.map((snapshot, index) => (
              <div
                key={snapshot.id}
                className="presence-avatar-circle"
                style={{ backgroundColor: snapshot.color, zIndex: 9 - index }}
                title={snapshot.name}
              >
                {getInitials(snapshot.name)}
              </div>
            ))}
          </div>
          <div className="live-badge">
            <span className="pulse-dot" />
            <span>Live</span>
          </div>
        </div>
      </header>

      {/* Floating Connection Mode Alert Banner */}
      {isConnecting && (
        <div 
          style={{
            position: "absolute",
            top: "80px",
            left: "50%",
            transform: "translateX(-50%)",
            zIndex: 10,
            background: "rgba(14, 165, 233, 0.9)",
            color: "#fff",
            padding: "8px 16px",
            borderRadius: "99px",
            fontSize: "13px",
            fontWeight: 600,
            boxShadow: "0 8px 24px rgba(14, 165, 233, 0.4)",
            display: "flex",
            alignItems: "center",
            gap: "8px"
          }}
        >
          <Sparkles size={14} />
          <span>
            {connectFromId 
              ? `Select destination card to link from "${items.find(i => i.id === connectFromId)?.title || ""}"` 
              : "Select source card to create a connection"}
          </span>
          <Button 
            size="icon" 
            variant="ghost" 
            onClick={() => { setIsConnecting(false); setConnectFromId(null); }}
            style={{ width: "18px", height: "18px", color: "#fff", padding: 0 }}
          >
            <X size={12} />
          </Button>
        </div>
      )}

      {/* Floating Bottom Dock (room-toolbar) */}
      <Card className="room-toolbar" aria-label="Canvas tools">
        <CardHeader>
          <h1 className="room-title" style={{ display: "none" }}>Roomboard</h1>
        </CardHeader>
        <CardContent>
          <Button onClick={() => void createItem("note")} type="button" className="ui-button--default">
            <StickyNote size={18} aria-hidden="true" />
            <span>Add note</span>
            <Plus size={16} aria-hidden="true" />
          </Button>
          <Button
            onClick={() => {
              setIsConnecting(!isConnecting);
              setConnectFromId(null);
            }}
            variant={isConnecting ? "default" : "secondary"}
            type="button"
            className={isConnecting ? "ui-button--default" : "ui-button--secondary"}
          >
            <Link2 size={18} aria-hidden="true" />
            <span>{isConnecting ? "Linking..." : "Link Cards"}</span>
          </Button>
          <form
            className="image-url-form"
            onSubmit={(event) => {
              event.preventDefault();
              if (imageUrl.trim()) {
                void createImageFromUrl(imageUrl);
                setImageUrl("");
              }
            }}
            style={{ display: "flex", gap: "6px" }}
          >
            <input
              aria-label="Image URL"
              onChange={(event) => setImageUrl(event.target.value)}
              placeholder="Paste image URL..."
              value={imageUrl}
            />
            <Button
              aria-label="Add image from URL"
              size="icon"
              type="submit"
              variant="secondary"
              className="ui-button--secondary"
            >
              <FileImage size={17} aria-hidden="true" />
            </Button>
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
          <Button
            onClick={() => fileInputRef.current?.click()}
            type="button"
            variant="secondary"
            className="ui-button--secondary"
          >
            <Upload size={17} aria-hidden="true" />
            <span>Upload</span>
          </Button>
        </CardContent>
      </Card>

      {/* Sliding Side Panel Drawer (room-inspector) */}
      <Card className={`room-inspector ${!selected ? "collapsed" : ""}`} aria-label="Selected item details">
        {selected && (
          <>
            <CardHeader>
              <div className="inspector-header-row">
                <div className="room-kicker">
                  <span className="presence-dot" style={{ background: selected.color, boxShadow: `0 0 8px ${selected.color}` }} />
                  <span>{selected.type.toUpperCase()}</span>
                </div>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => setSelectedId("")}
                  style={{ width: "24px", height: "24px", padding: 0 }}
                  type="button"
                  aria-label="Close inspector"
                >
                  <X size={16} />
                </Button>
              </div>
              <CardTitle>{selected.title || "Untitled"}</CardTitle>
              <CardDescription>{items.length} objects on this board</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="inspector-section">
                <label className="room-label" htmlFor="room-title">
                  Title
                </label>
                <input
                  className="room-input"
                  id="room-title"
                  onBlur={() => void saveSelected()}
                  onChange={(event) => setDraftTitle(event.target.value)}
                  value={draftTitle}
                />
              </div>
              
              <div className="inspector-section">
                <span className="room-label">Card Color</span>
                <div className="color-picker">
                  {colors.map((c) => (
                    <div
                      key={c}
                      className={`color-option ${selected.color === c ? "active" : ""}`}
                      onClick={async () => {
                        const response = await fetch(roomApi, {
                          body: JSON.stringify({
                            id: selected.id,
                            color: c,
                          }),
                          headers: { "Content-Type": "application/json", ...ownerHeaders },
                          method: "PATCH",
                        });
                        const data = (await response.json()) as { item?: RoomItem };

                        if (data.item) {
                          publishBoardEvent({ type: "item:updated", item: data.item });
                        }
                      }}
                      style={{ backgroundColor: c }}
                    />
                  ))}
                </div>
              </div>

              <div className="inspector-section">
                <label className="room-label" htmlFor="room-body">
                  Notes
                </label>
                <Textarea
                  id="room-body"
                  onBlur={() => void saveSelected()}
                  onChange={(event) => setDraftBody(event.target.value)}
                  rows={4}
                  value={draftBody}
                />
              </div>

              {selected.type === "image" ? (
                <div className="inspector-section">
                  <span className="room-label">Image Link</span>
                  <input
                    className="room-input"
                    onBlur={() => void saveSelected()}
                    onChange={(event) => setImageUrl(event.target.value)}
                    value={imageUrl}
                    placeholder="Enter image URL..."
                  />
                  {selected.imageUrl ? (
                    <div className="image-preview">
                      <img alt={selected.title} src={selected.imageUrl} />
                    </div>
                  ) : null}
                </div>
              ) : null}

              {/* Connections Inspector List */}
              <div className="connections-section">
                <span className="room-label">Connections</span>
                {connections.filter(c => c.from === selected.id || c.to === selected.id).length > 0 ? (
                  <div style={{ display: "flex", flexDirection: "column", gap: "8px", marginTop: "4px" }}>
                    {connections
                      .filter(c => c.from === selected.id || c.to === selected.id)
                      .map((c) => {
                        const otherId = c.from === selected.id ? c.to : c.from;
                        const otherItem = items.find(it => it.id === otherId);
                        const otherTitle = otherItem ? truncate(otherItem.title, 24) : "Unknown Card";
                        const relation = c.from === selected.id ? "to" : "from";
                        
                        return (
                          <div className="connection-item" key={c.id}>
                            <div className="connection-label">
                              <span className="presence-dot" style={{ background: c.color || "#48a7ff" }} />
                              <span>{relation} <strong>{otherTitle}</strong></span>
                            </div>
                            <Button
                              onClick={() => void handleDeleteConnection(c.id)}
                              size="icon"
                              variant="ghost"
                              className="ui-button--size-sm"
                              style={{ width: "24px", height: "24px", padding: 0 }}
                              type="button"
                              aria-label="Delete connection"
                            >
                              <X size={14} />
                            </Button>
                          </div>
                        );
                      })}
                  </div>
                ) : (
                  <p className="empty-copy">No connections for this card.</p>
                )}
              </div>

              <Separator />

              <div className="comments-head">
                <MessageSquarePlus size={16} aria-hidden="true" />
                <span>{selected.comments.length} comments</span>
              </div>
              <div className="comments-list">
                {selected.comments.length > 0 ? (
                  selected.comments.map((entry) => (
                    <div className="comment-row" key={entry.id}>
                      <span className="presence-dot" style={{ background: entry.color }} />
                      <div>
                        <strong>{entry.author}</strong>
                        <p>{entry.body}</p>
                      </div>
                    </div>
                  ))
                ) : (
                  <p className="empty-copy">No comments yet.</p>
                )}
              </div>
              <form className="comment-form" onSubmit={submitComment}>
                <input
                  aria-label="Add comment"
                  onChange={(event) => setComment(event.target.value)}
                  placeholder="Add a comment..."
                  value={comment}
                />
                <Button disabled={comment.trim().length === 0} size="icon" type="submit" className="ui-button--default" style={{ width: "38px", height: "38px" }}>
                  <Send size={16} aria-hidden="true" />
                </Button>
              </form>

              <Separator style={{ margin: "16px 0 8px 0" }} />
              
              <Button
                variant="ghost"
                onClick={() => void handleDeleteItem(selected.id)}
                className="ui-button--secondary"
                style={{ color: "var(--accent-rose)", borderColor: "rgba(244, 63, 94, 0.2)", width: "100%", marginTop: "8px" }}
                type="button"
              >
                <Trash2 size={16} />
                <span>Delete Card</span>
              </Button>
            </CardContent>
          </>
        )}
      </Card>

      {/* Floating Zoom Panel Overlay */}
      <div className="zoom-overlay">
        <button onClick={handleZoomOut} className="zoom-btn" title="Zoom Out" type="button">
          <ZoomOut size={16} />
        </button>
        <span>{zoomPercent}%</span>
        <button onClick={handleZoomIn} className="zoom-btn" title="Zoom In" type="button">
          <ZoomIn size={16} />
        </button>
        <button onClick={handleZoomFit} className="zoom-btn" style={{ marginLeft: "4px" }} title="Fit all elements" type="button">
          <Maximize2 size={15} />
        </button>
        <button onClick={handleZoomReset} className="zoom-btn" title="Reset Zoom" type="button" style={{ fontSize: "11px", fontWeight: "bold", fontFamily: "monospace" }}>
          1:1
        </button>
      </div>

      {/* Collaborators List (Hidden off-screen on mobile for Playwright verification) */}
      <Card className="room-presence" aria-label="Active collaborators">
        <CardHeader>
          <CardTitle>{presence.length + 1}</CardTitle>
          <CardDescription>people in room</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="presence-list">
            <div className="presence-row">
              <span className="presence-dot" style={{ background: user?.color ?? "#facc5c" }} />
              <span>{user?.profileComplete ? user.name : "You"}</span>
            </div>
            {presence.map((snapshot) => (
              <div className="presence-row" key={snapshot.id}>
                <span className="presence-dot" style={{ background: snapshot.color }} />
                <span>{snapshot.name}</span>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {showCloseModal && (
        <div className="modal-overlay" onClick={() => setShowCloseModal(false)}>
          <div className="modal-content" onClick={(event) => event.stopPropagation()}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "12px" }}>
              <div>
                <h2 style={{ fontSize: "18px", fontWeight: 800 }}>Close this room?</h2>
                <p style={{ color: "var(--muted)", fontSize: "13px", lineHeight: 1.5, marginTop: "6px" }}>
                  The room will be removed from recent rooms and everyone currently inside will return to the dashboard.
                </p>
              </div>
              <Button
                onClick={() => setShowCloseModal(false)}
                size="icon"
                style={{ width: "30px", height: "30px", padding: 0 }}
                type="button"
                variant="ghost"
              >
                <X size={16} aria-hidden="true" />
              </Button>
            </div>
            <div className="modal-actions">
              <Button onClick={() => setShowCloseModal(false)} type="button" variant="secondary">
                Keep open
              </Button>
              <Button disabled={isClosingRoom} onClick={() => void closeRoom()} type="button">
                <Archive size={15} aria-hidden="true" />
                <span>{isClosingRoom ? "Closing" : "Close room"}</span>
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Profile customization Modal Overlay */}
      {showProfileModal && (
        <div className="modal-overlay" onClick={() => !requiresProfile && setShowProfileModal(false)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "8px" }}>
              <h2 style={{ fontSize: "18px", fontWeight: 700 }}>{requiresProfile ? "Join room" : "Customize profile"}</h2>
              {!requiresProfile && (
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => setShowProfileModal(false)}
                  style={{ width: "28px", height: "28px", padding: 0 }}
                  type="button"
                >
                  <X size={16} />
                </Button>
              )}
            </div>
            
            <div className="inspector-section">
              <label className="room-label" htmlFor="profile-name">Name</label>
              <input
                id="profile-name"
                className="room-input"
                value={tempName}
                onChange={(e) => setTempName(e.target.value.slice(0, 24))}
                placeholder="Enter your name..."
              />
            </div>

            <div className="inspector-section">
              <span className="room-label">Cursor Color</span>
              <div className="color-picker">
                {colors.map((c) => (
                  <div
                    key={c}
                    className={`color-option ${tempColor === c ? "active" : ""}`}
                    onClick={() => setTempColor(c)}
                    style={{ backgroundColor: c }}
                  />
                ))}
              </div>
            </div>

            <Button
              disabled={tempName.trim().length === 0}
              className="ui-button--default"
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
              style={{ marginTop: "8px" }}
            >
              {requiresProfile ? "Join room" : "Save changes"}
            </Button>
          </div>
        </div>
      )}
    </>
  );
}
