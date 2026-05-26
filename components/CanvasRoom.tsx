"use client";

import { FormEvent, useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { useRouter } from "next/navigation";
import { 
  Archive,
  Eye,
  FileImage, 
  MessageSquarePlus, 
  MousePointer2, 
  Pencil,
  Send, 
  ShieldCheck,
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
  Moon,
  Sun,
  Upload,
  UnlockKeyhole
} from "lucide-react";
import { Application, Container, Graphics, Text, Sprite, Texture } from "pixi.js";
import type {
  RoomAccess,
  RoomActivity,
  RoomConnection,
  RoomInviteRole,
  RoomItem,
  RoomItemStatus,
  RoomPermissions,
  RoomSnapshot,
} from "@/lib/canvasRoom";
import type { PresenceSnapshot } from "@/lib/presence";
import {
  createRoomboardRealtimeSession,
  type RoomboardBoardEventInput,
  type RoomboardRealtimeStatus,
  type RoomboardRealtimeSession,
} from "@/lib/roomboardRealtime";
import { RoomboardLoader } from "@/components/RoomboardLoader";

type LocalUser = {
  profileComplete?: boolean;
  id: string;
  name: string;
  color: string;
};

type RoomTheme = "dark" | "light";

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

type GridTransform = {
  panX: number;
  panY: number;
  zoom: number;
};

type CanvasPalette = {
  accent: string;
  border: string;
  body: string;
  cardMix: string;
  connector: string;
  faint: string;
  footer: string;
  frame: string;
  frameBorder: string;
  muted: string;
  separator: string;
  title: string;
};

type StatusMeta = {
  color: string;
  label: string;
  short: string;
};

type ReviewFilter = RoomItemStatus | "all";

const colors = ["#ffd166", "#0ea5e9", "#10b981", "#f43f5e", "#6366f1"];
const localUserKey = "canvas-room-user";
const localThemeKey = "roomboard-theme";
const realtimeEndpoint = process.env.NEXT_PUBLIC_ROOMBOARD_REALTIME_URL?.trim() ?? "";
const imageCardChromeHeight = 144;
const imageCardPaddingX = 32;
const minImageFrameWidth = 220;
const maxImageFrameWidth = 420;
const minImageFrameHeight = 116;
const maxImageFrameHeight = 320;
const pixiFont = "Geist, Inter, system-ui, sans-serif";
const pixiMonoFont = "Geist Mono, ui-monospace, monospace";
const minPixiTextResolution = 4;
const maxPixiTextResolution = 18;
const minCanvasZoom = 0.2;
const maxCanvasZoom = 8;
const wheelZoomInStep = 1.12;
const wheelZoomOutStep = 0.89;
const defaultRoomPermissions: RoomPermissions = {
  canEdit: true,
  canManage: false,
  role: "editor",
};
const itemStatusOptions: Array<{ status: RoomItemStatus; label: string }> = [
  { status: "open", label: "Open" },
  { status: "reviewing", label: "Reviewing" },
  { status: "approved", label: "Approved" },
  { status: "changes_requested", label: "Changes" },
];
const reviewFilterOptions: Array<{ filter: ReviewFilter; label: string }> = [
  { filter: "all", label: "All" },
  { filter: "open", label: "Open" },
  { filter: "reviewing", label: "Review" },
  { filter: "approved", label: "Approved" },
  { filter: "changes_requested", label: "Changes" },
];

function getItemStatusMeta(status: RoomItemStatus): StatusMeta {
  if (status === "approved") {
    return { color: "#10b981", label: "Approved", short: "Approved" };
  }

  if (status === "reviewing") {
    return { color: "#0ea5e9", label: "Reviewing", short: "Review" };
  }

  if (status === "changes_requested") {
    return { color: "#f43f5e", label: "Changes requested", short: "Changes" };
  }

  return { color: "#8a909a", label: "Open", short: "Open" };
}

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

function clampZoom(scale: number) {
  return Math.min(maxCanvasZoom, Math.max(minCanvasZoom, scale));
}

function getCanvasPalette(theme: RoomTheme): CanvasPalette {
  if (theme === "light") {
    return {
      accent: "#3d7eff",
      border: "#d4d4cd",
      body: "#5a6068",
      cardMix: "#ffffff",
      connector: "#8a909a",
      faint: "#b0b5bd",
      footer: "#fafaf7",
      frame: "#f0f0ec",
      frameBorder: "#d4d4cd",
      muted: "#8a909a",
      separator: "#ededea",
      title: "#14171c",
    };
  }

  return {
    accent: "#3d7eff",
    border: "#232830",
    body: "#9ba3b0",
    cardMix: "#1a1e26",
    connector: "#6a7280",
    faint: "#4a525e",
    footer: "#20242d",
    frame: "#0a0c10",
    frameBorder: "#232830",
    muted: "#6a7280",
    separator: "#1d2128",
    title: "#e7eaf0",
  };
}

function getPixiTextResolution(scale: number) {
  return Math.min(maxPixiTextResolution, Math.max(minPixiTextResolution, Math.ceil(scale * 2)));
}

function updateTextResolution(root: Container, resolution: number) {
  for (const child of root.children) {
    if (child instanceof Text) {
      child.resolution = resolution;
    }

    if (child instanceof Container) {
      updateTextResolution(child, resolution);
    }
  }
}

function setWorldZoom(
  scene: Pick<PixiScene, "host" | "world">,
  nextScale: number,
  anchor?: { x: number; y: number },
) {
  const previousScale = scene.world.scale.x || 1;
  const scale = clampZoom(nextScale);
  const point = anchor ?? {
    x: scene.host.clientWidth / 2,
    y: scene.host.clientHeight / 2,
  };
  const worldX = (point.x - scene.world.x) / previousScale;
  const worldY = (point.y - scene.world.y) / previousScale;

  scene.world.scale.set(scale);
  scene.world.x = point.x - worldX * scale;
  scene.world.y = point.y - worldY * scale;

  return scale;
}

function CanvasGrid({ panX, panY, zoom }: GridTransform) {
  const minor = 24;
  const major = 120;
  const minorSize = minor * zoom;
  const majorSize = major * zoom;
  const offX = ((panX % majorSize) + majorSize) % majorSize;
  const offY = ((panY % majorSize) + majorSize) % majorSize;

  return (
    <svg className="rb-grid" aria-hidden="true">
      <defs>
        <pattern id="rb-grid-minor" width={minorSize} height={minorSize} patternUnits="userSpaceOnUse" x={offX} y={offY}>
          <line x1="0" y1="0" x2={minorSize} y2="0" stroke="var(--grid)" strokeWidth="1" />
          <line x1="0" y1="0" x2="0" y2={minorSize} stroke="var(--grid)" strokeWidth="1" />
        </pattern>
        <pattern id="rb-grid-major" width={majorSize} height={majorSize} patternUnits="userSpaceOnUse" x={offX} y={offY}>
          <line x1="0" y1="0" x2={majorSize} y2="0" stroke="var(--grid-major)" strokeWidth="1" />
          <line x1="0" y1="0" x2="0" y2={majorSize} stroke="var(--grid-major)" strokeWidth="1" />
        </pattern>
      </defs>
      <rect width="100%" height="100%" fill="url(#rb-grid-minor)" />
      <rect width="100%" height="100%" fill="url(#rb-grid-major)" />
      <line x1={panX} y1="0" x2={panX} y2="100%" stroke="var(--grid-axis)" strokeWidth="1" />
      <line x1="0" y1={panY} x2="100%" y2={panY} stroke="var(--grid-axis)" strokeWidth="1" />
    </svg>
  );
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

function truncateForWidth(value: string, width: number, averageCharWidth = 7) {
  return truncate(value, Math.max(8, Math.floor(width / averageCharWidth)));
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

function isDefaultImageTitle(value: string) {
  return ["image", "image reference", "visual reference"].includes(value.trim().toLowerCase());
}

function isDefaultImageBody(value: string) {
  return [
    "add context, critique, or decisions in the inspector.",
    "image reference for review.",
    "linked image ready for comments and visual decisions.",
    "reference image for review",
    "reference image for review.",
    "review thread ready - source saved.",
    "uploaded image ready for comments and visual decisions.",
  ].includes(value.trim().toLowerCase());
}

function getImageDisplayTitle(item: RoomItem) {
  if (!isDefaultImageTitle(item.title)) {
    return item.title;
  }

  const domain = getDomain(item.imageUrl);
  return domain === "Link" ? "Visual reference" : `Reference from ${domain}`;
}

function getImageDisplayBody(item: RoomItem) {
  if (item.body && !isDefaultImageBody(item.body)) {
    return item.body;
  }

  if (item.comments.length > 0) {
    return `${item.comments.length} review note${item.comments.length === 1 ? "" : "s"} captured.`;
  }

  return item.imageUrl ? "Review thread ready - source saved." : "Missing source - add a link or upload.";
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

function destroyPixiApp(app: Application) {
  const appState = app as unknown as {
    _cancelResize?: (() => void) | null;
    renderer?: unknown;
  };

  if (!appState.renderer || appState._cancelResize === null) {
    return;
  }

  try {
    app.destroy({ removeView: true }, { children: true });
  } catch (error) {
    if (!(error instanceof TypeError && String(error).includes("_cancelResize"))) {
      console.warn("Error destroying Pixi app on unmount:", error);
    }
  }
}

function createLocalId() {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }

  return `local-${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
}

function createIncompleteLocalUser(): LocalUser {
  return {
    id: createLocalId(),
    name: "",
    color: colors[Math.floor(Math.random() * colors.length)],
    profileComplete: false,
  };
}

function normalizeLocalUser(value: unknown): LocalUser | null {
  if (!value || typeof value !== "object") {
    return null;
  }

  const savedUser = value as Partial<LocalUser>;
  const name = typeof savedUser.name === "string" ? savedUser.name.trim().slice(0, 28) : "";
  const id = typeof savedUser.id === "string" && savedUser.id.trim() ? savedUser.id : createLocalId();
  const color = typeof savedUser.color === "string" && colors.includes(savedUser.color)
    ? savedUser.color
    : colors[Math.floor(Math.random() * colors.length)];
  const legacyComplete = Boolean(name && !name.startsWith("Guest "));
  const profileComplete = (savedUser.profileComplete ?? legacyComplete) && name.length > 0;

  return {
    id,
    name: profileComplete ? name : "",
    color,
    profileComplete,
  };
}

function saveLocalUser(user: LocalUser) {
  if (typeof window === "undefined") {
    return;
  }

  try {
    window.localStorage.setItem(localUserKey, JSON.stringify(user));
  } catch {
    // Local storage is a convenience; the room still works if the browser blocks it.
  }
}

function getLocalUser(): LocalUser {
  if (typeof window === "undefined") {
    return createIncompleteLocalUser();
  }

  let saved: string | null = null;

  try {
    saved = window.localStorage.getItem(localUserKey);
  } catch {
    return createIncompleteLocalUser();
  }

  if (!saved) {
    return createIncompleteLocalUser();
  }

  try {
    const user = normalizeLocalUser(JSON.parse(saved));

    if (user) {
      saveLocalUser(user);
      return user;
    }
  } catch {
    try {
      window.localStorage.removeItem(localUserKey);
    } catch {
      // Ignore storage cleanup failures.
    }
  }

  return createIncompleteLocalUser();
}

function getStoredTheme(): RoomTheme {
  if (typeof window === "undefined") {
    return "dark";
  }

  try {
    return window.localStorage.getItem(localThemeKey) === "light" ? "light" : "dark";
  } catch {
    return "dark";
  }
}

function saveStoredTheme(theme: RoomTheme) {
  if (typeof window === "undefined") {
    return;
  }

  try {
    window.localStorage.setItem(localThemeKey, theme);
  } catch {
    // Theme persistence is optional.
  }
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
    width: Math.max(272, item.width),
    height: Math.max(252, item.height),
  };
}

function isSamePosition(item: RoomItem, move: LocalMove) {
  return Math.round(item.x) === Math.round(move.x) && Math.round(item.y) === Math.round(move.y);
}

function getStoredTokenMap(key: string): Record<string, string> {
  if (typeof window === "undefined") {
    return {};
  }

  try {
    return JSON.parse(localStorage.getItem(key) ?? "{}") as Record<string, string>;
  } catch {
    return {};
  }
}

function getOwnerToken(roomId: string) {
  if (roomId === "pitch-deck-review") {
    return "demo-owner";
  }

  if (typeof window === "undefined") {
    return "";
  }

  return getStoredTokenMap("roomboard-owner-tokens")[roomId] ?? "";
}

function getInviteToken(roomId: string) {
  if (typeof window === "undefined") {
    return "";
  }

  const url = new URL(window.location.href);
  const tokenFromUrl = url.searchParams.get("invite") ?? url.searchParams.get("inviteToken");

  if (tokenFromUrl) {
    try {
      const tokens = getStoredTokenMap("roomboard-invite-tokens");
      localStorage.setItem("roomboard-invite-tokens", JSON.stringify({ ...tokens, [roomId]: tokenFromUrl }));
    } catch {
      // Invite tokens still work from the URL if local storage is unavailable.
    }

    return tokenFromUrl;
  }

  return getStoredTokenMap("roomboard-invite-tokens")[roomId] ?? "";
}

function getRoleLabel(permissions: RoomPermissions) {
  if (permissions.role === "owner") return "Owner";
  if (permissions.role === "viewer") return "Viewer";
  return "Editor";
}

function formatActivityTime(timestamp: number) {
  const seconds = Math.max(0, Math.floor((Date.now() - timestamp) / 1000));

  if (seconds < 60) return "now";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h`;
  return `${Math.floor(hours / 24)}d`;
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

function ActivityList({ activities, empty }: { activities: RoomActivity[]; empty: string }) {
  if (activities.length === 0) {
    return <p className="rb-empty-copy">{empty}</p>;
  }

  return (
    <div className="rb-activity-list">
      {activities.map((activity) => (
        <div className={`rb-activity type-${activity.type}`} key={activity.id}>
          <span className="rb-activity__dot" />
          <div className="rb-activity__copy">
            <div>{activity.message}</div>
            <span>
              {activity.actor} · {formatActivityTime(activity.createdAt)}
            </span>
          </div>
        </div>
      ))}
    </div>
  );
}

export function CanvasRoom({ roomId, roomName }: CanvasRoomProps) {
  const router = useRouter();
  const hostRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const sceneRef = useRef<PixiScene | null>(null);
  const textResolutionRef = useRef(getPixiTextResolution(1));
  const hasRoomSnapshotRef = useRef(false);
  const realtimeSessionRef = useRef<RoomboardRealtimeSession | null>(null);
  const tickerCleanupRef = useRef<(() => void)[]>([]);
  const draggingPositionsRef = useRef(new Map<string, LocalMove>());
  const pendingMovesRef = useRef(new Map<string, LocalMove>());
  const [items, setItems] = useState<RoomItem[]>([]);
  const [connections, setConnections] = useState<RoomConnection[]>([]);
  const [activities, setActivities] = useState<RoomActivity[]>([]);
  const [displayRoomName, setDisplayRoomName] = useState(roomName);
  const [roomAccess, setRoomAccessState] = useState<RoomAccess>("link");
  const [ownerToken, setOwnerToken] = useState("");
  const [inviteToken, setInviteToken] = useState("");
  const [inviteTokens, setInviteTokens] = useState<Partial<Record<RoomInviteRole, string>>>({});
  const [permissions, setPermissions] = useState<RoomPermissions>(defaultRoomPermissions);
  const [hasLoadedOwnerToken, setHasLoadedOwnerToken] = useState(false);
  const [hasRoomSnapshot, setHasRoomSnapshot] = useState(false);
  const [hasMinimumLoaderElapsed, setHasMinimumLoaderElapsed] = useState(false);
  const [realtimeStatus, setRealtimeStatus] = useState<RoomboardRealtimeStatus>(
    realtimeEndpoint ? "connecting" : "degraded",
  );
  const [useRealtimeFallback, setUseRealtimeFallback] = useState(!realtimeEndpoint);
  const [roomLoadError, setRoomLoadError] = useState("");
  const [selectedId, setSelectedId] = useState("");
  const [presence, setPresence] = useState<PresenceSnapshot[]>([]);
  const [sceneReady, setSceneReady] = useState(false);
  const [draftTitle, setDraftTitle] = useState("");
  const [draftBody, setDraftBody] = useState("");
  const [draftStatus, setDraftStatus] = useState<RoomItemStatus>("open");
  const [reviewFilter, setReviewFilter] = useState<ReviewFilter>("all");
  const [imageUrl, setImageUrl] = useState("");
  const [toolbarImageUrl, setToolbarImageUrl] = useState("");
  const [isDraggingImage, setIsDraggingImage] = useState(false);
  const [comment, setComment] = useState("");
  const [user, setUser] = useState<LocalUser | null>(null);
  const [theme, setTheme] = useState<RoomTheme>("dark");
  
  // Connection Mode States
  const [isConnecting, setIsConnecting] = useState(false);
  const [connectFromId, setConnectFromId] = useState<string | null>(null);
  const isConnectingRef = useRef(false);
  const connectFromIdRef = useRef<string | null>(null);
  
  // Zoom State
  const [zoomPercent, setZoomPercent] = useState(100);
  const [gridTransform, setGridTransform] = useState<GridTransform>({ panX: 0, panY: 0, zoom: 1 });
  
  // Profile Modal State
  const [showProfileModal, setShowProfileModal] = useState(false);
  const [tempName, setTempName] = useState("");
  const [tempColor, setTempColor] = useState("");
  const [requiresProfile, setRequiresProfile] = useState(false);
  const [copiedShare, setCopiedShare] = useState<"current" | RoomInviteRole | "">("");
  const [showCloseModal, setShowCloseModal] = useState(false);
  const [isClosingRoom, setIsClosingRoom] = useState(false);

  const selected = items.find((item) => item.id === selectedId) ?? null;
  const roomApi = `/api/rooms/${roomId}`;
  const roomQueryParams = new URLSearchParams();
  if (ownerToken) roomQueryParams.set("ownerToken", ownerToken);
  if (inviteToken) roomQueryParams.set("inviteToken", inviteToken);
  const roomCredentialsQuery = roomQueryParams.toString();
  const roomStreamApi = roomCredentialsQuery ? `${roomApi}?${roomCredentialsQuery}` : roomApi;
  const presenceApi = `${roomApi}/presence`;
  const presenceStreamApi = roomCredentialsQuery ? `${presenceApi}?${roomCredentialsQuery}` : presenceApi;
  const presenceChannelName = `roomboard-presence:${roomId}`;
  const roomCredentialsHeaders: Record<string, string> = {
    ...(inviteToken ? { "X-Room-Invite-Token": inviteToken } : {}),
    ...(ownerToken ? { "X-Room-Owner-Token": ownerToken } : {}),
  };
  const canEditRoom = permissions.canEdit;
  const canManageRoom = permissions.canManage;
  const statusCounts = useMemo(
    () =>
      items.reduce<Record<RoomItemStatus, number>>(
        (counts, item) => {
          counts[item.status] += 1;
          return counts;
        },
        {
          approved: 0,
          changes_requested: 0,
          open: 0,
          reviewing: 0,
        },
      ),
    [items],
  );
  const decidedCount = statusCounts.approved + statusCounts.changes_requested;
  const unresolvedCount = statusCounts.open + statusCounts.reviewing;
  const reviewProgress = items.length > 0 ? Math.round((decidedCount / items.length) * 100) : 0;
  const visibleItems = useMemo(
    () => (reviewFilter === "all" ? items : items.filter((item) => item.status === reviewFilter)),
    [items, reviewFilter],
  );
  const visibleConnections = useMemo(
    () => {
      const visibleItemIds = new Set(visibleItems.map((item) => item.id));
      return connections.filter((connection) => visibleItemIds.has(connection.from) && visibleItemIds.has(connection.to));
    },
    [connections, visibleItems],
  );

  const syncTextResolution = useCallback((scale: number) => {
    const nextResolution = getPixiTextResolution(scale);

    if (nextResolution === textResolutionRef.current) {
      return;
    }

    textResolutionRef.current = nextResolution;
    const scene = sceneRef.current;

    if (!scene) {
      return;
    }

    updateTextResolution(scene.world, nextResolution);
    updateTextResolution(scene.cursorLayer, nextResolution);
  }, []);

  const syncGridTransform = useCallback((scene: Pick<PixiScene, "world">) => {
    const nextTransform = {
      panX: scene.world.x,
      panY: scene.world.y,
      zoom: scene.world.scale.x || 1,
    };

    setGridTransform((current) => {
      if (
        Math.abs(current.panX - nextTransform.panX) < 0.1 &&
        Math.abs(current.panY - nextTransform.panY) < 0.1 &&
        Math.abs(current.zoom - nextTransform.zoom) < 0.001
      ) {
        return current;
      }

      return nextTransform;
    });
  }, []);

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
      setPermissions(snapshot.permissions ?? defaultRoomPermissions);
      setInviteTokens(snapshot.inviteTokens ?? {});
      setItems(nextItems);
      setConnections(snapshot.connections || []);
      setActivities(snapshot.activities || []);
      hasRoomSnapshotRef.current = true;
      setHasRoomSnapshot(true);
      setRoomLoadError("");
      setSelectedId((current) =>
        nextItems.some((item) => item.id === current) ? current : nextItems[0]?.id ?? "",
      );
    },
    [roomName, withLocalPositions],
  );

  const refreshRoomSnapshot = useCallback(async () => {
    const headers: Record<string, string> = {
      ...(inviteToken ? { "X-Room-Invite-Token": inviteToken } : {}),
      ...(ownerToken ? { "X-Room-Owner-Token": ownerToken } : {}),
    };
    const response = await fetch(roomApi, {
      headers: Object.keys(headers).length > 0 ? headers : undefined,
    });

    if (response.ok) {
      applyRoomSnapshot((await response.json()) as RoomSnapshot);
    }
  }, [applyRoomSnapshot, inviteToken, ownerToken, roomApi]);

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
      if (!canEditRoom || !user?.profileComplete) {
        return;
      }

      if (realtimeStatus !== "connected" && realtimeStatus !== "connecting") {
        return;
      }

      realtimeSessionRef.current?.sendRoomEvent({
        ...event,
        clientId: user?.id,
      });
    },
    [canEditRoom, realtimeStatus, user],
  );

  const requestProfile = () => {
    setRequiresProfile(true);
    setShowProfileModal(true);
  };

  const toggleTheme = useCallback(() => {
    setTheme((currentTheme) => (currentTheme === "dark" ? "light" : "dark"));
  }, []);

  useEffect(() => {
    isConnectingRef.current = isConnecting;
    connectFromIdRef.current = connectFromId;
  }, [isConnecting, connectFromId]);

  useEffect(() => {
    if (!canEditRoom) {
      setIsConnecting(false);
      setConnectFromId(null);
    }
  }, [canEditRoom]);

  useEffect(() => {
    const defaultUser = getLocalUser();
    const defaultTheme = getStoredTheme();
    setUser(defaultUser);
    setTempName(defaultUser.name);
    setTempColor(defaultUser.color);
    setTheme(defaultTheme);
    setRequiresProfile(!defaultUser.profileComplete);
    setShowProfileModal(!defaultUser.profileComplete);
  }, []);

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    saveStoredTheme(theme);
  }, [theme]);

  useEffect(() => {
    setHasLoadedOwnerToken(false);
    hasRoomSnapshotRef.current = false;
    setHasRoomSnapshot(false);
    setHasMinimumLoaderElapsed(false);
    setRealtimeStatus(realtimeEndpoint ? "connecting" : "degraded");
    setUseRealtimeFallback(!realtimeEndpoint);
    setRoomLoadError("");
    setPresence([]);
    setOwnerToken(getOwnerToken(roomId));
    setInviteToken(getInviteToken(roomId));
    setInviteTokens({});
    setPermissions(defaultRoomPermissions);
    setHasLoadedOwnerToken(true);

    const timer = window.setTimeout(() => setHasMinimumLoaderElapsed(true), 900);
    return () => window.clearTimeout(timer);
  }, [roomId]);

  useEffect(() => {
    if (!hasLoadedOwnerToken) {
      return;
    }

    let cancelled = false;

    fetch(roomApi, {
      headers: Object.keys(roomCredentialsHeaders).length > 0 ? roomCredentialsHeaders : undefined,
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
          setRoomLoadError("This room could not be opened. It may be locked, closed, or unavailable.");
        }
      });

    return () => {
      cancelled = true;
    };
  }, [applyRoomSnapshot, hasLoadedOwnerToken, inviteToken, ownerToken, roomApi]);

  useEffect(() => {
    if (!hasLoadedOwnerToken || !useRealtimeFallback) {
      return;
    }

    const source = new EventSource(roomStreamApi);

    source.addEventListener("room", (event) => {
      try {
        const snapshot = JSON.parse((event as MessageEvent).data) as RoomSnapshot;
        applyRoomSnapshot(snapshot);
      } catch {
        setRoomLoadError("Room data could not be decoded.");
      }
    });
    source.addEventListener("closed", () => {
      router.push("/");
    });
    source.onerror = () => {
      if (!hasRoomSnapshotRef.current) {
        setRoomLoadError("Realtime connection failed before the room loaded.");
      }
    };

    return () => source.close();
  }, [applyRoomSnapshot, hasLoadedOwnerToken, roomStreamApi, router, useRealtimeFallback]);

  useEffect(() => {
    setDraftTitle(selected?.title ?? "");
    setDraftBody(selected?.body ?? "");
    setDraftStatus(selected?.status ?? "open");
    setImageUrl(selected?.imageUrl ?? "");
  }, [selected]);

  useEffect(() => {
    if (reviewFilter === "all" || !selectedId) {
      return;
    }

    if (!visibleItems.some((item) => item.id === selectedId)) {
      setSelectedId(visibleItems[0]?.id ?? "");
    }
  }, [reviewFilter, selectedId, visibleItems]);

  useEffect(() => {
    if (!user?.profileComplete) {
      return;
    }

    if (realtimeEndpoint && !useRealtimeFallback) {
      setRealtimeStatus("connecting");
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
        onStatusChange: (status) => {
          setRealtimeStatus(status);

          if (status === "degraded") {
            setUseRealtimeFallback(true);
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

    const source = new EventSource(presenceStreamApi);
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
      void fetch(`${presenceStreamApi}${presenceStreamApi.includes("?") ? "&" : "?"}id=${user.id}`, { method: "DELETE" });
    };
  }, [applyBoardEvent, presenceStreamApi, presenceChannelName, roomId, useRealtimeFallback, user]);

  useEffect(() => {
    if (!user?.profileComplete) {
      return;
    }

    const channel = useRealtimeFallback ? new BroadcastChannel(presenceChannelName) : null;
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

      if (!useRealtimeFallback) {
        if (realtimeStatus === "connected") {
          realtimeSessionRef.current?.updatePresence(snapshot);
        }

        return;
      }

      if (now - lastServerSent < 180) {
        return;
      }

      lastServerSent = now;
      void fetch(presenceApi, {
        body: JSON.stringify(snapshot),
        headers: { "Content-Type": "application/json", ...roomCredentialsHeaders },
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
  }, [inviteToken, ownerToken, presenceApi, presenceChannelName, realtimeStatus, selected, useRealtimeFallback, user]);

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
          resolution: Math.min(window.devicePixelRatio || 1, 3),
        });
      } catch (err) {
        console.error("Failed to initialize Pixi Application:", err);
        throw err;
      }

      if (disposed) {
        destroyPixiApp(app);
        return;
      }

      hostEl.appendChild(app.canvas);
      world.position.set(hostEl.clientWidth / 2 + 80, hostEl.clientHeight / 2 - 20);
      app.stage.addChild(world, cursorLayer);
      world.addChild(connectionGraphics, itemLayer);
      sceneRef.current = { app, cursorLayer, host: hostEl, itemLayer, itemMap, world, connectionGraphics };
      syncGridTransform({ world });
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
        syncGridTransform({ world });
      });

      const onWheel = (event: WheelEvent) => {
        event.preventDefault();
        const direction = event.deltaY > 0 ? wheelZoomOutStep : wheelZoomInStep;
        const hostRect = hostEl.getBoundingClientRect();
        const nextScale = setWorldZoom(
          { host: hostEl, world },
          world.scale.x * direction,
          {
            x: event.clientX - hostRect.left,
            y: event.clientY - hostRect.top,
          },
        );
        syncTextResolution(nextScale);
        syncGridTransform({ world });
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
      destroyPixiApp(app);
      hostEl.replaceChildren();
    };
  }, [syncGridTransform, syncTextResolution]);

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

    if (visibleItems.length === 0) {
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
        body: JSON.stringify({ author: user?.name, id: itemId, x: move.x, y: move.y }),
        headers: { "Content-Type": "application/json", ...roomCredentialsHeaders },
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
            void refreshRoomSnapshot();
          }
        })
        .catch((error) => {
          pendingMovesRef.current.delete(itemId);
          console.warn("Failed to persist item move", error);
        });
    };

    const palette = getCanvasPalette(theme);

    const drawItem = (item: RoomItem) => {
      const cardSize = getCardSize(item);
      const cardWidth = cardSize.width;
      const cardHeight = cardSize.height;
      const active = selectedId === item.id;
      const headerHeight = 35;
      const footerHeight = 32;
      const cardPad = 12;
      const imageInfoHeight = 50;
      const footerY = cardHeight - footerHeight;
      const imageInfoY = footerY - imageInfoHeight;
      const imageSource = getDomain(item.imageUrl);
      const sourcePillMaxWidth = Math.min(136, Math.max(84, cardWidth - 150));
      const sourcePillText = truncateForWidth(imageSource, sourcePillMaxWidth - 22, 6.2);
      const sourcePillWidth = Math.min(sourcePillMaxWidth, Math.max(78, sourcePillText.length * 6.2 + 24));
      const imageTitleWidth = Math.max(96, cardWidth - cardPad * 3 - sourcePillWidth);
      const statusMeta = getItemStatusMeta(item.status);
      const imageFrame = {
        x: cardPad,
        y: 44,
        width: cardWidth - cardPad * 2,
        height: Math.max(minImageFrameHeight, imageInfoY - 54),
      };
      const root = new Container();
      const card = new Graphics();
      const typeDot = new Graphics();
      const statusPill = new Graphics();
      const typeLabel = new Text({
        resolution: textResolutionRef.current,
        text: item.type === "image" ? "IMAGE" : "NOTE",
        style: {
          fill: palette.muted,
          fontFamily: pixiMonoFont,
          fontSize: 9.5,
          fontWeight: "700",
          letterSpacing: 0.7,
        },
      });
      const idText = new Text({
        resolution: textResolutionRef.current,
        text: `#${item.id.slice(0, 4).toUpperCase()}`,
        style: {
          fill: palette.faint,
          fontFamily: pixiMonoFont,
          fontSize: 10,
          fontWeight: "600",
        },
      });
      const statusText = new Text({
        resolution: textResolutionRef.current,
        text: statusMeta.short.toUpperCase(),
        style: {
          fill: statusMeta.color,
          fontFamily: pixiMonoFont,
          fontSize: 9,
          fontWeight: "700",
          letterSpacing: 0.45,
        },
      });
      const titleText = new Text({
        resolution: textResolutionRef.current,
        text: item.type === "image"
          ? truncateForWidth(getImageDisplayTitle(item), imageTitleWidth, 7.2)
          : truncate(item.title, 48),
        style: {
          fill: palette.title,
          fontFamily: pixiFont,
          fontSize: 13,
          fontWeight: "700",
          lineHeight: 17,
          wordWrap: true,
          wordWrapWidth: cardWidth - 28,
        },
      });
      const bodyText = new Text({
        resolution: textResolutionRef.current,
        text: item.type === "image"
          ? truncateForWidth(getImageDisplayBody(item), cardWidth - cardPad * 2, 3.5)
          : truncate(item.body || item.imageUrl || "", 96),
        style: {
          fill: palette.body,
          fontFamily: pixiFont,
          fontSize: 12,
          fontWeight: "500",
          lineHeight: 18,
          wordWrap: true,
          wordWrapWidth: cardWidth - 28,
        },
      });
      const commentText = new Text({
        resolution: textResolutionRef.current,
        text: `${item.comments.length} comment${item.comments.length === 1 ? "" : "s"}`,
        style: {
          fill: palette.body,
          fontFamily: pixiMonoFont,
          fontSize: 10.5,
          fontWeight: "700",
        },
      });
      const authorInitialText = new Text({
        resolution: textResolutionRef.current,
        text: getInitials(item.author || "Roomboard").slice(0, 1),
        style: {
          fill: "#ffffff",
          fontFamily: pixiFont,
          fontSize: 8,
          fontWeight: "700",
        },
      });
      const authorAvatar = new Graphics();
      const authorText = new Text({
        resolution: textResolutionRef.current,
        text: item.author ? truncate(item.author, 14) : "Roomboard",
        style: {
          fill: palette.muted,
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
      const statusPillWidth = Math.min(86, Math.max(50, statusText.width + 18));
      statusPill.roundRect(0, 0, statusPillWidth, 18, 999)
        .fill({ alpha: theme === "light" ? 0.12 : 0.16, color: toColor(statusMeta.color) });
      statusPill.roundRect(0, 0, statusPillWidth, 18, 999)
        .stroke({ alpha: theme === "light" ? 0.24 : 0.34, color: toColor(statusMeta.color), width: 1 });
      statusPill.position.set(70, 8);
      statusText.anchor.set(0.5);
      statusText.position.set(70 + statusPillWidth / 2, 17);
      idText.position.set(cardWidth - 56, 11);
      titleText.position.set(cardPad, item.type === "image" ? imageInfoY + 8 : 44);
      
      if (item.type === "image") {
        bodyText.visible = true;
        titleText.style.wordWrap = false;
        titleText.style.wordWrapWidth = imageTitleWidth;
        if (item.imageUrl) {
          bodyText.text = truncateForWidth(getImageDisplayBody(item), cardWidth - cardPad * 2, 6.2);
          bodyText.style.fontSize = 11;
          bodyText.style.fill = palette.muted;
          bodyText.style.lineHeight = 15;
          bodyText.style.wordWrap = false;
          bodyText.style.wordWrapWidth = cardWidth - cardPad * 2;
          bodyText.position.set(cardPad, imageInfoY + 29);
        } else {
          titleText.position.set(cardPad, imageInfoY + 8);
          titleText.text = "Missing image source";
          bodyText.text = "Paste a URL or upload an image to fill this card.";
          bodyText.style.fill = palette.body;
          bodyText.style.lineHeight = 15;
          bodyText.style.wordWrap = false;
          bodyText.style.wordWrapWidth = cardWidth - cardPad * 2;
          bodyText.position.set(cardPad, imageInfoY + 29);
        }
      } else {
        bodyText.visible = true;
        bodyText.position.set(12, 72);
      }
      commentText.position.set(cardPad, footerY + 10);
      authorAvatar.roundRect(0, 0, 14, 14, 7).fill({ color: toColor(item.color) });
      authorInitialText.anchor.set(0.5);
      const authorGroupWidth = Math.min(104, 19 + authorText.width);
      const authorGroupX = Math.max(12, cardWidth - authorGroupWidth - 12);
      authorAvatar.position.set(authorGroupX, footerY + 7);
      authorInitialText.position.set(authorGroupX + 7, footerY + 14);
      authorText.position.set(authorGroupX + 19, footerY + 10);
      
      root.addChild(
        card,
        typeDot,
        typeLabel,
        statusPill,
        statusText,
        idText,
        titleText,
        bodyText,
        commentText,
        authorAvatar,
        authorInitialText,
        authorText,
      );

      if (item.type === "image" && item.imageUrl) {
        const linkPill = new Container();
        const pillBg = new Graphics();
        const linkText = new Text({
          resolution: textResolutionRef.current,
          text: sourcePillText,
          style: {
            fill: palette.accent,
            fontFamily: pixiMonoFont,
            fontSize: 9.5,
            fontWeight: "600",
          },
        });
        
        linkPill.addChild(pillBg, linkText);
        
        const pillW = sourcePillWidth;
        const pillH = 22;
        
        linkText.anchor.set(0.5);
        linkText.position.set(pillW / 2, pillH / 2);
        
        const drawPill = (hovered = false) => {
          pillBg.clear();
          pillBg.roundRect(0, 0, pillW, pillH, 999)
            .fill({ alpha: hovered ? 0.18 : 0.11, color: toColor(palette.accent) });
          pillBg.roundRect(0, 0, pillW, pillH, 999)
            .stroke({ alpha: hovered ? 0.55 : 0.28, color: toColor(palette.accent), width: 1 });
        };
        
        drawPill(false);
        linkPill.position.set(cardWidth - pillW - cardPad, imageInfoY + 5);
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
        const cardTintAmount = item.type === "image"
          ? theme === "light" ? 0.025 : 0.035
          : theme === "light" ? 0.045 : 0.07;
        const fill = mixHex(item.color, palette.cardMix, cardTintAmount);
        const stripeWidth = 3;
        const stripeRadius = 8;
        const stripeCapInset = 1.8;

        card.roundRect(0, 0, cardWidth, cardHeight, 8).fill({ alpha: theme === "light" ? 1 : 0.98, color: fill });
        card.moveTo(stripeWidth, stripeCapInset);
        card.quadraticCurveTo(0, 2.2, 0, stripeRadius);
        card.lineTo(0, cardHeight - stripeRadius);
        card.quadraticCurveTo(0, cardHeight - 2.2, stripeWidth, cardHeight - stripeCapInset);
        card.lineTo(stripeWidth, stripeCapInset);
        card.fill({ color: toColor(item.color) });
        card.rect(3, headerHeight - 1, cardWidth - 3, 1).fill({ alpha: 0.95, color: toColor(palette.separator) });
        card.rect(3, footerY, cardWidth - 3, 1).fill({ alpha: 0.95, color: toColor(palette.separator) });
        card.rect(3, footerY + 1, cardWidth - 3, footerHeight - 1).fill({ alpha: theme === "light" ? 0.88 : 0.52, color: toColor(palette.footer) });

        if (item.type === "image" && item.imageUrl) {
          card.rect(3, imageInfoY, cardWidth - 3, 1).fill({ alpha: 0.7, color: toColor(palette.separator) });
          card.roundRect(imageFrame.x, imageFrame.y, imageFrame.width, imageFrame.height, 6).fill({ color: toColor(palette.frame) });
          card.roundRect(imageFrame.x, imageFrame.y, imageFrame.width, imageFrame.height, 6).stroke({ alpha: 0.75, color: toColor(palette.frameBorder), width: 1 });
        }

        if (item.type === "image" && !item.imageUrl) {
          card.rect(3, imageInfoY, cardWidth - 3, 1).fill({ alpha: 0.7, color: toColor(palette.separator) });
          card.roundRect(imageFrame.x, imageFrame.y, imageFrame.width, imageFrame.height, 6).fill({ alpha: theme === "light" ? 0.95 : 0.72, color: toColor(palette.frame) });
          card.roundRect(imageFrame.x, imageFrame.y, imageFrame.width, imageFrame.height, 6).stroke({ alpha: 0.8, color: toColor(palette.frameBorder), width: 1 });
        }

        card.roundRect(0, 0, cardWidth, cardHeight, 8).stroke({
          alpha: active ? 1 : 0.95,
          color: active ? toColor(palette.accent) : toColor(palette.border),
          width: active ? 2 : 1,
        });
      };

      root.on("pointertap", () => {
        if (!didMove) {
          if (canEditRoom && isConnectingRef.current) {
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
        if (!canEditRoom) {
          return;
        }

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

    for (const item of visibleItems) {
      drawItem(item);
    }

    const drawConnections = () => {
      scene.connectionGraphics.clear();
      
      for (const c of visibleConnections) {
        const fromContainer = scene.itemMap.get(c.from);
        const toContainer = scene.itemMap.get(c.to);
        if (!fromContainer || !toContainer) continue;

        const fromItem = visibleItems.find(item => item.id === c.from);
        const toItem = visibleItems.find(item => item.id === c.to);
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
        const colorStr = active ? c.color || fromItem.color || palette.accent : palette.connector;
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
  }, [canEditRoom, visibleItems, visibleConnections, publishBoardEvent, refreshRoomSnapshot, sceneReady, selectedId, theme]);

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
        resolution: textResolutionRef.current,
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

  const createItem = async (
    type: "image" | "note",
    url?: string,
    size?: { width: number; height: number },
    initialText?: { title?: string; body?: string },
  ) => {
    if (!canEditRoom) {
      return;
    }

    if (!user?.profileComplete) {
      requestProfile();
      return;
    }

    const response = await fetch(roomApi, {
      body: JSON.stringify({
        action: "item",
        author: user.name,
        body: initialText?.body ?? (type === "image" ? "Review thread ready - source saved." : "New note"),
        color: user.color,
        height: size?.height,
        imageUrl: url,
        title: initialText?.title ?? (type === "image" ? "Visual reference" : "Untitled note"),
        type,
        width: size?.width,
      }),
      headers: { "Content-Type": "application/json", ...roomCredentialsHeaders },
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
      void refreshRoomSnapshot();
    }
  };

  const createImageFromFile = async (file: File) => {
    if (!canEditRoom) {
      return;
    }

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
    if (inviteToken) formData.append("inviteToken", inviteToken);
    if (ownerToken) formData.append("ownerToken", ownerToken);

    const response = await fetch("/api/uploads", {
      body: formData,
      method: "POST",
    });
    const data = (await response.json()) as { url?: string };

    if (data.url) {
      const fileTitle = file.name
        .replace(/\.[^.]+$/, "")
        .replace(/[-_]+/g, " ")
        .trim();
      await createItem("image", data.url, imageSize, {
        body: "Review thread ready - source saved.",
        title: fileTitle ? truncate(fileTitle, 64) : "Uploaded visual reference",
      });
    }
  };

  const createImageFromUrl = async (url: string) => {
    if (!canEditRoom) {
      return;
    }

    const trimmedUrl = url.trim();
    const imageSize = await getImageDimensions(trimmedUrl)
      .then((dimensions) => getImageCardSize(dimensions.width, dimensions.height))
      .catch(() => getImageCardSize());

    const domain = getDomain(trimmedUrl);
    await createItem("image", trimmedUrl, imageSize, {
      body: "Review thread ready - source saved.",
      title: domain === "Link" ? "Linked visual reference" : `Reference from ${domain}`,
    });
  };

  const saveSelected = async () => {
    if (!selected || !canEditRoom) {
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
        author: user?.name,
        height: nextImageSize?.height,
        id: selected.id,
        imageUrl,
        status: draftStatus,
        title: draftTitle,
        width: nextImageSize?.width,
      }),
      headers: { "Content-Type": "application/json", ...roomCredentialsHeaders },
      method: "PATCH",
    });
    const data = (await response.json()) as { item?: RoomItem };

    if (data.item) {
      setItems((current) => current.map((item) => (item.id === data.item!.id ? data.item! : item)));
      publishBoardEvent({ type: "item:updated", item: data.item });
      void refreshRoomSnapshot();
    }
  };

  const updateSelectedStatus = async (status: RoomItemStatus) => {
    if (!selected || !canEditRoom) {
      return;
    }

    setDraftStatus(status);
    const response = await fetch(roomApi, {
      body: JSON.stringify({
        author: user?.name,
        id: selected.id,
        status,
      }),
      headers: { "Content-Type": "application/json", ...roomCredentialsHeaders },
      method: "PATCH",
    });
    const data = (await response.json()) as { item?: RoomItem };

    if (data.item) {
      setItems((current) => current.map((item) => (item.id === data.item!.id ? data.item! : item)));
      publishBoardEvent({ type: "item:updated", item: data.item });
      void refreshRoomSnapshot();
    }
  };

  const submitComment = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (!selected || !canEditRoom || !user?.profileComplete || comment.trim().length === 0) {
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
      headers: { "Content-Type": "application/json", ...roomCredentialsHeaders },
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
      void refreshRoomSnapshot();
    }

    setComment("");
  };

  const handleCreateConnection = async (fromId: string, toId: string) => {
    if (!canEditRoom) {
      return;
    }

    if (!user?.profileComplete) {
      requestProfile();
      return;
    }

    const response = await fetch(roomApi, {
      body: JSON.stringify({
        action: "connection",
        author: user.name,
        from: fromId,
        to: toId,
        color: user?.color || "#48a7ff",
      }),
      headers: { "Content-Type": "application/json", ...roomCredentialsHeaders },
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
      void refreshRoomSnapshot();
    }
  };

  const handleDeleteConnection = async (connId: string) => {
    if (!canEditRoom) {
      return;
    }

    const response = await fetch(roomApi, {
      body: JSON.stringify({
        action: "delete-connection",
        author: user?.name,
        connectionId: connId,
      }),
      headers: { "Content-Type": "application/json", ...roomCredentialsHeaders },
      method: "POST",
    });
    const data = (await response.json()) as { ok?: boolean };

    if (data.ok) {
      setConnections((current) => current.filter((connection) => connection.id !== connId));
      publishBoardEvent({ type: "connection:deleted", connectionId: connId });
      void refreshRoomSnapshot();
    }
  };

  const handleDeleteItem = async (itemId: string) => {
    if (!itemId || !canEditRoom) return;

    const response = await fetch(roomApi, {
      body: JSON.stringify({
        action: "delete-item",
        author: user?.name,
        id: itemId,
      }),
      headers: { "Content-Type": "application/json", ...roomCredentialsHeaders },
      method: "POST",
    });
    const data = (await response.json()) as { ok?: boolean };

    if (data.ok) {
      setItems((current) => current.filter((item) => item.id !== itemId));
      setConnections((current) => current.filter((connection) => connection.from !== itemId && connection.to !== itemId));
      publishBoardEvent({ type: "item:deleted", itemId });
      void refreshRoomSnapshot();
    }

    if (selectedId === itemId) {
      setSelectedId("");
    }
  };

  const toggleRoomAccess = async () => {
    if (!canManageRoom) {
      return;
    }

    const nextAccess: RoomAccess = roomAccess === "locked" ? "link" : "locked";
    const response = await fetch(roomApi, {
      body: JSON.stringify({ action: "access", access: nextAccess }),
      headers: { "Content-Type": "application/json", ...roomCredentialsHeaders },
      method: "PATCH",
    });

    if (response.ok) {
      setRoomAccessState(nextAccess);
      const data = (await response.json()) as { room?: RoomSnapshot["room"] };

      if (data.room) {
        publishBoardEvent({ type: "room:updated", room: data.room });
        void refreshRoomSnapshot();
      }
    }
  };

  const closeRoom = async () => {
    if (!canManageRoom) {
      return;
    }

    setIsClosingRoom(true);

    try {
      const response = await fetch(roomApi, { headers: roomCredentialsHeaders, method: "DELETE" });

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

  const copyRoomLink = async (kind: "current" | RoomInviteRole) => {
    const url = new URL(window.location.href);
    url.pathname = `/rooms/${roomId}`;
    url.search = "";

    if (kind !== "current") {
      const token = inviteTokens[kind];

      if (!token) {
        return;
      }

      url.searchParams.set("invite", token);
    }

    await navigator.clipboard.writeText(url.toString());
    setCopiedShare(kind);
    window.setTimeout(() => setCopiedShare(""), 1400);
  };

  // Zoom handlers
  const handleZoomIn = () => {
    const scene = sceneRef.current;
    if (!scene) return;
    const nextScale = setWorldZoom(scene, scene.world.scale.x * 1.2);
    syncTextResolution(nextScale);
    syncGridTransform(scene);
    setZoomPercent(Math.round(nextScale * 100));
  };

  const handleZoomOut = () => {
    const scene = sceneRef.current;
    if (!scene) return;
    const nextScale = setWorldZoom(scene, scene.world.scale.x / 1.2);
    syncTextResolution(nextScale);
    syncGridTransform(scene);
    setZoomPercent(Math.round(nextScale * 100));
  };

  const handleZoomReset = () => {
    const scene = sceneRef.current;
    if (!scene) return;
    const nextScale = setWorldZoom(scene, 1.0);
    syncTextResolution(nextScale);
    syncGridTransform(scene);
    setZoomPercent(Math.round(nextScale * 100));
  };

  const handleZoomFit = () => {
    const scene = sceneRef.current;
    if (!scene || visibleItems.length === 0) return;

    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    visibleItems.forEach((item) => {
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
    idealScale = clampZoom(idealScale);

    const centerX = minX + (maxX - minX) / 2;
    const centerY = minY + (maxY - minY) / 2;

    scene.world.scale.set(idealScale);
    scene.world.x = hostW / 2 - centerX * idealScale;
    scene.world.y = hostH / 2 - centerY * idealScale;

    syncTextResolution(idealScale);
    syncGridTransform(scene);
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

      if (canEditRoom && (event.key === "Delete" || event.key === "Backspace")) {
        if (selectedId) {
          event.preventDefault();
          void handleDeleteItem(selectedId);
        }
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [canEditRoom, selectedId]);

  const onDrop = async (event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    setIsDraggingImage(false);
    if (!canEditRoom) {
      return;
    }

    const file = event.dataTransfer.files[0];

    if (!file) {
      return;
    }

    await createImageFromFile(file);
  };

  const selectedConnections = selected
    ? connections.filter((connection) => connection.from === selected.id || connection.to === selected.id)
    : [];
  const selectedActivities = selected
    ? activities.filter((activity) => activity.itemId === selected.id).slice(0, 5)
    : [];
  const boardActivities = activities.slice(0, 8);
  const peopleCount = presence.length + 1;
  const isBoardReady = hasRoomSnapshot && sceneReady;
  const canLeaveLoader = isBoardReady && hasMinimumLoaderElapsed;
  const syncModeLabel = !realtimeEndpoint
    ? "local"
    : useRealtimeFallback
      ? "local fallback"
      : realtimeStatus === "connected"
        ? "elixir"
        : realtimeStatus;
  const loaderMessage = roomLoadError ? "Could not open room" : hasRoomSnapshot ? "Preparing canvas" : "Syncing board";
  const loaderDetail = roomLoadError
    ? roomLoadError
    : realtimeEndpoint && !useRealtimeFallback
      ? realtimeStatus === "connected"
        ? "Preparing the Pixi canvas with Phoenix realtime connected."
        : "Loading room state and joining Phoenix realtime."
      : useRealtimeFallback
        ? "Loading room state with local realtime fallback."
      : "Loading room state, local presence, and the Pixi canvas.";

  return (
    <div className="rb-app" data-theme={theme}>
      <CanvasGrid {...gridTransform} />
      <div
        ref={hostRef}
        className={`canvas-host rb-canvas-wrap ${isConnecting ? "linking" : ""}`}
        onDragEnter={(event) => {
          event.preventDefault();
          if (canEditRoom && Array.from(event.dataTransfer.items).some((item) => item.type.startsWith("image/"))) {
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
      {(!canLeaveLoader || Boolean(roomLoadError)) && (
        <RoomboardLoader
          actionHref={roomLoadError ? "/" : undefined}
          detail={loaderDetail}
          message={loaderMessage}
          state={roomLoadError ? "error" : "loading"}
        />
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
          <span className={`rb-status ${roomAccess === "locked" ? "locked" : ""} ${canEditRoom ? "" : "readonly"}`}>
            <span className="rb-status__dot" />
            {getRoleLabel(permissions)} · {roomAccess === "locked" ? "invited" : "link"}
          </span>
        </div>

        <div className="rb-header__right">
          <button
            aria-label={theme === "dark" ? "Switch to light" : "Switch to dark"}
            className="rb-btn ghost sm rb-theme-toggle"
            onClick={toggleTheme}
            title={theme === "dark" ? "Switch to light" : "Switch to dark"}
            type="button"
          >
            {theme === "dark" ? (
              <Sun size={14} aria-hidden="true" />
            ) : (
              <Moon size={14} aria-hidden="true" />
            )}
          </button>
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
          {canManageRoom && (
            <>
              <button className="rb-btn" onClick={() => void toggleRoomAccess()} type="button">
                {roomAccess === "locked" ? (
                  <UnlockKeyhole size={14} aria-hidden="true" />
                ) : (
                  <LockKeyhole size={14} aria-hidden="true" />
                )}
                <span>{roomAccess === "locked" ? "Unlock" : "Lock"}</span>
              </button>
              <button className="rb-btn" onClick={() => void copyRoomLink("editor")} type="button">
                <Pencil size={14} aria-hidden="true" />
                <span>{copiedShare === "editor" ? "Copied" : "Editor link"}</span>
              </button>
              <button className="rb-btn" onClick={() => void copyRoomLink("viewer")} type="button">
                <Eye size={14} aria-hidden="true" />
                <span>{copiedShare === "viewer" ? "Copied" : "Viewer link"}</span>
              </button>
              <button className="rb-btn" onClick={() => setShowCloseModal(true)} type="button">
                <Archive size={14} aria-hidden="true" />
                <span>Close</span>
              </button>
            </>
          )}
          <button
            className="rb-btn primary"
            onClick={() => void copyRoomLink("current")}
            type="button"
          >
            <Copy size={14} aria-hidden="true" />
            <span>{copiedShare === "current" ? "Copied" : "Share"}</span>
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
      {!canEditRoom && canLeaveLoader && (
        <div className="rb-banner rb-banner--readonly">
          <ShieldCheck size={13} aria-hidden="true" />
          <span>Viewer mode</span>
        </div>
      )}
      {canLeaveLoader && items.length > 0 && visibleItems.length === 0 && (
        <div className="rb-filter-empty">
          No {reviewFilterOptions.find((option) => option.filter === reviewFilter)?.label.toLowerCase()} cards
        </div>
      )}

      <div className="rb-review-panel" aria-label="Review progress">
        <div className="rb-review-panel__head">
          <span>Review</span>
          <strong>{decidedCount}/{items.length}</strong>
        </div>
        <div className="rb-review-panel__bar" aria-hidden="true">
          <span style={{ width: `${reviewProgress}%` }} />
        </div>
        <div className="rb-review-panel__meta">
          <span>{unresolvedCount} unresolved</span>
          <span>{visibleItems.length} shown</span>
        </div>
        <div className="rb-review-filters" role="group" aria-label="Filter cards by status">
          {reviewFilterOptions.map((option) => {
            const color = option.filter === "all" ? "#8a909a" : getItemStatusMeta(option.filter).color;
            const count = option.filter === "all" ? items.length : statusCounts[option.filter];
            return (
              <button
                aria-pressed={reviewFilter === option.filter}
                className={reviewFilter === option.filter ? "selected" : ""}
                key={option.filter}
                onClick={() => setReviewFilter(option.filter)}
                style={{ "--status-color": color } as CSSProperties}
                type="button"
              >
                <span>{option.label}</span>
                <strong>{count}</strong>
              </button>
            );
          })}
        </div>
      </div>

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
        <button
          aria-label="Add note"
          className="rb-tool"
          disabled={!canEditRoom}
          onClick={() => void createItem("note")}
          type="button"
        >
          <StickyNote size={14} aria-hidden="true" />
          <span>Add note</span>
        </button>
        <button
          className={`rb-tool ${isConnecting ? "active" : ""}`}
          disabled={!canEditRoom}
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
            if (canEditRoom && toolbarImageUrl.trim()) {
              void createImageFromUrl(toolbarImageUrl);
              setToolbarImageUrl("");
            }
          }}
        >
          <FileImage size={12} aria-hidden="true" />
          <input
            aria-label="Image URL"
            disabled={!canEditRoom}
            onChange={(event) => setToolbarImageUrl(event.target.value)}
            placeholder="Paste image URL"
            value={toolbarImageUrl}
          />
          <button aria-label="Add image from URL" disabled={!canEditRoom} type="submit">
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
        <button className="rb-tool" disabled={!canEditRoom} onClick={() => fileInputRef.current?.click()} type="button">
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
                onBlur={() => canEditRoom && void saveSelected()}
                onChange={(event) => setDraftTitle(event.target.value)}
                readOnly={!canEditRoom}
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
                    disabled={!canEditRoom}
                    key={c}
                    onClick={async () => {
                      const response = await fetch(roomApi, {
                        body: JSON.stringify({ author: user?.name, id: selected.id, color: c }),
                        headers: { "Content-Type": "application/json", ...roomCredentialsHeaders },
                        method: "PATCH",
                      });
                      const data = (await response.json()) as { item?: RoomItem };

                      if (data.item) {
                        setItems((current) => current.map((item) => (item.id === data.item!.id ? data.item! : item)));
                        publishBoardEvent({ type: "item:updated", item: data.item });
                        void refreshRoomSnapshot();
                      }
                    }}
                    style={{ backgroundColor: c }}
                    type="button"
                  />
                ))}
              </div>
            </div>

            <div className="rb-field">
              <span className="rb-field__label">Decision status</span>
              <div className="rb-status-segmented" role="group" aria-label="Decision status">
                {itemStatusOptions.map((option) => {
                  const meta = getItemStatusMeta(option.status);
                  return (
                    <button
                      aria-pressed={draftStatus === option.status}
                      className={draftStatus === option.status ? "selected" : ""}
                      disabled={!canEditRoom}
                      key={option.status}
                      onClick={() => void updateSelectedStatus(option.status)}
                      style={{ "--status-color": meta.color } as CSSProperties}
                      type="button"
                    >
                      {option.label}
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="rb-field">
              <label className="rb-field__label" htmlFor="room-body">Notes</label>
              <textarea
                className="rb-input"
                id="room-body"
                onBlur={() => canEditRoom && void saveSelected()}
                onChange={(event) => setDraftBody(event.target.value)}
                readOnly={!canEditRoom}
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
                  onBlur={() => canEditRoom && void saveSelected()}
                  onChange={(event) => setImageUrl(event.target.value)}
                  placeholder="Enter image URL"
                  readOnly={!canEditRoom}
                  value={imageUrl}
                />
                {selected.imageUrl ? (
                  <>
                    <div className="rb-image-meta">
                      <span>{getDomain(selected.imageUrl)}</span>
                      <a href={selected.imageUrl} rel="noreferrer" target="_blank">
                        <Link2 size={11} aria-hidden="true" />
                        Open source
                      </a>
                    </div>
                    <div className="rb-image-preview">
                      <img alt={selected.title} src={selected.imageUrl} />
                    </div>
                  </>
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
                        disabled={!canEditRoom}
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
                  disabled={!canEditRoom}
                  onChange={(event) => setComment(event.target.value)}
                  placeholder="Add a comment"
                  value={comment}
                />
                <button disabled={!canEditRoom || comment.trim().length === 0} type="submit">
                  <Send size={13} aria-hidden="true" />
                </button>
              </form>
            </div>

            <div className="rb-inspector__section">
              <div className="rb-inspector__section-title">
                Activity <span className="count">{selectedActivities.length}</span>
              </div>
              <ActivityList activities={selectedActivities} empty="No activity for this card yet." />
            </div>

            <div className="rb-inspector__danger">
              <button
                className="rb-btn danger-line"
                disabled={!canEditRoom}
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
            <div className="rb-inspector__section">
              <div className="rb-inspector__section-title">
                Activity <span className="count">{boardActivities.length}</span>
              </div>
              <ActivityList activities={boardActivities} empty="No room activity yet." />
            </div>
          </div>
        )}
      </aside>

      <div className="rb-coords" aria-hidden="true">
        <div className="rb-coords__chip"><span className="rb-coords__label">objects</span>{visibleItems.length}/{items.length}</div>
        <div className="rb-coords__chip"><span className="rb-coords__label">links</span>{visibleConnections.length}/{connections.length}</div>
        <div className="rb-coords__chip"><span className="rb-coords__label">sync</span>{syncModeLabel}</div>
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

      {showProfileModal && canLeaveLoader && (
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
                    saveLocalUser(updatedUser);
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
