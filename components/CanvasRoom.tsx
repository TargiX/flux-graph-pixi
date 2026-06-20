"use client";

import { FormEvent, useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { useRouter } from "next/navigation";
import { 
  Archive,
  Download,
  Eye,
  EyeOff,
  FileText,
  FileImage, 
  MessageSquarePlus, 
  MousePointer2, 
  Pencil,
  RefreshCw,
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
  UnlockKeyhole,
  ChevronDown,
  Plus
} from "lucide-react";
import { Application, Container, Graphics, Text, TextStyle, CanvasTextMetrics, Sprite, Texture, type FederatedPointerEvent } from "pixi.js";
import type {
  RoomAccess,
  RoomActivity,
  RoomConnection,
  RoomConnectionSide,
  RoomInviteRole,
  RoomItem,
  RoomItemStatus,
  RoomPermissions,
  RoomRecap,
  RoomSnapshot,
  RoomVisibility,
} from "@/lib/canvasRoom";
import { getLifecycleCopy } from "@/lib/lifecycleCopy";
import type { PresenceSnapshot } from "@/lib/presence";
import { PRESENCE_TTL_MS, pruneStalePresence } from "@/lib/presenceTtl";
import {
  createRoomboardRealtimeSession,
  type RoomboardBoardEventInput,
  type RoomboardRealtimeStatus,
  type RoomboardRealtimeSession,
} from "@/lib/roomboardRealtime";
import { mergePresenceSnapshots } from "@/lib/realtimeHelpers";
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
  draftConnectionGraphics: Graphics;
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

type CanvasPoint = {
  x: number;
  y: number;
};

type CanvasRect = CanvasPoint & {
  height: number;
  width: number;
};

type ConnectionSide = RoomConnectionSide;

type ConnectionDraft = {
  dragged: boolean;
  fromId: string;
  fromSide: ConnectionSide;
  originGlobal: CanvasPoint;
  pointer: CanvasPoint;
  start: CanvasPoint;
  targetId: string;
  targetSide?: ConnectionSide;
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
const dragBroadcastIntervalMs = 50;
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
const connectionHandleRadius = 5.5;
const connectionHandleHitRadius = 12;
const connectionArrowHitRadius = 20;
const connectionPipeCornerRadius = 15;
const connectionPipeFanOutStep = 10;
const connectionPipeOffset = 34;
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

function getRectCenter(rect: CanvasRect): CanvasPoint {
  return {
    x: rect.x + rect.width / 2,
    y: rect.y + rect.height / 2,
  };
}

function getSideVector(side: ConnectionSide): CanvasPoint {
  if (side === "left") return { x: -1, y: 0 };
  if (side === "right") return { x: 1, y: 0 };
  if (side === "top") return { x: 0, y: -1 };
  return { x: 0, y: 1 };
}

function getFacingSide(fromRect: CanvasRect, toRect: CanvasRect | CanvasPoint): ConnectionSide {
  const fromCenter = getRectCenter(fromRect);
  const toCenter = "width" in toRect ? getRectCenter(toRect) : toRect;
  const dx = toCenter.x - fromCenter.x;
  const dy = toCenter.y - fromCenter.y;

  if (Math.abs(dx) >= Math.abs(dy) * 0.82) {
    return dx >= 0 ? "right" : "left";
  }

  return dy >= 0 ? "bottom" : "top";
}

function getSocketPoint(rect: CanvasRect, side: ConnectionSide): CanvasPoint {
  if (side === "left" || side === "right") {
    return {
      x: side === "left" ? rect.x : rect.x + rect.width,
      y: rect.y + rect.height / 2,
    };
  }

  return {
    x: rect.x + rect.width / 2,
    y: side === "top" ? rect.y : rect.y + rect.height,
  };
}

function getNearestSocketSide(rect: CanvasRect, point: CanvasPoint): ConnectionSide {
  const sides: ConnectionSide[] = ["top", "right", "bottom", "left"];
  let nearestSide: ConnectionSide = "right";
  let nearestDistance = Number.POSITIVE_INFINITY;

  for (const side of sides) {
    const socket = getSocketPoint(rect, side);
    const distance = Math.hypot(point.x - socket.x, point.y - socket.y);

    if (distance < nearestDistance) {
      nearestDistance = distance;
      nearestSide = side;
    }
  }

  return nearestSide;
}

function getDropTargetSide(fromRect: CanvasRect, toRect: CanvasRect, pointer: CanvasPoint): ConnectionSide {
  const nearestSide = getNearestSocketSide(toRect, pointer);
  const nearestSocket = getSocketPoint(toRect, nearestSide);
  const nearSocketDistance = Math.hypot(pointer.x - nearestSocket.x, pointer.y - nearestSocket.y);

  if (nearSocketDistance <= connectionHandleHitRadius * 2.4) {
    return nearestSide;
  }

  return getFacingSide(toRect, fromRect);
}

function compactPipePoints(points: CanvasPoint[]) {
  const next: CanvasPoint[] = [];

  for (const point of points) {
    const previous = next[next.length - 1];

    if (!previous || Math.hypot(point.x - previous.x, point.y - previous.y) > 0.5) {
      next.push(point);
    }
  }

  return next;
}

function getPointPipeRoute(
  fromRect: CanvasRect,
  toPoint: CanvasPoint,
  fromSide?: ConnectionSide,
  startOverride?: CanvasPoint,
) {
  const sourceSide = fromSide ?? getFacingSide(fromRect, toPoint);
  const sourceVector = getSideVector(sourceSide);
  const start = startOverride ?? getSocketPoint(fromRect, sourceSide);
  const sourceOut = {
    x: start.x + sourceVector.x * connectionPipeOffset,
    y: start.y + sourceVector.y * connectionPipeOffset,
  };
  const elbow =
    sourceSide === "left" || sourceSide === "right"
      ? { x: toPoint.x, y: sourceOut.y }
      : { x: sourceOut.x, y: toPoint.y };

  return compactPipePoints([start, sourceOut, elbow, toPoint]);
}

function getCardPipeRoute(
  fromRect: CanvasRect,
  toRect: CanvasRect,
  fromSide?: ConnectionSide,
  toSide?: ConnectionSide,
  startOverride?: CanvasPoint,
  endOverride?: CanvasPoint,
  fanOut = 0,
) {
  const sourceSide = fromSide ?? getFacingSide(fromRect, toRect);
  const targetSide = toSide ?? getFacingSide(toRect, fromRect);
  const sourceVector = getSideVector(sourceSide);
  const targetVector = getSideVector(targetSide);
  const startPort = startOverride ?? getSocketPoint(fromRect, sourceSide);
  const endPort = endOverride ?? getSocketPoint(toRect, targetSide);
  const sourceOut = {
    x: startPort.x + sourceVector.x * connectionPipeOffset,
    y: startPort.y + sourceVector.y * connectionPipeOffset,
  };
  const targetIn = {
    x: endPort.x + targetVector.x * connectionPipeOffset,
    y: endPort.y + targetVector.y * connectionPipeOffset,
  };
  const sourceHorizontal = sourceSide === "left" || sourceSide === "right";
  const targetHorizontal = targetSide === "left" || targetSide === "right";
  const points = [startPort, sourceOut];

  if (sourceHorizontal && targetHorizontal) {
    if (Math.abs(sourceOut.y - targetIn.y) < 1 && fanOut !== 0) {
      const laneY = sourceOut.y + fanOut;
      points.push({ x: sourceOut.x, y: laneY }, { x: targetIn.x, y: laneY });
    } else {
      const midX = sourceOut.x + (targetIn.x - sourceOut.x) / 2 + fanOut;
      points.push({ x: midX, y: sourceOut.y }, { x: midX, y: targetIn.y });
    }
  } else if (!sourceHorizontal && !targetHorizontal) {
    if (Math.abs(sourceOut.x - targetIn.x) < 1 && fanOut !== 0) {
      const laneX = sourceOut.x + fanOut;
      points.push({ x: laneX, y: sourceOut.y }, { x: laneX, y: targetIn.y });
    } else {
      const midY = sourceOut.y + (targetIn.y - sourceOut.y) / 2 + fanOut;
      points.push({ x: sourceOut.x, y: midY }, { x: targetIn.x, y: midY });
    }
  } else if (sourceHorizontal) {
    const laneX = targetIn.x + fanOut;
    points.push({ x: laneX, y: sourceOut.y }, { x: laneX, y: targetIn.y });
  } else {
    const laneY = targetIn.y + fanOut;
    points.push({ x: sourceOut.x, y: laneY }, { x: targetIn.x, y: laneY });
  }

  points.push(targetIn, endPort);

  return compactPipePoints(points);
}

function getConnectionPairKey(fromId: string, toId: string) {
  return [fromId, toId].sort().join("::");
}

function upsertUniqueConnection(connections: RoomConnection[], incoming: RoomConnection) {
  const incomingPairKey = getConnectionPairKey(incoming.from, incoming.to);
  return [
    ...connections.filter((connection) => (
      connection.id !== incoming.id && getConnectionPairKey(connection.from, connection.to) !== incomingPairKey
    )),
    incoming,
  ];
}

function getConnectionFanOut(index: number, total: number) {
  if (total <= 1) {
    return 0;
  }

  if (total === 2) {
    return index === 0 ? -connectionPipeFanOutStep : connectionPipeFanOutStep;
  }

  return (index - (total - 1) / 2) * connectionPipeFanOutStep;
}

function drawRoundedPolyline(graphics: Graphics, points: CanvasPoint[], radius: number) {
  if (points.length === 0) {
    return;
  }

  graphics.moveTo(points[0].x, points[0].y);

  if (points.length === 1) {
    return;
  }

  for (let index = 1; index < points.length - 1; index += 1) {
    const previous = points[index - 1];
    const current = points[index];
    const next = points[index + 1];
    const inDx = current.x - previous.x;
    const inDy = current.y - previous.y;
    const outDx = next.x - current.x;
    const outDy = next.y - current.y;
    const inLength = Math.hypot(inDx, inDy);
    const outLength = Math.hypot(outDx, outDy);
    const cross = inDx * outDy - inDy * outDx;

    if (inLength < 0.5 || outLength < 0.5 || Math.abs(cross) < 0.5) {
      graphics.lineTo(current.x, current.y);
      continue;
    }

    const corner = Math.min(radius, inLength / 2, outLength / 2);
    const before = {
      x: current.x - (inDx / inLength) * corner,
      y: current.y - (inDy / inLength) * corner,
    };
    const after = {
      x: current.x + (outDx / outLength) * corner,
      y: current.y + (outDy / outLength) * corner,
    };

    graphics.lineTo(before.x, before.y);
    graphics.quadraticCurveTo(current.x, current.y, after.x, after.y);
  }

  const last = points[points.length - 1];
  graphics.lineTo(last.x, last.y);
}

function getPipeEndDirection(points: CanvasPoint[]) {
  const end = points[points.length - 1];

  if (!end) {
    return { x: 1, y: 0 };
  }

  for (let index = points.length - 2; index >= 0; index -= 1) {
    const previous = points[index];
    const dx = end.x - previous.x;
    const dy = end.y - previous.y;
    const length = Math.hypot(dx, dy);

    if (length > 0.5) {
      return { x: dx / length, y: dy / length };
    }
  }

  return { x: 1, y: 0 };
}

function getPipeMarker(points: CanvasPoint[], distanceFromEnd = 26) {
  const end = points[points.length - 1] ?? { x: 0, y: 0 };
  let remainingDistance = distanceFromEnd;

  for (let index = points.length - 2; index >= 0; index -= 1) {
    const start = points[index];
    const segmentEnd = points[index + 1];
    const dx = segmentEnd.x - start.x;
    const dy = segmentEnd.y - start.y;
    const length = Math.hypot(dx, dy);

    if (length < 0.5) {
      continue;
    }

    const direction = {
      x: dx / length,
      y: dy / length,
    };

    if (remainingDistance <= length) {
      return {
        direction,
        point: {
          x: segmentEnd.x - direction.x * remainingDistance,
          y: segmentEnd.y - direction.y * remainingDistance,
        },
      };
    }

    remainingDistance -= length;
  }

  return {
    direction: getPipeEndDirection(points),
    point: end,
  };
}

function getPipeArrowHitPoint(points: CanvasPoint[]) {
  return getPipeMarker(points).point;
}

function drawPipeArrow(
  graphics: Graphics,
  end: CanvasPoint,
  direction: CanvasPoint,
  color: number,
  alpha: number,
  size = 9,
) {
  const angle = Math.atan2(direction.y, direction.x);
  const wing = Math.PI / 6;
  const x1 = end.x - size * Math.cos(angle - wing);
  const y1 = end.y - size * Math.sin(angle - wing);
  const x2 = end.x - size * Math.cos(angle + wing);
  const y2 = end.y - size * Math.sin(angle + wing);

  graphics.poly([end.x, end.y, x1, y1, x2, y2]).fill({ alpha, color });
}

function drawPipeDirectionMarker(
  graphics: Graphics,
  points: CanvasPoint[],
  options: {
    alpha: number;
    color: number;
    haloAlpha: number;
    haloColor: number;
  },
) {
  if (points.length < 2) {
    return;
  }

  const marker = getPipeMarker(points);
  const { direction, point } = marker;
  const normal = {
    x: -direction.y,
    y: direction.x,
  };
  const stemStart = {
    x: point.x - direction.x * 15,
    y: point.y - direction.y * 15,
  };
  const stemEnd = {
    x: point.x - direction.x * 3,
    y: point.y - direction.y * 3,
  };
  const outerTip = {
    x: point.x + direction.x * 10,
    y: point.y + direction.y * 10,
  };
  const outerBack = {
    x: point.x - direction.x * 8,
    y: point.y - direction.y * 8,
  };
  const innerTip = {
    x: point.x + direction.x * 8,
    y: point.y + direction.y * 8,
  };
  const innerBack = {
    x: point.x - direction.x * 6,
    y: point.y - direction.y * 6,
  };

  graphics.moveTo(stemStart.x, stemStart.y);
  graphics.lineTo(stemEnd.x, stemEnd.y);
  graphics.stroke({ alpha: options.haloAlpha, color: options.haloColor, width: 8 });
  graphics.moveTo(stemStart.x, stemStart.y);
  graphics.lineTo(stemEnd.x, stemEnd.y);
  graphics.stroke({ alpha: Math.min(0.96, options.alpha + 0.04), color: options.color, width: 3 });

  graphics.poly([
    outerTip.x,
    outerTip.y,
    outerBack.x + normal.x * 8,
    outerBack.y + normal.y * 8,
    outerBack.x - normal.x * 8,
    outerBack.y - normal.y * 8,
  ]).fill({ alpha: options.haloAlpha, color: options.haloColor });
  graphics.poly([
    innerTip.x,
    innerTip.y,
    innerBack.x + normal.x * 5.5,
    innerBack.y + normal.y * 5.5,
    innerBack.x - normal.x * 5.5,
    innerBack.y - normal.y * 5.5,
  ]).fill({ alpha: Math.min(0.98, options.alpha + 0.08), color: options.color });
}

function drawRoundedPipe(
  graphics: Graphics,
  points: CanvasPoint[],
  options: {
    alpha: number;
    color: number;
    haloAlpha: number;
    haloColor: number;
    showArrow?: boolean;
    width: number;
  },
) {
  if (points.length < 2) {
    return;
  }

  drawRoundedPolyline(graphics, points, connectionPipeCornerRadius);
  graphics.stroke({ alpha: options.haloAlpha, color: options.haloColor, width: options.width + 4 });
  drawRoundedPolyline(graphics, points, connectionPipeCornerRadius);
  graphics.stroke({ alpha: options.alpha, color: options.color, width: options.width });

  const start = points[0];
  const end = points[points.length - 1];
  graphics.circle(start.x, start.y, Math.max(2.8, options.width * 1.45)).fill({
    alpha: Math.min(0.9, options.alpha + 0.08),
    color: options.color,
  });

  if (options.showArrow !== false) {
    drawPipeArrow(graphics, end, getPipeEndDirection(points), options.color, Math.min(0.96, options.alpha + 0.08));
  }
}

function truncate(value: string, length = 96) {
  return value.length > length ? `${value.slice(0, length - 2)}...` : value;
}

function truncateForWidth(value: string, width: number, averageCharWidth = 7) {
  return truncate(value, Math.max(8, Math.floor(width / averageCharWidth)));
}

function getRecapFileName(roomName: string) {
  const slug = roomName
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);

  return `${slug || "roomboard"}-recap.md`;
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
    "source saved - ready for review.",
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

  return item.imageUrl ? "Source saved - ready for review." : "Paste a URL or upload to start review.";
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
    const cardWidth = Math.max(240, item.width || 240);
    const titleStyle = new TextStyle({
      fontFamily: pixiFont,
      fontSize: 13,
      fontWeight: "700",
      lineHeight: 17,
      wordWrap: true,
      wordWrapWidth: cardWidth - 28,
    });
    const bodyStyle = new TextStyle({
      fontFamily: pixiFont,
      fontSize: 12,
      fontWeight: "500",
      lineHeight: 18,
      wordWrap: true,
      wordWrapWidth: cardWidth - 28,
    });
    
    const titleMetrics = CanvasTextMetrics.measureText(item.title || "", titleStyle);
    const bodyMetrics = CanvasTextMetrics.measureText(item.body || item.imageUrl || "", bodyStyle);
    
    const headerHeight = 38;
    const footerHeight = 36;
    const titleHeight = item.title ? titleMetrics.height : 0;
    const bodyHeight = (item.body || item.imageUrl) ? bodyMetrics.height : 0;
    
    let h = headerHeight;
    h += 8; // top padding
    if (titleHeight) h += titleHeight + 4;
    if (bodyHeight) h += bodyHeight + 8;
    h += footerHeight + 4;
    
    return { width: cardWidth, height: Math.max(item.height || 120, h) };
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
  const remoteTargetsRef = useRef(new Map<string, { x: number; y: number }>());
  const lastDragBroadcastRef = useRef(new Map<string, number>());
  const itemPropsRef = useRef(new Map<string, string>());
  const itemTickersRef = useRef(new Map<string, Array<(ticker: import("pixi.js").Ticker) => void>>());
  const isDraggingRef = useRef(false);
  const [renderGeneration, setRenderGeneration] = useState(0);
  const userRef = useRef<LocalUser | null>(null);
  const [items, setItems] = useState<RoomItem[]>([]);
  const [connections, setConnections] = useState<RoomConnection[]>([]);
  const [activities, setActivities] = useState<RoomActivity[]>([]);
  const [displayRoomName, setDisplayRoomName] = useState(roomName);
  const [roomAccess, setRoomAccessState] = useState<RoomAccess>("link");
  const [roomVisibility, setRoomVisibilityState] = useState<RoomVisibility>("public");
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
  const [roomClosed, setRoomClosed] = useState(false);
  const [selectedId, setSelectedId] = useState("");
  const [presence, setPresence] = useState<PresenceSnapshot[]>([]);
  const [sceneReady, setSceneReady] = useState(false);
  const [draftTitle, setDraftTitle] = useState("");
  const [draftBody, setDraftBody] = useState("");
  const [inlineEdit, setInlineEdit] = useState<{ id: string, field: "title" | "body", text: string } | null>(null);
  const [draftStatus, setDraftStatus] = useState<RoomItemStatus>("open");
  const [reviewFilter, setReviewFilter] = useState<ReviewFilter>("all");
  const [imageUrl, setImageUrl] = useState("");
  const [toolbarImageUrl, setToolbarImageUrl] = useState("");
  const [isDraggingImage, setIsDraggingImage] = useState(false);
  const [comment, setComment] = useState("");
  const [user, setUser] = useState<LocalUser | null>(null);
  const [showMainMenu, setShowMainMenu] = useState(false);
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
  const [showLockModal, setShowLockModal] = useState(false);
  const [isTogglingAccess, setIsTogglingAccess] = useState(false);
  const [roomRecap, setRoomRecap] = useState<RoomRecap | null>(null);
  const [isRecapLoading, setIsRecapLoading] = useState(false);
  const [isRecapExporting, setIsRecapExporting] = useState(false);
  const [copiedRecap, setCopiedRecap] = useState(false);
  const [exportedRecap, setExportedRecap] = useState(false);

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

  const canEditRoomRef = useRef(canEditRoom);
  const selectedIdRef = useRef(selectedId);
  const themeRef = useRef(theme);
  const visibleItemsRef = useRef(visibleItems);
  const visibleConnectionsRef = useRef(visibleConnections);
  const connectedItemIdsRef = useRef(new Set<string>());
  const connectionPairCountsRef = useRef(new Map<string, number>());
  const connectionDraftRef = useRef<ConnectionDraft | null>(null);
  const hoveredConnectionTargetRef = useRef("");
  const dragStateRef = useRef({ draggingItem: null as Container | null, activeDragId: "", didMove: false, lastPointer: { x: 0, y: 0 } });
  const structuralKeyRef = useRef("");
  canEditRoomRef.current = canEditRoom;
  selectedIdRef.current = selectedId;
  themeRef.current = theme;
  visibleItemsRef.current = visibleItems;
  visibleConnectionsRef.current = visibleConnections;
  const nextConnectedIds = new Set<string>();
  const nextPairCounts = new Map<string, number>();
  for (const c of visibleConnections) {
    nextConnectedIds.add(c.from);
    nextConnectedIds.add(c.to);
    const pk = getConnectionPairKey(c.from, c.to);
    nextPairCounts.set(pk, (nextPairCounts.get(pk) ?? 0) + 1);
  }
  connectedItemIdsRef.current = nextConnectedIds;
  connectionPairCountsRef.current = nextPairCounts;

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
      setRoomVisibilityState(snapshot.room?.visibility ?? "public");
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

  useEffect(() => {
    setRoomRecap(null);
    setCopiedRecap(false);
    setExportedRecap(false);
  }, [activities, connections, items]);

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
        setConnections((current) => upsertUniqueConnection(current, event.connection));
        return;
      }

      if (event.type === "connection:deleted") {
        setConnections((current) => current.filter((connection) => connection.id !== event.connectionId));
        return;
      }

      if (event.type === "room:updated") {
        setDisplayRoomName(event.room.name);
        setRoomAccessState(event.room.access);
        setRoomVisibilityState(event.room.visibility ?? "public");
        return;
      }

      if (event.type === "room:closed") {
        setRoomClosed(true);
      }
    },
    [withLocalPositions],
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
    userRef.current = user;
  }, [user]);

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
      setRoomClosed(true);
    });
    source.onerror = () => {
      if (!hasRoomSnapshotRef.current) {
        setRoomLoadError("Realtime connection failed before the room loaded.");
      }
    };

    return () => source.close();
  }, [applyRoomSnapshot, hasLoadedOwnerToken, roomStreamApi, useRealtimeFallback]);

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
        if (realtimeStatus === "connected" && now - lastServerSent >= 50) {
          lastServerSent = now;
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

  // ROADMAP #3 / AC #5: prune collaborators that have gone silent (tab close,
  // refresh, network loss) even when the room is quiet. mergePresenceSnapshots
  // already drops stale entries, but only when an incoming presence event
  // arrives — a still room would otherwise pin a stale collaborator on screen
  // past the TTL. Re-applying the TTL on a timer guarantees they disappear.
  useEffect(() => {
    const interval = window.setInterval(
      () => setPresence((current) => pruneStalePresence(current)),
      Math.round(PRESENCE_TTL_MS / 3),
    );

    return () => window.clearInterval(interval);
  }, []);

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
    const draftConnectionGraphics = new Graphics();
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
      world.addChild(connectionGraphics, draftConnectionGraphics, itemLayer);
      sceneRef.current = { app, cursorLayer, host: hostEl, itemLayer, itemMap, world, connectionGraphics, draftConnectionGraphics };
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

    if (isDraggingRef.current) {
      return;
    }

    const structuralKey = `${canEditRoom}:${theme}`;
    const structuralChanged = structuralKeyRef.current !== structuralKey;

    if (structuralChanged) {
      tickerCleanupRef.current.forEach((cleanup) => cleanup());
      tickerCleanupRef.current = [];
      scene.itemLayer.removeChildren();
      scene.itemMap.clear();
      scene.connectionGraphics.clear();
      itemTickersRef.current.clear();
      itemPropsRef.current.clear();
      structuralKeyRef.current = structuralKey;
    } else {
      for (const [id, container] of scene.itemMap.entries()) {
        if (!visibleItems.some((item) => item.id === id)) {
          scene.itemLayer.removeChild(container);
          const fns = itemTickersRef.current.get(id);
          if (fns) {
            fns.forEach((fn) => scene.app.ticker.remove(fn));
            itemTickersRef.current.delete(id);
          }
          container.destroy({ children: true });
          scene.itemMap.delete(id);
          itemPropsRef.current.delete(id);
        }
      }
    }

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

    const broadcastMove = (itemId: string, x: number, y: number, sentAt = Date.now()) => {
      const optimisticItem = visibleItemsRef.current.find((item) => item.id === itemId);

      if (optimisticItem) {
        publishBoardEvent({
          type: "item:moved",
          item: {
            ...optimisticItem,
            updatedAt: Math.max(optimisticItem.updatedAt, sentAt),
            x: Math.round(x),
            y: Math.round(y),
          },
        });
      }
    };

    const persistMove = (itemId: string, x: number, y: number) => {
      const move = commitLocalMove(itemId, x, y);
      broadcastMove(itemId, move.x, move.y, move.sentAt);
      lastDragBroadcastRef.current.delete(itemId);

      void fetch(roomApi, {
        body: JSON.stringify({ author: userRef.current?.name, id: itemId, x: move.x, y: move.y }),
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
    const getCardRect = (item: RoomItem): CanvasRect => {
      const size = getCardSize(item);
      const container = scene.itemMap.get(item.id);

      return {
        height: size.height,
        width: size.width,
        x: container?.x ?? item.x,
        y: container?.y ?? item.y,
      };
    };
    const toWorldPoint = (global: CanvasPoint) => ({
      x: (global.x - scene.world.x) / scene.world.scale.x,
      y: (global.y - scene.world.y) / scene.world.scale.y,
    });
    const findConnectionTarget = (point: CanvasPoint, fromId: string) => {
      const hitSlop = 18;
      const currentItems = visibleItemsRef.current;

      for (let index = currentItems.length - 1; index >= 0; index -= 1) {
        const candidate = currentItems[index];

        if (candidate.id === fromId) {
          continue;
        }

        const rect = getCardRect(candidate);

        if (
          point.x >= rect.x - hitSlop &&
          point.x <= rect.x + rect.width + hitSlop &&
          point.y >= rect.y - hitSlop &&
          point.y <= rect.y + rect.height + hitSlop
        ) {
          return candidate.id;
        }
      }

      return "";
    };
    const findConnectionArrowTarget = (point: CanvasPoint) => {
      let closestId = "";
      let closestDistance = connectionArrowHitRadius;
      const drawnPairCounts = new Map<string, number>();

      for (const connection of visibleConnectionsRef.current) {
        const fromItem = visibleItemsRef.current.find((item) => item.id === connection.from);
        const toItem = visibleItemsRef.current.find((item) => item.id === connection.to);

        if (!fromItem || !toItem) {
          continue;
        }

        const pairKey = getConnectionPairKey(connection.from, connection.to);
        const pairIndex = drawnPairCounts.get(pairKey) ?? 0;
        const pairTotal = connectionPairCountsRef.current.get(pairKey) ?? 1;
        const route = getCardPipeRoute(
          getCardRect(fromItem),
          getCardRect(toItem),
          connection.fromSide,
          connection.toSide,
          undefined,
          undefined,
          getConnectionFanOut(pairIndex, pairTotal),
        );
        const arrowPoint = getPipeArrowHitPoint(route);
        const distance = Math.hypot(point.x - arrowPoint.x, point.y - arrowPoint.y);
        drawnPairCounts.set(pairKey, pairIndex + 1);

        if (distance <= closestDistance) {
          closestId = connection.id;
          closestDistance = distance;
        }
      }

      return closestId;
    };
    const clearConnectionState = () => {
      connectionDraftRef.current = null;
      hoveredConnectionTargetRef.current = "";
      isConnectingRef.current = false;
      connectFromIdRef.current = null;
      setIsConnecting(false);
      setConnectFromId(null);
    };
    const clearConnectionDraft = () => {
      connectionDraftRef.current = null;
      hoveredConnectionTargetRef.current = "";
    };
    const completeConnection = (fromId: string, toId: string, fromSide?: ConnectionSide, toSide?: ConnectionSide) => {
      if (!fromId || !toId || fromId === toId) {
        clearConnectionState();
        return;
      }

      void handleCreateConnection(fromId, toId, fromSide, toSide);
      setSelectedId(toId);
      clearConnectionState();
    };
    const startOrCompleteConnection = (itemId: string) => {
      if (!canEditRoomRef.current) {
        return;
      }

      if (!userRef.current?.profileComplete) {
        requestProfile();
        return;
      }

      const fromId = connectFromIdRef.current;

      if (!fromId) {
        isConnectingRef.current = true;
        connectFromIdRef.current = itemId;
        setIsConnecting(true);
        setConnectFromId(itemId);
        setSelectedId(itemId);
        return;
      }

      if (fromId === itemId) {
        clearConnectionState();
        return;
      }

      completeConnection(fromId, itemId);
    };
    const startConnectionDrag = (
      item: RoomItem,
      handle: { key: ConnectionSide; x: number; y: number },
      event: FederatedPointerEvent,
    ) => {
      if (!canEditRoomRef.current) {
        return;
      }

      if (!userRef.current?.profileComplete) {
        requestProfile();
        return;
      }

      const fromId = connectFromIdRef.current;

      if (fromId && fromId !== item.id) {
        completeConnection(fromId, item.id);
        return;
      }

      const itemRect = getCardRect(item);
      const start = {
        x: itemRect.x + handle.x,
        y: itemRect.y + handle.y,
      };

      connectionDraftRef.current = {
        dragged: false,
        fromId: item.id,
        fromSide: handle.key,
        originGlobal: { x: event.global.x, y: event.global.y },
        pointer: start,
        start,
        targetId: "",
      };
      hoveredConnectionTargetRef.current = "";
      isConnectingRef.current = true;
      connectFromIdRef.current = item.id;
      setIsConnecting(true);
      setConnectFromId(item.id);
      setSelectedId(item.id);
    };
    const handleConnectionPointerMove = (event: FederatedPointerEvent) => {
      const draft = connectionDraftRef.current;
      if (!draft) {
        return;
      }

      const point = toWorldPoint(event.global);
      const moved = Math.hypot(
        event.global.x - draft.originGlobal.x,
        event.global.y - draft.originGlobal.y,
      );

      draft.pointer = point;

      if (moved > 4) {
        draft.dragged = true;
      }

      draft.targetId = findConnectionTarget(point, draft.fromId);
      if (draft.targetId) {
        const fromItem = visibleItemsRef.current.find((item) => item.id === draft.fromId);
        const targetItem = visibleItemsRef.current.find((item) => item.id === draft.targetId);
        draft.targetSide = fromItem && targetItem
          ? getDropTargetSide(getCardRect(fromItem), getCardRect(targetItem), point)
          : undefined;
      } else {
        draft.targetSide = undefined;
      }
      hoveredConnectionTargetRef.current = draft.targetId;
    };
    const finishConnectionDrag = (event?: FederatedPointerEvent) => {
      const draft = connectionDraftRef.current;
      if (!draft) {
        return;
      }

      if (event?.global) {
        const point = toWorldPoint(event.global);
        draft.pointer = point;
        draft.targetId = findConnectionTarget(point, draft.fromId);
        if (draft.targetId) {
          const fromItem = visibleItemsRef.current.find((item) => item.id === draft.fromId);
          const targetItem = visibleItemsRef.current.find((item) => item.id === draft.targetId);
          draft.targetSide = fromItem && targetItem
            ? getDropTargetSide(getCardRect(fromItem), getCardRect(targetItem), point)
            : undefined;
        } else {
          draft.targetSide = undefined;
        }
        hoveredConnectionTargetRef.current = draft.targetId;
      }

      if (draft.targetId) {
        const fromItem = visibleItemsRef.current.find((item) => item.id === draft.fromId);
        const targetItem = visibleItemsRef.current.find((item) => item.id === draft.targetId);
        const toSide = fromItem && targetItem
          ? getDropTargetSide(getCardRect(fromItem), getCardRect(targetItem), draft.pointer)
          : draft.targetSide;

        completeConnection(draft.fromId, draft.targetId, draft.fromSide, toSide);
        return;
      }

      if (draft.dragged) {
        clearConnectionState();
        return;
      }

      clearConnectionDraft();
    };
    const handleConnectionStageTap = (event: FederatedPointerEvent) => {
      if (!connectionDraftRef.current && canEditRoomRef.current) {
        const connectionId = findConnectionArrowTarget(toWorldPoint(event.global));

        if (connectionId) {
          event.stopPropagation();
          void handleReverseConnection(connectionId);
          return;
        }
      }

      if (event.target === scene.app.stage && isConnectingRef.current) {
        clearConnectionState();
      }
    };
    const handleConnectionKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape" && isConnectingRef.current) {
        clearConnectionState();
      }
    };

    if (structuralChanged) {
      scene.app.stage.on("globalpointermove", handleConnectionPointerMove);
      scene.app.stage.on("pointerup", finishConnectionDrag);
      scene.app.stage.on("pointerupoutside", finishConnectionDrag);
      scene.app.stage.on("pointertap", handleConnectionStageTap);
      window.addEventListener("keydown", handleConnectionKeyDown);
      tickerCleanupRef.current.push(() => {
        scene.app.stage.off("globalpointermove", handleConnectionPointerMove);
        scene.app.stage.off("pointerup", finishConnectionDrag);
        scene.app.stage.off("pointerupoutside", finishConnectionDrag);
        scene.app.stage.off("pointertap", handleConnectionStageTap);
        window.removeEventListener("keydown", handleConnectionKeyDown);
      });
    }

    const drawItem = (item: RoomItem) => {
      const cardSize = getCardSize(item);
      const cardWidth = cardSize.width;
      const cardHeight = cardSize.height;
      const headerHeight = 38;
      const footerHeight = 36;
      const cardPad = 16;
      const imageInfoHeight = 58;
      const imageFrameTop = headerHeight + 11;
      const imageFrameGap = 12;
      const footerY = cardHeight - footerHeight;
      const imageInfoY = footerY - imageInfoHeight;
      const imageSource = getDomain(item.imageUrl);
      const sourcePillMaxWidth = item.type === "image" && item.imageUrl
        ? Math.min(118, Math.max(72, cardWidth * 0.34))
        : 0;
      const sourcePillText = sourcePillMaxWidth > 0
        ? truncateForWidth(imageSource, sourcePillMaxWidth - 24, 6.1)
        : "";
      const sourcePillWidth = sourcePillText
        ? Math.min(sourcePillMaxWidth, Math.max(66, sourcePillText.length * 6.1 + 24))
        : 0;
      const imageTitleGap = sourcePillWidth > 0 ? 8 : 0;
      const imageTitleWidth = Math.max(108, cardWidth - cardPad * 2 - sourcePillWidth - imageTitleGap);
      const imageBodyWidth = Math.max(132, cardWidth - cardPad * 2);
      const statusMeta = getItemStatusMeta(item.status);
      const handleLayer = new Container();
      const imageFrame = {
        x: cardPad,
        y: imageFrameTop,
        width: cardWidth - cardPad * 2,
        height: Math.max(minImageFrameHeight, imageInfoY - imageFrameTop - imageFrameGap),
      };
      const root = new Container();
      root.alpha = 0;
      root.scale.set(0.92);
      let fadeInDone = false;
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
          : item.title,
        style: {
          fill: palette.title,
          fontFamily: pixiFont,
          fontSize: 13,
          fontWeight: "700",
          lineHeight: 17,
          wordWrap: true,
          wordWrapWidth: item.type === "image" ? imageTitleWidth : cardWidth - 28,
        },
      });
      const bodyText = new Text({
        resolution: textResolutionRef.current,
        text: item.type === "image"
          ? truncateForWidth(getImageDisplayBody(item), imageBodyWidth, 6.2)
          : item.body || item.imageUrl || "",
        style: {
          fill: palette.body,
          fontFamily: pixiFont,
          fontSize: 12,
          fontWeight: "500",
          lineHeight: 18,
          wordWrap: true,
          wordWrapWidth: item.type === "image" ? imageBodyWidth : cardWidth - 28,
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
      const imagePlaceholderTitle = new Text({
        resolution: textResolutionRef.current,
        text: "No image source",
        style: {
          fill: palette.title,
          fontFamily: pixiFont,
          fontSize: 13,
          fontWeight: "700",
        },
      });
      const imagePlaceholderBody = new Text({
        resolution: textResolutionRef.current,
        text: "Paste a URL or upload a reference",
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
      let isHovered = false;
      typeDot.roundRect(0, 0, 6, 6, 1.5).fill({ color: toColor(item.color) });
      typeDot.position.set(cardPad, 17);
      typeLabel.position.set(cardPad + 12, 14);
      const statusPillWidth = Math.min(86, Math.max(50, statusText.width + 18));
      statusPill.roundRect(0, 0, statusPillWidth, 18, 999)
        .fill({ alpha: theme === "light" ? 0.12 : 0.16, color: toColor(statusMeta.color) });
      statusPill.roundRect(0, 0, statusPillWidth, 18, 999)
        .stroke({ alpha: theme === "light" ? 0.24 : 0.34, color: toColor(statusMeta.color), width: 1 });
      statusPill.position.set(cardPad + 58, 11);
      statusText.anchor.set(0.5);
      statusText.position.set(cardPad + 58 + statusPillWidth / 2, 20);
      idText.position.set(cardWidth - 52, 14);
      titleText.position.set(cardPad, item.type === "image" ? imageInfoY + 11 : headerHeight + 12);
      
      if (item.type === "image") {
        bodyText.visible = true;
        titleText.style.wordWrap = false;
        titleText.style.wordWrapWidth = imageTitleWidth;
        titleText.text = truncateForWidth(getImageDisplayTitle(item), imageTitleWidth, 7.2);
        bodyText.text = truncateForWidth(getImageDisplayBody(item), imageBodyWidth, 6.2);
        bodyText.style.fontSize = 11;
        bodyText.style.fill = palette.muted;
        bodyText.style.lineHeight = 15;
        bodyText.style.wordWrap = false;
        bodyText.style.wordWrapWidth = imageBodyWidth;
        bodyText.position.set(cardPad, imageInfoY + 33);
        imagePlaceholderTitle.visible = !item.imageUrl;
        imagePlaceholderBody.visible = !item.imageUrl;
        if (item.imageUrl) {
          imagePlaceholderTitle.visible = false;
          imagePlaceholderBody.visible = false;
        } else {
          titleText.text = truncateForWidth(getImageDisplayTitle(item), imageTitleWidth, 7.2);
          bodyText.text = truncateForWidth(getImageDisplayBody(item), imageBodyWidth, 6.2);
          imagePlaceholderTitle.anchor.set(0.5);
          imagePlaceholderBody.anchor.set(0.5);
          imagePlaceholderTitle.position.set(imageFrame.x + imageFrame.width / 2, imageFrame.y + imageFrame.height / 2 - 9);
          imagePlaceholderBody.position.set(imageFrame.x + imageFrame.width / 2, imageFrame.y + imageFrame.height / 2 + 12);
        }
      } else {
        bodyText.visible = true;
        bodyText.position.set(cardPad, headerHeight + 36);
        imagePlaceholderTitle.visible = false;
        imagePlaceholderBody.visible = false;
      }
      commentText.position.set(cardPad, footerY + 11);
      authorAvatar.roundRect(0, 0, 16, 16, 8).fill({ color: toColor(item.color) });
      authorInitialText.anchor.set(0.5);
      const authorGroupWidth = Math.min(104, 22 + authorText.width);
      const authorGroupX = Math.max(cardPad, cardWidth - authorGroupWidth - cardPad);
      authorAvatar.position.set(authorGroupX, footerY + 10);
      authorInitialText.position.set(authorGroupX + 8, footerY + 18);
      authorText.position.set(authorGroupX + 22, footerY + 12);
      
      let lastTextClickTime = 0;
      const onDoubleClickText = (event: FederatedPointerEvent, field: "title" | "body", text: string) => {
        if (!canEditRoomRef.current) return;
        const now = Date.now();
        if (now - lastTextClickTime < 350) {
          event.stopPropagation();
          setInlineEdit({ id: item.id, field, text });
          setSelectedId(item.id);
        }
        lastTextClickTime = now;
      };

      if (item.type === "note") {
        titleText.eventMode = "static";
        titleText.on("pointerdown", (event) => onDoubleClickText(event, "title", item.title));

        bodyText.eventMode = "static";
        bodyText.on("pointerdown", (event) => onDoubleClickText(event, "body", item.body || item.imageUrl || ""));
      }
      
      root.addChild(
        card,
        typeDot,
        typeLabel,
        statusPill,
        statusText,
        idText,
        titleText,
        bodyText,
        imagePlaceholderTitle,
        imagePlaceholderBody,
        commentText,
        authorAvatar,
        authorInitialText,
        authorText,
        handleLayer,
      );

      const connectionHandles = ([
        { key: "top", x: cardWidth / 2, y: 0 },
        { key: "right", x: cardWidth, y: cardHeight / 2 },
        { key: "bottom", x: cardWidth / 2, y: cardHeight },
        { key: "left", x: 0, y: cardHeight / 2 },
      ] satisfies Array<{ key: ConnectionSide; x: number; y: number }>).map((handle) => {
        const dot = new Graphics();
        dot.position.set(handle.x, handle.y);
        dot.eventMode = canEditRoom ? "static" : "none";
        dot.cursor = "crosshair";
        dot.on("pointerdown", (event) => {
          event.stopPropagation();
          startConnectionDrag(item, handle, event);
        });
        dot.on("pointertap", (event) => {
          event.stopPropagation();
        });
        handleLayer.addChild(dot);
        return dot;
      });

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
        const target = remoteTargetsRef.current.get(item.id);
        if (target) {
          const lerp = 0.45;
          const nx = root.x + (target.x - root.x) * lerp;
          const ny = root.y + (target.y - root.y) * lerp;
          if (Math.abs(target.x - nx) < 0.5 && Math.abs(target.y - ny) < 0.5) {
            root.position.set(target.x, target.y);
            remoteTargetsRef.current.delete(item.id);
          } else {
            root.position.set(nx, ny);
          }
        }
        if (!fadeInDone) {
          root.alpha = Math.min(1, root.alpha + 0.12);
          root.scale.set(Math.min(1, root.scale.x + 0.04));
          if (root.alpha >= 1 && root.scale.x >= 1) {
            root.alpha = 1;
            root.scale.set(1);
            fadeInDone = true;
          }
        }
        card.clear();
        const selId = selectedIdRef.current;
        const editRoom = canEditRoomRef.current;
        const active = selId === item.id;
        const sourceForConnection = connectFromIdRef.current === item.id;
        const hotTargetForConnection = hoveredConnectionTargetRef.current === item.id || connectionDraftRef.current?.targetId === item.id;
        const targetForConnection =
          hotTargetForConnection || Boolean(isConnectingRef.current && connectFromIdRef.current && !sourceForConnection);
        const showConnectionHandles =
          editRoom && (isHovered || active || isConnectingRef.current || sourceForConnection || connectedItemIdsRef.current.has(item.id));
        const activeBorder = active || sourceForConnection;
        const cardTintAmount = item.type === "image"
          ? themeRef.current === "light" ? 0.025 : 0.035
          : themeRef.current === "light" ? 0.045 : 0.07;
        const fill = mixHex(item.color, palette.cardMix, cardTintAmount);

        // Main card body
        card.roundRect(0, 0, cardWidth, cardHeight, 10).fill({ alpha: theme === "light" ? 1 : 0.98, color: fill });
        
        // Separator lines
        card.rect(0, headerHeight - 1, cardWidth, 1).fill({ alpha: 0.95, color: toColor(palette.separator) });
        card.rect(0, footerY, cardWidth, 1).fill({ alpha: 0.95, color: toColor(palette.separator) });
        
        // Highlight logic
        if (item.styleVariant === "highlight") {
          // Tint Header
          card.roundRect(0, 0, cardWidth, headerHeight - 1, 10).fill({ alpha: theme === "light" ? 0.12 : 0.18, color: toColor(item.color) });
          card.rect(0, 10, cardWidth, headerHeight - 11).fill({ alpha: theme === "light" ? 0.12 : 0.18, color: toColor(item.color) }); // square bottom corners of header tint
          
          // Tint Footer
          card.roundRect(0, footerY + 1, cardWidth, footerHeight - 1, 10).fill({ alpha: theme === "light" ? 0.12 : 0.18, color: toColor(item.color) });
          card.rect(0, footerY + 1, cardWidth, footerHeight - 8).fill({ alpha: theme === "light" ? 0.12 : 0.18, color: toColor(item.color) }); // square top corners of footer tint
        } else {
          // Standard Footer
          card.roundRect(0, footerY + 1, cardWidth, footerHeight - 1, 10).fill({ alpha: theme === "light" ? 0.88 : 0.52, color: toColor(palette.footer) });
          card.rect(0, footerY + 1, cardWidth, footerHeight - 8).fill({ alpha: theme === "light" ? 0.88 : 0.52, color: toColor(palette.footer) });
        }

        if (item.type === "note") {
          titleText.cursor = editRoom ? "text" : "pointer";
          bodyText.cursor = editRoom ? "text" : "pointer";
        }

        if (item.type === "image") {
          card.rect(0, imageInfoY, cardWidth, 1).fill({ alpha: 0.7, color: toColor(palette.separator) });
          card.rect(0, imageInfoY + 1, cardWidth, imageInfoHeight - 1)
            .fill({ alpha: theme === "light" ? 0.72 : 0.36, color: toColor(palette.footer) });
        }

        if (item.type === "image" && item.imageUrl) {
          card.roundRect(imageFrame.x, imageFrame.y, imageFrame.width, imageFrame.height, 6).fill({ color: toColor(palette.frame) });
          card.roundRect(imageFrame.x, imageFrame.y, imageFrame.width, imageFrame.height, 6).stroke({ alpha: 0.75, color: toColor(palette.frameBorder), width: 1 });
        }

        if (item.type === "image" && !item.imageUrl) {
          card.roundRect(imageFrame.x, imageFrame.y, imageFrame.width, imageFrame.height, 6).fill({ alpha: theme === "light" ? 0.95 : 0.72, color: toColor(palette.frame) });
          card.roundRect(imageFrame.x, imageFrame.y, imageFrame.width, imageFrame.height, 6).stroke({ alpha: 0.8, color: toColor(palette.frameBorder), width: 1 });
          const placeholderIconX = imageFrame.x + imageFrame.width / 2;
          const placeholderIconY = imageFrame.y + imageFrame.height / 2 - 40;
          card.roundRect(placeholderIconX - 17, placeholderIconY - 12, 34, 24, 5)
            .stroke({ alpha: 0.5, color: toColor(palette.frameBorder), width: 1 });
          card.circle(placeholderIconX - 7, placeholderIconY - 4, 2.2)
            .fill({ alpha: 0.55, color: toColor(palette.muted) });
          card.moveTo(placeholderIconX - 13, placeholderIconY + 7);
          card.lineTo(placeholderIconX - 3, placeholderIconY - 1);
          card.lineTo(placeholderIconX + 3, placeholderIconY + 4);
          card.lineTo(placeholderIconX + 12, placeholderIconY - 6);
          card.stroke({ alpha: 0.55, color: toColor(palette.muted), width: 1.4 });
        }

        card.roundRect(0, 0, cardWidth, cardHeight, 8).stroke({
          alpha: activeBorder || hotTargetForConnection ? 1 : 0.95,
          color: activeBorder || hotTargetForConnection ? toColor(palette.accent) : toColor(palette.border),
          width: activeBorder || hotTargetForConnection ? 2 : 1,
        });

        for (const handle of connectionHandles) {
          handle.clear();

          if (!showConnectionHandles) {
            handle.circle(0, 0, connectionHandleHitRadius).fill({ alpha: 0.001, color: 0xffffff });
            continue;
          }

          const handleColor = sourceForConnection
            ? palette.accent
            : targetForConnection
              ? palette.accent
              : item.color;
          const alpha = sourceForConnection || targetForConnection || active ? 1 : 0.78;
          const radius =
            sourceForConnection || hotTargetForConnection ? connectionHandleRadius + 1.2 : connectionHandleRadius;

          handle.circle(0, 0, connectionHandleHitRadius).fill({ alpha: 0.001, color: toColor(handleColor) });
          handle.circle(0, 0, radius + 4).fill({ alpha: theme === "light" ? 0.82 : 0.74, color: toColor(palette.cardMix) });
          handle.circle(0, 0, radius).fill({ alpha, color: toColor(handleColor) });
          handle.circle(0, 0, radius).stroke({ alpha: 0.9, color: toColor(palette.title), width: 1.5 });

          if (sourceForConnection || hotTargetForConnection) {
            handle.circle(0, 0, radius + 5.5).stroke({ alpha: 0.55, color: toColor(handleColor), width: 1.5 });
          }
        }
      };

      root.on("pointerover", () => {
        isHovered = true;
      });

      root.on("pointerout", () => {
        isHovered = false;
      });

      root.on("pointertap", () => {
        if (!dragStateRef.current.didMove) {
          if (canEditRoomRef.current && isConnectingRef.current) {
            startOrCompleteConnection(item.id);
          } else {
            setSelectedId(item.id);
          }
        }
      });

      root.on("pointerdown", (event) => {
        if (!canEditRoomRef.current) {
          return;
        }

        isDraggingRef.current = true;
        dragStateRef.current.draggingItem = root;
        dragStateRef.current.activeDragId = item.id;
        dragStateRef.current.didMove = false;
        dragStateRef.current.lastPointer = { x: event.global.x, y: event.global.y };
        draggingPositionsRef.current.set(item.id, { x: root.x, y: root.y });
      });

      const endDrag = () => {
        const ds = dragStateRef.current;
        if (ds.draggingItem && ds.activeDragId) {
          if (ds.didMove) {
            persistMove(ds.activeDragId, ds.draggingItem.x, ds.draggingItem.y);
          } else {
            draggingPositionsRef.current.delete(ds.activeDragId);
            lastDragBroadcastRef.current.delete(ds.activeDragId);
          }

          ds.draggingItem = null;
          ds.activeDragId = "";
          isDraggingRef.current = false;
          setRenderGeneration((g) => g + 1);
        }
      };

      root.on("pointerup", endDrag);
      root.on("pointerupoutside", endDrag);
      root.on("globalpointermove", (event) => {
        const ds = dragStateRef.current;
        if (ds.draggingItem !== root) {
          return;
        }

        const dx = (event.global.x - ds.lastPointer.x) / scene.world.scale.x;
        const dy = (event.global.y - ds.lastPointer.y) / scene.world.scale.y;

        if (Math.abs(dx) + Math.abs(dy) > 1) {
          ds.didMove = true;
        }

        root.x += dx;
        root.y += dy;
        draggingPositionsRef.current.set(ds.activeDragId, { x: root.x, y: root.y });
        if (ds.didMove && ds.activeDragId) {
          const now = Date.now();
          const lastSent = lastDragBroadcastRef.current.get(ds.activeDragId) ?? 0;

          if (now - lastSent >= dragBroadcastIntervalMs) {
            lastDragBroadcastRef.current.set(ds.activeDragId, now);
            broadcastMove(ds.activeDragId, root.x, root.y, now);
          }
        }
        ds.lastPointer = { x: event.global.x, y: event.global.y };
      });

      scene.app.ticker.add(repaint);
      itemTickersRef.current.set(item.id, [repaint]);
      scene.itemLayer.addChild(root);
      scene.itemMap.set(item.id, root);
    };

    if (visibleItems.length > 0) {
      for (const item of visibleItems) {
        const existing = scene.itemMap.get(item.id);
        if (existing) {
          const propsKey = `${item.title}|${item.body}|${item.status}|${item.color}|${item.imageUrl ?? ""}|${item.width}|${item.height}|${item.comments.length}|${item.author ?? ""}`;
          const prevProps = itemPropsRef.current.get(item.id);
          if (prevProps !== propsKey) {
            const fns = itemTickersRef.current.get(item.id);
            if (fns) { fns.forEach((fn) => scene.app.ticker.remove(fn)); itemTickersRef.current.delete(item.id); }
            scene.itemLayer.removeChild(existing);
            existing.destroy({ children: true });
            scene.itemMap.delete(item.id);
            remoteTargetsRef.current.delete(item.id);
            drawItem(item);
            itemPropsRef.current.set(item.id, propsKey);
          } else if (!draggingPositionsRef.current.has(item.id)) {
            const dx = Math.abs(existing.x - item.x);
            const dy = Math.abs(existing.y - item.y);
            if (dx > 0.5 || dy > 0.5) {
              remoteTargetsRef.current.set(item.id, { x: item.x, y: item.y });
            } else {
              remoteTargetsRef.current.delete(item.id);
            }
          }
        } else {
          drawItem(item);
          itemPropsRef.current.set(item.id, `${item.title}|${item.body}|${item.status}|${item.color}|${item.imageUrl ?? ""}|${item.width}|${item.height}|${item.comments.length}|${item.author ?? ""}`);
        }
      }
    }

    let connCacheKey = "";
    const drawConnections = () => {
      const conns = visibleConnectionsRef.current;
      const items = visibleItemsRef.current;
      const selId = selectedIdRef.current;
      const draft = connectionDraftRef.current;

      // Always draw the draft connection smoothly at 60 FPS
      scene.draftConnectionGraphics.clear();
      if (draft) {
        const fromItem = items.find((item) => item.id === draft.fromId);
        if (fromItem) {
          const fromRect = getCardRect(fromItem);
          const targetItem = draft.targetId ? items.find((item) => item.id === draft.targetId) : undefined;
          const targetRect = targetItem ? getCardRect(targetItem) : undefined;
          const targetSide = targetRect ? draft.targetSide ?? getDropTargetSide(fromRect, targetRect, draft.pointer) : undefined;
          const route = targetRect
            ? getCardPipeRoute(fromRect, targetRect, draft.fromSide, targetSide, draft.start)
            : getPointPipeRoute(fromRect, draft.pointer, draft.fromSide, draft.start);
          const endPt = route[route.length - 1];
          const color = toColor(palette.accent);

          drawRoundedPipe(scene.draftConnectionGraphics, route, {
            alpha: targetRect ? 0.9 : 0.66,
            color,
            haloAlpha: targetRect ? 0.42 : 0.28,
            haloColor: toColor(palette.cardMix),
            showArrow: Boolean(targetRect),
            width: targetRect ? 2.7 : 2.2,
          });

          scene.draftConnectionGraphics.circle(endPt.x, endPt.y, targetRect ? 5.8 : 4.8).fill({
            alpha: targetRect ? 0.96 : 0.76,
            color,
          });
        }
      }

      // Cache the static connections to prevent expensive recalculations
      let cacheKey = `${selId}|${conns.length}`;
      for (const c of conns) {
        const fromCont = scene.itemMap.get(c.from);
        const toCont = scene.itemMap.get(c.to);
        cacheKey += `|${c.from}:${Math.round(fromCont?.x ?? 0)},${Math.round(fromCont?.y ?? 0)}:${Math.round(toCont?.x ?? 0)},${Math.round(toCont?.y ?? 0)}`;
      }

      if (cacheKey === connCacheKey) return;
      connCacheKey = cacheKey;

      scene.connectionGraphics.clear();
      const drawnPairCounts = new Map<string, number>();
      
      for (const c of conns) {
        const fromItem = items.find(item => item.id === c.from);
        const toItem = items.find(item => item.id === c.to);
        if (!fromItem || !toItem) continue;

        const pairKey = getConnectionPairKey(c.from, c.to);
        const pairIndex = drawnPairCounts.get(pairKey) ?? 0;
        const pairTotal = connectionPairCountsRef.current.get(pairKey) ?? 1;
        const fanOut = getConnectionFanOut(pairIndex, pairTotal);
        drawnPairCounts.set(pairKey, pairIndex + 1);

        const route = getCardPipeRoute(getCardRect(fromItem), getCardRect(toItem), c.fromSide, c.toSide, undefined, undefined, fanOut);
        const active = selId === c.from || selId === c.to;
        const colorStr = active ? c.color || fromItem.color || palette.accent : palette.connector;

        drawRoundedPipe(scene.connectionGraphics, route, {
          alpha: active ? 0.94 : 0.62,
          color: toColor(colorStr),
          haloAlpha: theme === "light" ? 0.58 : 0.36,
          haloColor: toColor(palette.cardMix),
          width: active ? 2.6 : 2,
        });

        if (canEditRoomRef.current) {
          drawPipeDirectionMarker(scene.connectionGraphics, route, {
            alpha: active ? 0.9 : 0.72,
            color: toColor(colorStr),
            haloAlpha: theme === "light" ? 0.78 : 0.62,
            haloColor: toColor(palette.cardMix),
          });
        }
      }
    };

    if (structuralChanged) {
      scene.app.ticker.add(drawConnections);
      tickerCleanupRef.current.push(() => scene.app.ticker.remove(drawConnections));
    }

    return () => {
      disposed = true;
    };
  }, [canEditRoom, visibleItems, visibleConnections, publishBoardEvent, refreshRoomSnapshot, renderGeneration, sceneReady, theme]);

  useEffect(() => {
    const scene = sceneRef.current;

    if (!scene) {
      return;
    }

    const hostRect = scene.host.getBoundingClientRect();
    const existing = new Set<string>();

    for (const snapshot of presence) {
      if (snapshot.x === 0 && snapshot.y === 0) {
        continue;
      }

      existing.add(snapshot.id);
      let cursor = scene.cursorLayer.children.find(
        (c): c is Container => c instanceof Container && c.label === snapshot.id,
      ) as Container | undefined;

      if (!cursor) {
        cursor = new Container();
        cursor.label = snapshot.id;
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
        shape.poly([0, 0, 16, 7, 7, 13]).fill(toColor(snapshot.color));
        pill.roundRect(0, 0, label.width + 14, 20, 5).fill({ color: toColor(snapshot.color), alpha: 0.98 });
        pill.position.set(12, 15);
        label.position.set(19, 17);
        cursor.eventMode = "none";
        cursor.addChild(shape, pill, label);
        scene.cursorLayer.addChild(cursor);
      }

      cursor.position.set(snapshot.x - hostRect.left, snapshot.y - hostRect.top);
    }

    for (let i = scene.cursorLayer.children.length - 1; i >= 0; i--) {
      const child = scene.cursorLayer.children[i];
      if (!existing.has((child as Container).label)) {
        scene.cursorLayer.removeChildAt(i);
        child.destroy({ children: true });
      }
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

  const handleCreateConnection = async (
    fromId: string,
    toId: string,
    fromSide?: ConnectionSide,
    toSide?: ConnectionSide,
  ) => {
    if (!canEditRoom) {
      return;
    }

    const currentUser = userRef.current;

    if (!currentUser?.profileComplete) {
      requestProfile();
      return;
    }

    const response = await fetch(roomApi, {
      body: JSON.stringify({
        action: "connection",
        author: currentUser.name,
        from: fromId,
        fromSide,
        to: toId,
        toSide,
        color: currentUser.color || "#48a7ff",
      }),
      headers: { "Content-Type": "application/json", ...roomCredentialsHeaders },
      method: "POST",
    });
    const data = (await response.json()) as { connection?: RoomConnection };

    if (data.connection) {
      setConnections((current) => upsertUniqueConnection(current, data.connection!));
      publishBoardEvent({ type: "connection:created", connection: data.connection });
      void refreshRoomSnapshot();
    }
  };

  const handleReverseConnection = async (connId: string) => {
    if (!canEditRoom) {
      return;
    }

    const response = await fetch(roomApi, {
      body: JSON.stringify({
        action: "reverse-connection",
        author: userRef.current?.name,
        connectionId: connId,
      }),
      headers: { "Content-Type": "application/json", ...roomCredentialsHeaders },
      method: "POST",
    });

    if (!response.ok) {
      return;
    }

    const data = (await response.json()) as { connection?: RoomConnection };

    if (data.connection) {
      setConnections((current) => upsertUniqueConnection(current, data.connection!));
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

  const requestToggleRoomAccess = () => {
    if (!canManageRoom || isTogglingAccess) {
      return;
    }

    if (roomAccess === "link") {
      setShowLockModal(true);
      return;
    }

    void toggleRoomAccess();
  };

  const toggleRoomAccess = async () => {
    if (!canManageRoom) {
      return;
    }

    setIsTogglingAccess(true);

    try {
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
    } finally {
      setIsTogglingAccess(false);
      setShowLockModal(false);
    }
  };

  const toggleRoomVisibility = async () => {
    if (!canManageRoom) {
      return;
    }

    const nextVisibility: RoomVisibility = roomVisibility === "private" ? "public" : "private";
    const response = await fetch(roomApi, {
      body: JSON.stringify({ action: "visibility", visibility: nextVisibility }),
      headers: { "Content-Type": "application/json", ...roomCredentialsHeaders },
      method: "PATCH",
    });

    if (response.ok) {
      setRoomVisibilityState(nextVisibility);
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

  const loadRoomRecap = useCallback(async () => {
    setIsRecapLoading(true);
    setCopiedRecap(false);

    try {
      const headers: Record<string, string> = {
        ...(inviteToken ? { "X-Room-Invite-Token": inviteToken } : {}),
        ...(ownerToken ? { "X-Room-Owner-Token": ownerToken } : {}),
      };
      const response = await fetch(`${roomApi}/recap`, {
        headers: Object.keys(headers).length > 0 ? headers : undefined,
      });

      if (!response.ok) {
        return null;
      }

      const data = (await response.json()) as { recap?: RoomRecap };

      if (!data.recap) {
        return null;
      }

      setRoomRecap(data.recap);
      return data.recap;
    } finally {
      setIsRecapLoading(false);
    }
  }, [inviteToken, ownerToken, roomApi]);

  const copyRoomRecap = async () => {
    const recap = roomRecap ?? (await loadRoomRecap());

    if (!recap) {
      return;
    }

    await navigator.clipboard.writeText(recap.markdown);
    setCopiedRecap(true);
    window.setTimeout(() => setCopiedRecap(false), 1400);
  };

  const exportRoomRecap = async () => {
    setIsRecapExporting(true);
    setExportedRecap(false);

    try {
      const headers: Record<string, string> = {
        ...(inviteToken ? { "X-Room-Invite-Token": inviteToken } : {}),
        ...(ownerToken ? { "X-Room-Owner-Token": ownerToken } : {}),
      };
      const response = await fetch(`${roomApi}/recap?format=markdown`, {
        headers: Object.keys(headers).length > 0 ? headers : undefined,
      });

      if (!response.ok) {
        return;
      }

      const markdown = await response.text();
      const blobUrl = URL.createObjectURL(new Blob([markdown], { type: "text/markdown;charset=utf-8" }));
      const anchor = document.createElement("a");
      anchor.href = blobUrl;
      anchor.download = getRecapFileName(displayRoomName);
      document.body.append(anchor);
      anchor.click();
      anchor.remove();
      window.setTimeout(() => URL.revokeObjectURL(blobUrl), 1000);
      setExportedRecap(true);
      window.setTimeout(() => setExportedRecap(false), 1400);
    } finally {
      setIsRecapExporting(false);
    }
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
  const visibleRecapSections = roomRecap?.sections.filter((section) => section.count > 0) ?? [];
  const peopleCount = presence.length + 1;
  const isBoardReady = hasRoomSnapshot && sceneReady;
  const canLeaveLoader = isBoardReady && hasMinimumLoaderElapsed;
  const hasInvitedTokens = Object.values(inviteTokens).some((token) => Boolean(token));
  const lifecycleCopy = getLifecycleCopy(
    permissions,
    roomAccess,
    user?.name ?? "",
    hasInvitedTokens,
  );
  const showLockedBanner = canLeaveLoader && roomAccess === "locked" && canEditRoom;
  const syncModeLabel = !realtimeEndpoint
    ? "local"
    : useRealtimeFallback
      ? "local fallback"
      : realtimeStatus === "connected"
        ? "elixir"
        : realtimeStatus;
  const loaderMessage = roomClosed
    ? "Room closed"
    : roomLoadError
      ? "Could not open room"
      : hasRoomSnapshot
        ? "Preparing canvas"
        : "Syncing board";
  const loaderDetail = roomClosed
    ? "The creator closed this room. Its board is no longer available."
    : roomLoadError
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
      {inlineEdit && (() => {
        const item = items.find((i) => i.id === inlineEdit.id);
        if (!item) return null;
        
        const cardPad = 16 * gridTransform.zoom;
        const isTitle = inlineEdit.field === "title";
        
        const fontSize = (isTitle ? 13 : 12) * gridTransform.zoom;
        const lineHeight = (isTitle ? 17 : 18) * gridTransform.zoom;
        const fontWeight = isTitle ? "700" : "500";
        const color = isTitle ? "var(--text-1)" : "var(--text-2)";
        
        const topOffset = isTitle ? 50 * gridTransform.zoom : 76 * gridTransform.zoom;
        
        const screenX = gridTransform.panX + (item.x * gridTransform.zoom);
        const screenY = gridTransform.panY + (item.y * gridTransform.zoom);
        
        const saveEdit = () => {
          if (inlineEdit.text !== (isTitle ? item.title : item.body)) {
            const newItem = { ...item };
            if (isTitle) newItem.title = inlineEdit.text;
            else newItem.body = inlineEdit.text;
            newItem.updatedAt = Date.now();
            setItems((curr) => curr.map((i) => i.id === item.id ? newItem : i));
            void publishBoardEvent({
              type: "item:updated",
              item: newItem,
            });
          }
          setInlineEdit(null);
        };
        
        return (
          <textarea
            autoFocus
            className="rb-inline-editor"
            onBlur={saveEdit}
            onChange={(e) => setInlineEdit({ ...inlineEdit, text: e.target.value })}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey && isTitle) {
                e.preventDefault();
                saveEdit();
              }
              if (e.key === "Escape") {
                setInlineEdit(null);
              }
            }}
            style={{
              position: "absolute",
              left: screenX + cardPad - (3 * gridTransform.zoom),
              top: screenY + topOffset - (2 * gridTransform.zoom),
              width: (getCardSize(item).width * gridTransform.zoom) - cardPad * 2 + (6 * gridTransform.zoom),
              minHeight: lineHeight * 2 + (12 * gridTransform.zoom),
              fontFamily: pixiFont,
              fontSize: `${fontSize}px`,
              fontWeight,
              lineHeight: `${lineHeight}px`,
              color,
              background: "var(--bg-elevated)",
              border: "1px solid var(--accent)",
              borderRadius: "4px",
              padding: "2px",
              resize: "none",
              outline: "none",
              zIndex: 9999,
              boxShadow: "0 2px 8px rgba(0,0,0,0.2)",
              pointerEvents: "auto",
            }}
            value={inlineEdit.text}
          />
        );
      })()}
      {(!canLeaveLoader || Boolean(roomLoadError) || roomClosed) && (
        <RoomboardLoader
          actionHref={roomLoadError || roomClosed ? "/" : undefined}
          actionLabel={roomClosed ? "Back to dashboard" : undefined}
          detail={loaderDetail}
          message={loaderMessage}
          state={roomLoadError || roomClosed ? "error" : "loading"}
        />
      )}

      <header className="rb-header">
        <div className="rb-header__left">
          <div className="rb-logo-container" style={{ position: "relative" }}>
            <button
              aria-label="Main menu"
              className="rb-logo"
              onClick={() => setShowMainMenu(!showMainMenu)}
              style={{ background: "transparent", border: "none", padding: 0, margin: 0, cursor: "pointer", display: "flex", alignItems: "center" }}
              type="button"
            >
              <span className="rb-logo__mark">
                <LayoutGrid size={12} aria-hidden="true" />
              </span>
              <h1 className="header-title rb-logo__word">Roomboard</h1>
              <ChevronDown size={14} style={{ marginLeft: 4, opacity: 0.5 }} aria-hidden="true" />
            </button>
            {showMainMenu && (
              <>
                <div onClick={() => setShowMainMenu(false)} style={{ inset: 0, position: "fixed", zIndex: 9998 }} />
                <div
                  className="rb-dropdown"
                  style={{
                    background: "var(--bg-elevated)",
                    border: "1px solid var(--border)",
                    borderRadius: "8px",
                    boxShadow: "0 4px 12px rgba(0,0,0,0.15)",
                    left: 0,
                    marginTop: "8px",
                    minWidth: "200px",
                    padding: "4px",
                    position: "absolute",
                    top: "100%",
                    zIndex: 9999,
                  }}
                >
                  <button
                    className="rb-dropdown-item"
                    onClick={() => {
                      setShowMainMenu(false);
                      router.push("/");
                    }}
                    style={{
                      background: "none",
                      border: "none",
                      borderRadius: "4px",
                      color: "var(--text-1)",
                      cursor: "pointer",
                      display: "flex",
                      fontSize: "14px",
                      padding: "8px 12px",
                      textAlign: "left",
                      width: "100%",
                    }}
                    type="button"
                  >
                    Back to Dashboard
                  </button>
                  <button
                    className="rb-dropdown-item"
                    onClick={async () => {
                      setShowMainMenu(false);
                      const res = await fetch("/api/rooms", {
                        body: JSON.stringify({ name: "Untitled Room", visibility: "public" }),
                        headers: { "Content-Type": "application/json" },
                        method: "POST",
                      });
                      const data = (await res.json()) as { ownerToken?: string; room?: { id: string } };
                      if (data.room && data.ownerToken) {
                        const tokens = JSON.parse(localStorage.getItem("roomboard-owner-tokens") || "{}") as Record<string, string>;
                        tokens[data.room.id] = data.ownerToken;
                        localStorage.setItem("roomboard-owner-tokens", JSON.stringify(tokens));
                        router.push(`/rooms/${data.room.id}`);
                      }
                    }}
                    style={{
                      background: "none",
                      border: "none",
                      borderRadius: "4px",
                      color: "var(--text-1)",
                      cursor: "pointer",
                      display: "flex",
                      fontSize: "14px",
                      padding: "8px 12px",
                      textAlign: "left",
                      width: "100%",
                    }}
                    type="button"
                  >
                    Create New Room
                  </button>
                </div>
              </>
            )}
          </div>
          <div className="rb-breadcrumb" aria-label="Current room">
            <span className="rb-breadcrumb__sep">/</span>
            <span className="rb-breadcrumb__name">{displayRoomName}</span>
          </div>
          <button
            className={`rb-status ${roomAccess === "locked" ? "locked" : ""} ${canEditRoom ? "" : "readonly"}`}
            onClick={() => void copyRoomLink("current")}
            style={{ cursor: "pointer", outline: "none" }}
            title="Manage sharing and access"
            type="button"
          >
            <span className="rb-status__dot" />
            {getRoleLabel(permissions)} · {roomAccess === "locked" ? "invited" : "link"}{roomVisibility === "private" ? " · private" : ""}
          </button>
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
              <button className="rb-btn" disabled={isTogglingAccess} onClick={() => requestToggleRoomAccess()} type="button">
                {roomAccess === "locked" ? (
                  <UnlockKeyhole size={14} aria-hidden="true" />
                ) : (
                  <LockKeyhole size={14} aria-hidden="true" />
                )}
                <span>{roomAccess === "locked" ? "Unlock" : "Lock"}</span>
              </button>
              <button className="rb-btn" onClick={() => void toggleRoomVisibility()} type="button">
                {roomVisibility === "private" ? (
                  <EyeOff size={14} aria-hidden="true" />
                ) : (
                  <Eye size={14} aria-hidden="true" />
                )}
                <span>{roomVisibility === "private" ? "Make public" : "Make private"}</span>
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
              ? `Select a destination dot for "${items.find((item) => item.id === connectFromId)?.title || "card"}"`
              : "Click a card edge dot to start a connection"}
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
      {showLockedBanner && (
        <div className="rb-banner rb-banner--locked" role="status">
          <LockKeyhole size={13} aria-hidden="true" />
          <span>{lifecycleCopy.accessBanner}</span>
        </div>
      )}
      {canLeaveLoader && items.length > 0 && visibleItems.length === 0 && (
        <div className="rb-filter-empty">
          No {reviewFilterOptions.find((option) => option.filter === reviewFilter)?.label.toLowerCase()} cards
        </div>
      )}
      {canLeaveLoader && items.length === 0 && (
        <div className="rb-empty-room" role="status">
          <div className="rb-empty-room__head">
            <span className="rb-empty-room__eyebrow">{lifecycleCopy.accessBadge}</span>
            <h2 className="rb-empty-room__title">{lifecycleCopy.emptyStateTitle}</h2>
            <p className="rb-empty-room__body">{lifecycleCopy.emptyStateBody}</p>
          </div>
          <div className="rb-empty-room__actions">
            {canEditRoom && (
              <>
                <button
                  className="rb-btn primary"
                  onClick={() => void createItem("note")}
                  type="button"
                >
                  <StickyNote size={14} aria-hidden="true" />
                  <span>Add note</span>
                </button>
                <button
                  className="rb-btn"
                  onClick={() => fileInputRef.current?.click()}
                  type="button"
                >
                  <Upload size={14} aria-hidden="true" />
                  <span>Upload image</span>
                </button>
              </>
            )}
            {!canEditRoom && (
              <button
                className="rb-btn"
                onClick={() => router.push("/")}
                type="button"
              >
                <span>{lifecycleCopy.emptyStateAction}</span>
              </button>
            )}
          </div>
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

      <aside className={`rb-inspector ${selected ? "" : "empty board"}`} aria-label="Selected item details">
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
              <span className="rb-field__label">Card Style</span>
              <div className="rb-status-segmented" role="group" aria-label="Card style">
                <button
                  aria-pressed={selected.styleVariant !== "highlight"}
                  className={selected.styleVariant !== "highlight" ? "selected" : ""}
                  disabled={!canEditRoom}
                  onClick={async () => {
                    const response = await fetch(roomApi, {
                      body: JSON.stringify({ author: user?.name, id: selected.id, styleVariant: "minimal" }),
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
                  type="button"
                >
                  Minimal
                </button>
                <button
                  aria-pressed={selected.styleVariant === "highlight"}
                  className={selected.styleVariant === "highlight" ? "selected" : ""}
                  disabled={!canEditRoom}
                  onClick={async () => {
                    const response = await fetch(roomApi, {
                      body: JSON.stringify({ author: user?.name, id: selected.id, styleVariant: "highlight" }),
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
                  type="button"
                >
                  Highlight
                </button>
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
                      <span className="rb-image-meta__copy">
                        <span className="rb-image-meta__domain">{getDomain(selected.imageUrl)}</span>
                        <span className="rb-image-meta__detail">
                          {selected.comments.length > 0
                            ? `${selected.comments.length} review note${selected.comments.length === 1 ? "" : "s"}`
                            : "Source saved"}
                        </span>
                      </span>
                      <a href={selected.imageUrl} rel="noreferrer" target="_blank">
                        <Link2 size={11} aria-hidden="true" />
                        Open source
                      </a>
                    </div>
                    <div className="rb-image-preview">
                      <img alt={selected.title} src={selected.imageUrl} />
                    </div>
                  </>
                ) : (
                  <div className="rb-image-empty">
                    <FileImage size={16} aria-hidden="true" />
                    <span>No image source yet</span>
                    <small>Paste a URL above or upload a reference from the toolbar.</small>
                  </div>
                )}
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
                      <div className="rb-conn-actions">
                        <button
                          aria-label="Reverse connection"
                          disabled={!canEditRoom}
                          onClick={() => void handleReverseConnection(connection.id)}
                          type="button"
                        >
                          <RefreshCw size={12} aria-hidden="true" />
                        </button>
                        <button
                          aria-label="Delete connection"
                          disabled={!canEditRoom}
                          onClick={() => void handleDeleteConnection(connection.id)}
                          type="button"
                        >
                          <X size={12} aria-hidden="true" />
                        </button>
                      </div>
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
            <div className="rb-inspector__section rb-recap-section">
              <div className="rb-inspector__section-title">
                Recap <span className="count">{roomRecap ? `${roomRecap.decidedCount}/${roomRecap.totalItems}` : "new"}</span>
              </div>
              {roomRecap ? (
                <div className="rb-recap">
                  <div className="rb-recap-summary" aria-label="Decision recap">
                    <div>
                      <strong>{roomRecap.decidedCount}/{roomRecap.totalItems}</strong>
                      <span>decided</span>
                    </div>
                    <div>
                      <strong>{roomRecap.unresolvedCount}</strong>
                      <span>unresolved</span>
                    </div>
                    <div>
                      <strong>{roomRecap.commentCount}</strong>
                      <span>comments</span>
                    </div>
                  </div>
                  {visibleRecapSections.length > 0 ? (
                    <div className="rb-recap-groups">
                      {visibleRecapSections.map((section) => (
                        <div className={`rb-recap-group status-${section.status}`} key={section.status}>
                          <div className="rb-recap-group__head">
                            <span>{section.label}</span>
                            <strong>{section.count}</strong>
                          </div>
                          {section.items.slice(0, 2).map((item) => (
                            <div className="rb-recap-item" key={item.id}>
                              <span>{item.title}</span>
                              <small>{item.type}{item.commentCount > 0 ? ` / ${item.commentCount} comments` : ""}</small>
                            </div>
                          ))}
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="rb-empty-copy">No cards yet.</p>
                  )}
                  <div className="rb-recap-actions">
                    <button className="rb-btn sm" disabled={isRecapLoading} onClick={() => void loadRoomRecap()} type="button">
                      <RefreshCw size={12} aria-hidden="true" />
                      {isRecapLoading ? "Refreshing" : "Refresh"}
                    </button>
                    <button className="rb-btn primary sm" onClick={() => void copyRoomRecap()} type="button">
                      <Copy size={12} aria-hidden="true" />
                      {copiedRecap ? "Copied" : "Copy recap"}
                    </button>
                    <button className="rb-btn sm" disabled={isRecapExporting} onClick={() => void exportRoomRecap()} type="button">
                      <Download size={12} aria-hidden="true" />
                      {exportedRecap ? "Exported" : "Export .md"}
                    </button>
                  </div>
                </div>
              ) : (
                <div className="rb-recap-empty">
                  <FileText size={18} aria-hidden="true" />
                  <button className="rb-btn primary sm" disabled={isRecapLoading} onClick={() => void loadRoomRecap()} type="button">
                    {isRecapLoading ? "Generating" : "Generate recap"}
                  </button>
                </div>
              )}
            </div>
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

      {showLockModal && (
        <div className="rb-modal-scrim" onClick={() => !isTogglingAccess && setShowLockModal(false)}>
          <div className="rb-modal" onClick={(event) => event.stopPropagation()}>
            <div className="rb-modal__head">
              <div className="rb-modal__eyebrow">Room access</div>
              <div className="rb-modal__title">Lock this room?</div>
              <div className="rb-modal__sub">
                The room becomes invite-only. Anyone with the existing link stays in but new visitors will need an editor or viewer invite to join.
              </div>
            </div>
            <div className="rb-modal__foot">
              <button className="rb-btn ghost" disabled={isTogglingAccess} onClick={() => setShowLockModal(false)} type="button">
                Keep open
              </button>
              <button className="rb-btn primary" disabled={isTogglingAccess} onClick={() => void toggleRoomAccess()} type="button">
                <LockKeyhole size={13} aria-hidden="true" />
                {isTogglingAccess ? "Locking" : "Lock room"}
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
