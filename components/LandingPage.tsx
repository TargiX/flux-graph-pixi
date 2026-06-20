"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { SaasDemoPanel } from "@/components/SaasDemoPanel";
import type { RoomItemStatus, RoomSummary } from "@/lib/canvasRoom";

type LandingPageProps = {
  initialRooms: RoomSummary[];
};

type Theme = "dark" | "light";
type RoomTab = "all" | "live" | "mine";
type PreviewColor = "amber" | "blue" | "green" | "rose" | "violet" | "slate";
type PreviewCardId = "a" | "b" | "c" | "d" | "e";
type MiniPreviewItem = {
  color: PreviewColor;
  imageUrl?: string;
  key: string;
  left: number;
  status: RoomItemStatus;
  top: number;
  type: "image" | "note";
  width: number;
  height: number;
};
type PreviewCursorTarget = { x: number; y: number };
type PreviewActivityFrame = {
  active: PreviewCardId;
  cursorTargets: Record<string, PreviewCursorTarget>;
  label: string;
  offsets: Partial<Record<PreviewCardId, PreviewCursorTarget>>;
  userId: string;
  titles: Partial<Record<PreviewCardId, string>>;
};

const previewActivityFrames: PreviewActivityFrame[] = [
  {
    active: "a",
    cursorTargets: { m: { x: 21, y: 18 }, j: { x: 75, y: 23 }, t: { x: 72, y: 70 } },
    label: "renaming",
    offsets: { a: { x: 0.4, y: -0.4 }, b: { x: 0, y: 0.2 }, d: { x: -0.2, y: 0.1 } },
    userId: "m",
    titles: { a: "Option A" },
  },
  {
    active: "b",
    cursorTargets: { m: { x: 20, y: 19 }, j: { x: 66, y: 22 }, t: { x: 72, y: 70 } },
    label: "dragging",
    offsets: { b: { x: -1.1, y: 0.8 }, c: { x: 0.2, y: 0.2 } },
    userId: "j",
    titles: { b: "@Sarah" },
  },
  {
    active: "c",
    cursorTargets: { m: { x: 21, y: 71 }, j: { x: 75, y: 23 }, t: { x: 70, y: 70 } },
    label: "typing",
    offsets: { c: { x: 0.9, y: -0.8 }, b: { x: -0.4, y: 0.5 } },
    userId: "t",
    titles: { c: "Moodboard" },
  },
  {
    active: "d",
    cursorTargets: { m: { x: 21, y: 71 }, j: { x: 75, y: 24 }, t: { x: 72, y: 70 } },
    label: "editing",
    offsets: { d: { x: 0.7, y: 0.5 }, a: { x: -0.2, y: 0.1 } },
    userId: "m",
    titles: { d: "Option B" },
  },
  {
    active: "b",
    cursorTargets: { m: { x: 20, y: 19 }, j: { x: 67, y: 23 }, t: { x: 72, y: 70 } },
    label: "reviewing",
    offsets: { b: { x: 0.35, y: -0.25 }, c: { x: -0.25, y: 0.4 } },
    userId: "j",
    titles: { b: "@Sarah" },
  },
];

const ownerTokensKey = "roomboard-owner-tokens";
const themeStorageKey = "roomboard-theme";
const defaultOwnerTokens: Record<string, string> = { "pitch-deck-review": "demo-owner" };

function readStoredTheme(): Theme {
  if (typeof window === "undefined") {
    return "dark";
  }

  try {
    return window.localStorage.getItem(themeStorageKey) === "light" ? "light" : "dark";
  } catch {
    return "dark";
  }
}

function saveStoredTheme(theme: Theme) {
  if (typeof window === "undefined") {
    return;
  }

  try {
    window.localStorage.setItem(themeStorageKey, theme);
  } catch {
    // Theme persistence is optional.
  }
}

const LIcon = {
  Logo: () => (
    <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true">
      <rect x="2" y="2" width="5" height="5" rx="1" />
      <rect x="9" y="2" width="5" height="5" rx="1" />
      <rect x="2" y="9" width="5" height="5" rx="1" />
      <rect x="9" y="9" width="5" height="5" rx="1" />
    </svg>
  ),
  Arrow: () => (
    <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true">
      <path d="M3 8h10M9 4l4 4-4 4" />
    </svg>
  ),
  Plus: () => (
    <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.7" aria-hidden="true">
      <path d="M8 3v10M3 8h10" />
    </svg>
  ),
  Sun: () => (
    <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4" aria-hidden="true">
      <circle cx="8" cy="8" r="3" />
      <path d="M8 1v1.5M8 13.5V15M1 8h1.5M13.5 8H15M3 3l1 1M12 12l1 1M3 13l1-1M12 4l1-1" />
    </svg>
  ),
  Moon: () => (
    <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4" aria-hidden="true">
      <path d="M13 9.5A6 6 0 0 1 6.5 3a6 6 0 1 0 6.5 6.5z" />
    </svg>
  ),
  External: () => (
    <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4" aria-hidden="true">
      <path d="M6 3H3v10h10v-3M9 3h4v4M8 8l5-5" />
    </svg>
  ),
  Lock: () => (
    <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4" aria-hidden="true">
      <rect x="3" y="7" width="10" height="7" rx="1" />
      <path d="M5 7V5a3 3 0 0 1 6 0v2" />
    </svg>
  ),
  Globe: () => (
    <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4" aria-hidden="true">
      <circle cx="8" cy="8" r="6" />
      <path d="M2 8h12M8 2a9 9 0 0 1 0 12M8 2a9 9 0 0 0 0 12" />
    </svg>
  ),
};

function readOwnerTokens() {
  if (typeof window === "undefined") {
    return defaultOwnerTokens;
  }

  try {
    return {
      ...defaultOwnerTokens,
      ...(JSON.parse(localStorage.getItem(ownerTokensKey) ?? "{}") as Record<string, string>),
    };
  } catch {
    return defaultOwnerTokens;
  }
}

function writeOwnerToken(roomId: string, ownerToken: string) {
  const tokens = readOwnerTokens();
  tokens[roomId] = ownerToken;
  localStorage.setItem(ownerTokensKey, JSON.stringify(tokens));
  return tokens;
}

function slugInput(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, "")
    .trimStart()
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .slice(0, 42);
}

function roomNameFromSlug(value: string) {
  return (
    value
      .replace(/-/g, " ")
      .trim()
      .replace(/\b\w/g, (letter) => letter.toUpperCase()) || "Landing page review"
  );
}

function parseRoomLink(value: string) {
  const trimmed = value.trim();

  if (!trimmed) {
    return "";
  }

  try {
    const url = new URL(trimmed.startsWith("http") ? trimmed : `https://${trimmed}`);
    const parts = url.pathname.split("/").filter(Boolean);
    const roomIndex = parts.findIndex((part) => part === "rooms" || part === "r");
    return parts[roomIndex + 1] ?? parts[parts.length - 1] ?? "";
  } catch {
    const parts = trimmed.split("/").filter(Boolean);
    return parts[parts.length - 1] ?? "";
  }
}

function formatRelativeTime(timestamp: number) {
  const diff = Date.now() - timestamp;
  const minutes = Math.max(1, Math.round(diff / 60000));

  if (minutes < 60) {
    return `${minutes} min ago`;
  }

  const hours = Math.round(minutes / 60);

  if (hours < 24) {
    return `${hours} hour${hours === 1 ? "" : "s"} ago`;
  }

  const days = Math.round(hours / 24);
  return days === 1 ? "yesterday" : `${days} days ago`;
}

function colorName(color: string): PreviewColor {
  const normalized = color.toLowerCase();

  if (["#ffd166", "#facc5c", "#d4a544", "#f59e0b", "#c4942e"].includes(normalized)) return "amber";
  if (["#0ea5e9", "#48a7ff", "#5b8def", "#3d7eff", "#6366f1"].includes(normalized)) return "blue";
  if (["#10b981", "#4ec18a", "#62d681", "#2d9d6a"].includes(normalized)) return "green";
  if (["#f43f5e", "#ef6b7a", "#ef6f5e", "#d94d5e"].includes(normalized)) return "rose";
  if (["#9b7bd9", "#8c5be0", "#7d5fc7"].includes(normalized)) return "violet";

  return "slate";
}

function initials(name: string) {
  return name.trim().slice(0, 1).toUpperCase() || "R";
}

function getRoomDecisionProgress(room: RoomSummary) {
  const approved = room.statusCounts?.approved ?? 0;
  const changes = room.statusCounts?.changes_requested ?? 0;
  const decided = approved + changes;
  const total = Math.max(0, room.itemCount);

  return {
    decided,
    percent: total > 0 ? Math.round((decided / total) * 100) : 0,
    total,
  };
}

function makePreviewItems(room: RoomSummary): MiniPreviewItem[] {
  if (room.previewItems.length > 0) {
    const minX = Math.min(...room.previewItems.map((item) => item.x));
    const minY = Math.min(...room.previewItems.map((item) => item.y));
    const maxX = Math.max(...room.previewItems.map((item) => item.x + item.width));
    const maxY = Math.max(...room.previewItems.map((item) => item.y + item.height));
    const spanX = Math.max(1, maxX - minX);
    const spanY = Math.max(1, maxY - minY);

    return room.previewItems.slice(0, 5).map((item, index) => ({
      color: colorName(item.color),
      imageUrl: item.imageUrl,
      key: `${room.id}-${index}`,
      left: 5 + ((item.x - minX) / spanX) * 68,
      status: item.status,
      top: 6 + ((item.y - minY) / spanY) * 58,
      type: item.type,
      width: Math.min(38, Math.max(18, (item.width / spanX) * 70)),
      height: Math.min(54, Math.max(22, (item.height / spanY) * 68)),
    }));
  }

  return [
    { color: "amber", key: `${room.id}-a`, left: 6, status: "approved", top: 10, type: "note", width: 26, height: 28 },
    { color: "blue", key: `${room.id}-b`, left: 40, status: "reviewing", top: 8, type: "image", width: 36, height: 50 },
    { color: "rose", key: `${room.id}-c`, left: 8, status: "changes_requested", top: 50, type: "note", width: 24, height: 32 },
    { color: "green", key: `${room.id}-d`, left: 80, status: "open", top: 60, type: "note", width: 16, height: 22 },
  ];
}

function PreviewBoard() {
  const [activityIndex, setActivityIndex] = useState(0);
  const [cursors, setCursors] = useState([
    { id: "m", name: "Maya", color: "#ef6b7a", x: 56, y: 62 },
    { id: "j", name: "Jules", color: "#4ec18a", x: 72, y: 28 },
    { id: "t", name: "Theo", color: "#9b7bd9", x: 38, y: 78 },
  ]);

  useEffect(() => {
    const timer = window.setInterval(() => {
      setActivityIndex((current) => (current + 1) % previewActivityFrames.length);
    }, 2600);

    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    const frame = previewActivityFrames[activityIndex];
    setCursors((current) =>
      current.map((cursor) => {
        const target = frame.cursorTargets[cursor.id] ?? { x: cursor.x, y: cursor.y };
        return { ...cursor, x: target.x, y: target.y };
      }),
    );
  }, [activityIndex]);

  const activity = previewActivityFrames[activityIndex];
  const activeUser = cursors.find((cursor) => cursor.id === activity.userId);
  const baseCards: Array<{
    body?: string;
    color: PreviewColor;
    id: PreviewCardId;
    id_: string;
    img?: string;
    left: number;
    title: string;
    top: number;
    type: "image" | "note";
    width: number;
  }> = [
    { id: "a", type: "image", color: "blue", left: 13.6, top: 4.2, width: 20, title: "Option A", body: "Landing v2", id_: "C1", img: "https://images.unsplash.com/photo-1500530855697-b586d89ba3ee?w=460&q=70" },
    {
      id: "b",
      type: "note",
      color: "rose",
      left: 39.3,
      top: 8,
      width: 17.5,
      title: "@Sarah",
      body: "Love the new headline",
      id_: "C2",
    },
    { id: "c", type: "image", color: "violet", left: 60.8, top: 6.2, width: 17.7, title: "Moodboard", body: "Brand explorations", id_: "C5", img: "https://images.unsplash.com/photo-1500534314209-a25ddb2bd429?w=420&q=70" },
    { id: "d", type: "image", color: "green", left: 48.8, top: 51.5, width: 18.2, title: "Option B", body: "Landing v3", id_: "C4", img: "https://images.unsplash.com/photo-1497215728101-856f4ea42174?w=420&q=70" },
    { id: "e", type: "note", color: "green", left: 11.8, top: 59.7, width: 17.2, title: "@Tom", body: "This layout is more scannable", id_: "C3" },
  ];
  const cards = baseCards.map((card) => {
    const targetTitle = activity.titles[card.id];
    const isActive = activity.active === card.id;

    return {
      ...card,
      activityLabel: activity.label,
      activityUser: activeUser?.name ?? "Someone",
      isActive,
      left: card.left,
      title: targetTitle ?? card.title,
      top: card.top,
    };
  });
  const edges: Array<{
    color: "blue" | "green" | "purple" | "teal";
    d: string;
    dots: Array<{ x: number; y: number }>;
  }> = [
    {
      color: "purple",
      d: "M 13.6 33.4 C 7.8 33.4, 7.7 47.4, 13.2 52.7 C 15.5 55.2, 15.2 58.8, 13.8 59.7",
      dots: [{ x: 13.6, y: 33.4 }, { x: 13.8, y: 59.7 }],
    },
    {
      color: "purple",
      d: "M 33.6 16.4 C 37.8 16.4, 37.0 25.3, 47.9 25.3",
      dots: [{ x: 33.6, y: 16.4 }, { x: 47.9, y: 25.3 }],
    },
    {
      color: "purple",
      d: "M 47.9 25.3 C 52.0 31.2, 56.6 31.2, 60.8 24.3",
      dots: [{ x: 47.9, y: 25.3 }, { x: 60.8, y: 24.3 }],
    },
    {
      color: "purple",
      d: "M 78.5 29.9 C 80.5 29.9, 80.1 34.0, 82.3 34.0",
      dots: [{ x: 78.5, y: 29.9 }, { x: 82.3, y: 34.0 }],
    },
    {
      color: "blue",
      d: "M 67.0 68.1 C 75.2 69.6, 75.7 49.2, 82.3 49.2",
      dots: [{ x: 67.0, y: 68.1 }, { x: 82.3, y: 49.2 }],
    },
    {
      color: "green",
      d: "M 29.0 67.9 C 35.5 67.9, 40.8 73.8, 48.8 72.0",
      dots: [{ x: 29.0, y: 67.9 }, { x: 48.8, y: 72.0 }],
    },
  ];

  return (
    <div className="lp-preview">
      <div className="lp-preview__chrome">
        <div className="dots">
          <span />
          <span />
          <span />
        </div>
        <div className="preview-brand">
          <span className="preview-brand__mark">
            <LIcon.Logo />
          </span>
          Roomboard
        </div>
        <div className="url">
          Landing Page Review
          <span className="live">Live</span>
        </div>
        <div className="who">
          {cursors.slice(0, 3).map((cursor) => (
            <div key={cursor.id} className="av" style={{ background: cursor.color }}>
              {cursor.name[0]}
            </div>
          ))}
          <span className="share">Share</span>
        </div>
      </div>

      <div className="lp-preview__board">
        <div className="lp-preview__grid" />
        <div className="lp-preview__toolbar" aria-hidden="true">
          <span className="tool active" />
          <span className="tool square" />
          <span className="tool bubble" />
          <span className="tool link" />
          <span className="tool text" />
          <span className="tool grid" />
        </div>
        <div className="lp-preview__zoom" aria-hidden="true">
          <span />
          100%
        </div>
        <svg className="lp-preview__edges" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
          {edges.map((edge, index) => {
            return (
              <g key={index} className={`lp-preview__edge edge-${edge.color}`}>
                <path className="edge-halo" d={edge.d} vectorEffect="non-scaling-stroke" />
                <path className="edge-line" d={edge.d} vectorEffect="non-scaling-stroke" />
              </g>
            );
          })}
        </svg>

        {cards.map((card) => (
          <div
            key={card.id}
            className={`lp-preview__card card-${card.id} color-${card.color} ${card.type === "image" ? "image" : ""} ${card.isActive ? "is-active" : ""}`}
            style={{ left: `${card.left}%`, top: `${card.top}%`, width: `${card.width}%` }}
          >

            <div className="head">
              <span className="typedot" style={{ background: `var(--note-${card.color}-stripe)` }} />
              {card.title}
              <span className="id">#{card.id_}</span>
            </div>
            <div className="title">
              {card.type === "image" ? card.body : card.body}
            </div>
            {card.type === "image" ? (
              <div className="media">
                <img src={card.img} alt={card.title} />
                <span>{card.body}</span>
              </div>
            ) : null}
            <div className="foot">
              {card.id === "a" && "★ 12   ▢ 4"}
              {card.id === "b" && "2m"}
              {card.id === "c" && "▢ 8"}
              {card.id === "d" && "ↄ 7   ▢ 3"}
              {card.id === "e" && "1m"}
            </div>
          </div>
        ))}

        <div className="lp-preview__edge-dots" aria-hidden="true">
          {edges.flatMap((edge, edgeIndex) =>
            edge.dots.map((dot, dotIndex) => (
              <span
                key={`${edgeIndex}-${dotIndex}`}
                className={`edge-dot edge-${edge.color}`}
                style={{ left: `${dot.x}%`, top: `${dot.y}%` }}
              />
            )),
          )}
        </div>

        <div className="lp-preview__sticky">
          <strong>Note</strong>
          Double down on social proof
          <span>@Mike · 5m</span>
        </div>

        <div className="lp-preview__decision">
          <div>Decision</div>
          <strong>Landing v2</strong>
          <span><LIcon.Lock /> Decision locked</span>
          <div className="mini-avatars">
            {["#ef6b7a", "#ffd166", "#4ec18a", "#62a9ff", "#9b7bd9"].map((color, index) => (
              <i key={color} style={{ background: color, marginLeft: index === 0 ? 0 : -5 }} />
            ))}
            <em>+2</em>
          </div>
        </div>

        <div className="lp-preview__minimap" aria-hidden="true">
          <span />
          <span />
          <span />
          <span />
          <span />
        </div>

        {cursors.map((cursor) => (
          <div
            key={cursor.id}
            className={`lp-cursor ${activity.userId === cursor.id ? "is-active" : ""}`}
            style={{ left: `${cursor.x}%`, top: `${cursor.y}%` }}
          >
            <svg viewBox="0 0 16 18" fill={cursor.color} aria-hidden="true">
              <path d="M2 1.5l11 7-5.5 1.5L5 16z" />
            </svg>
            <div className="pill" style={{ background: cursor.color }}>
              {cursor.name}
              {activity.userId === cursor.id && <span>{activity.label}</span>}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function StepDemo({ kind }: { kind: 1 | 2 | 3 }) {
  if (kind === 1) {
    return (
      <div className="lp-step__demo">
        <div className="lp-demo-new-board">
          <div>NEW BOARD</div>
          Landing page review
          <span>|</span>
        </div>
        <div className="lp-demo-create">Create -&gt;</div>
      </div>
    );
  }

  if (kind === 2) {
    return (
      <div className="lp-step__demo">
        <div className="lp-demo-note lp-demo-note-a">
          <div />
          <span>Note</span>
        </div>
        <div className="lp-demo-image" />
        <div className="lp-demo-note lp-demo-note-b">
          <div />
        </div>
      </div>
    );
  }

  return (
    <div className="lp-step__demo">
      <div className="lp-demo-link">
        <div>roomboard.online/r/lpr-7s2k</div>
        <span>Copy</span>
      </div>
      <div className="lp-demo-avatars">
        {[
          { n: "M", c: "#ef6b7a" },
          { n: "J", c: "#4ec18a" },
          { n: "T", c: "#9b7bd9" },
          { n: "S", c: "#d4a544" },
        ].map((user, index) => (
          <div key={user.n} style={{ background: user.c, marginLeft: index === 0 ? 0 : -6 }}>
            {user.n}
          </div>
        ))}
      </div>
    </div>
  );
}

function RoomCard({ room, onOpen }: { room: RoomSummary; onOpen: (roomId: string) => void }) {
  const previewItems = makePreviewItems(room);
  const progress = getRoomDecisionProgress(room);
  const participants = room.participants.length
    ? room.participants
    : [
        { name: "Maya", color: "#ef6b7a" },
        { name: "Jules", color: "#4ec18a" },
        { name: "Theo", color: "#9b7bd9" },
      ];

  return (
    <a
      className="lp-room"
      href={`/rooms/${room.id}`}
      onClick={(event) => {
        event.preventDefault();
        onOpen(room.id);
      }}
    >
      <div className="lp-room__thumb">
        {previewItems.map((item) => (
          <div
            key={item.key}
            className={`lp-room__minicard ${item.type} status-${item.status}`}
            style={{
              backgroundImage: item.imageUrl ? `url(${item.imageUrl})` : undefined,
              height: `${item.height}%`,
              left: `${item.left}%`,
              top: `${item.top}%`,
              width: `${item.width}%`,
            }}
          >

          </div>
        ))}
        <div className={`lp-room__live ${room.access === "locked" ? "locked" : ""}`}>
          <span className="dot" />
          {room.visibility === "private" ? "Private" : room.access === "locked" ? "Locked" : room.liveCount > 0 ? `${room.liveCount} live` : "Idle"}
        </div>
      </div>
      <div className="lp-room__body">
        <div className="lp-room__title">{room.name}</div>
        <div className="lp-room__sub">
          <span>{room.noteCount}n</span>
          <span className="sep">·</span>
          <span>{room.imageCount}i</span>
          <span className="sep">·</span>
          <span>{room.connectionCount}↔</span>
          <span className="sep">·</span>
          <span>{formatRelativeTime(room.updatedAt)}</span>
        </div>
        <div className="lp-room__review" aria-label={`${progress.decided} of ${progress.total} cards decided`}>
          <span className="bar"><span style={{ width: `${progress.percent}%` }} /></span>
          <span>{progress.decided}/{progress.total || 0} decided</span>
        </div>
      </div>
      <div className="lp-room__foot">
        <div className="presence">
          {participants.slice(0, 4).map((member, index) => (
            <div key={`${member.name}-${index}`} className="av" style={{ background: member.color }}>
              {initials(member.name)}
            </div>
          ))}
        </div>
        <span className="open">
          Open <LIcon.External />
        </span>
      </div>
    </a>
  );
}

export function LandingPage({ initialRooms }: LandingPageProps) {
  const router = useRouter();
  const [theme, setTheme] = useState<Theme>("dark");
  const [rooms, setRooms] = useState(initialRooms);
  const [tab, setTab] = useState<RoomTab>("all");
  const [ownerTokens, setOwnerTokens] = useState<Record<string, string>>(defaultOwnerTokens);
  const [isCreating, setIsCreating] = useState(false);

  useEffect(() => {
    setTheme("dark");
  }, []);

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    saveStoredTheme(theme);
    document.body.classList.add("landing");
    document.documentElement.style.height = "auto";
    document.documentElement.style.minHeight = "100%";
    document.documentElement.style.overflow = "visible";
    document.documentElement.style.overflowX = "hidden";
    document.body.style.height = "auto";
    document.body.style.minHeight = "100%";
    document.body.style.overflow = "auto";
    document.body.style.overflowX = "hidden";

    return () => {
      document.body.classList.remove("landing");
      document.documentElement.style.height = "";
      document.documentElement.style.minHeight = "";
      document.documentElement.style.overflow = "";
      document.documentElement.style.overflowX = "";
      document.body.style.height = "";
      document.body.style.minHeight = "";
      document.body.style.overflow = "";
      document.body.style.overflowX = "";
    };
  }, [theme]);

  useEffect(() => {
    const tokens = readOwnerTokens();
    setOwnerTokens(tokens);

    const headers: Record<string, string> = {};
    if (Object.keys(tokens).length > 0) {
      headers["X-Owned-Rooms"] = JSON.stringify(tokens);
    }

    let cancelled = false;
    fetch("/api/rooms", { headers })
      .then((response) => response.json() as Promise<{ rooms?: RoomSummary[] }>)
      .then((data) => {
        if (!cancelled && data.rooms) {
          setRooms(data.rooms);
        }
      })
      .catch(() => undefined);

    return () => {
      cancelled = true;
    };
  }, []);

  const openRoom = useCallback(
    async (roomName?: string, seeded?: boolean) => {
      if (isCreating) {
        return;
      }

      setIsCreating(true);

      try {
        const response = await fetch("/api/rooms", {
          body: JSON.stringify({ name: roomNameFromSlug(roomName ?? "Landing page review"), visibility: "public", seeded }),
          headers: { "Content-Type": "application/json" },
          method: "POST",
        });
        const data = (await response.json()) as { ownerToken?: string; room?: RoomSummary };

        if (data.room && data.ownerToken) {
          setOwnerTokens(writeOwnerToken(data.room.id, data.ownerToken));
          setRooms((current) => [data.room!, ...current.filter((room) => room.id !== data.room!.id)]);
          router.push(`/rooms/${data.room.id}`);
        }
      } finally {
        setIsCreating(false);
      }
    },
    [isCreating, router],
  );

  const visibleRooms = useMemo(() => {
    return rooms.filter((room) => {
      if (tab === "live") return room.liveCount > 0;
      if (tab === "mine") return Boolean(ownerTokens[room.id]);
      return true;
    });
  }, [ownerTokens, rooms, tab]);

  const liveRooms = rooms.filter((room) => room.liveCount > 0).length;
  return (
    <>
      <nav className="lp-nav">
        <div className="lp-shell lp-nav__inner">
          <a className="lp-nav__logo" href="/">
            <div className="mark">
              <LIcon.Logo />
            </div>
            Roomboard
          </a>
          <div className="lp-nav__center">
          <a className="lp-nav__link" href="#how">
            How it works
          </a>
          <a className="lp-nav__link" href="#rooms">
            Product
          </a>
          <a className="lp-nav__link" href="#faq">
            Use cases
          </a>
          <a className="lp-nav__link" href="#billing">
            Pricing
          </a>
          <a className="lp-nav__link" href="#stack">
            Changelog
          </a>
          </div>
          <div className="lp-nav__spacer" />
          <a className="lp-nav__login" href="#rooms">
            Log in
          </a>
          <button className="lp-nav__cta" disabled={isCreating} onClick={() => void openRoom("Landing page review")} type="button">
            Start a room
          </button>
        </div>
      </nav>

      <main>
        <section className="lp-hero">
          <div className="lp-shell lp-hero__inner">
            <div className="lp-hero__signal">
              Visual Decision Room
            </div>
            <h1>
              Decide visually.
              <br />
              <span>In one room.</span>
            </h1>
            <p className="lead">
              Drop mockups, images, links and ideas into a shared canvas.
              <br />
              Invite the team, collect feedback, and turn messy opinions into clear decisions.
            </p>

            <div className="lp-hero__actions">
              <button className="lp-cta__cta" disabled={isCreating} onClick={() => void openRoom("Landing page review")} type="button">
                {isCreating ? "Opening" : "Start a room"}
                <LIcon.Arrow />
              </button>
              <button
                className="lp-demo-cta"
                disabled={isCreating}
                onClick={() => void openRoom("Demo: Landing page review", true)}
                type="button"
              >
                View demo room
              </button>
            </div>
            <PreviewBoard />

            <div className="lp-hero__trust">
              <span>Trusted by teams at</span>
              <strong>linear</strong>
              <strong>Framer</strong>
              <strong>superlist</strong>
              <strong>contra</strong>
              <strong>Acme Corp.</strong>
            </div>
          </div>
        </section>

        <section className="lp-shell lp-proof">
          <div className="lp-proof__cell">
            <div className="lp-proof__k">Time to first card</div>
            <div className="lp-proof__v">≈ 4 seconds</div>
          </div>
          <div className="lp-proof__cell">
            <div className="lp-proof__k">Onboarding steps</div>
            <div className="lp-proof__v">Zero — just join</div>
          </div>
          <div className="lp-proof__cell">
            <div className="lp-proof__k">Sharing</div>
            <div className="lp-proof__v">One link, lockable</div>
          </div>
          <div className="lp-proof__cell">
            <div className="lp-proof__k">Built for</div>
            <div className="lp-proof__v">Teams of 2–8</div>
          </div>
        </section>

        <div className="lp-shell">
          <SaasDemoPanel />
        </div>

        <section className="lp-shell lp-how" id="how">
          <div className="lp-how__head">
            <div>
              <div className="eyebrow">How it works</div>
              <h2>Three actions, no setup, no learning curve.</h2>
            </div>
            <div className="right">From cold link to aligned team in under a minute — no accounts, no projects, no permission requests.</div>
          </div>

          <div className="lp-steps">
            <div className="lp-step">
              <div className="lp-step__num">01</div>
              <h3>Name a room.</h3>
              <p>Type a name, hit enter. You're already on the board — no signup, no template picker, no empty-project anxiety.</p>
              <StepDemo kind={1} />
            </div>
            <div className="lp-step">
              <div className="lp-step__num">02</div>
              <h3>Drop in the visual material.</h3>
              <p>Paste image URLs, upload screenshots, write sticky notes. Cards snap to a 24px grid. Connect related ideas with a line.</p>
              <StepDemo kind={2} />
            </div>
            <div className="lp-step">
              <div className="lp-step__num">03</div>
              <h3>Share the link, decide together.</h3>
              <p>Teammates join with name and color, no account. Comment per card. Lock the room when the decision is made.</p>
              <StepDemo kind={3} />
            </div>
          </div>
        </section>

        <section className="lp-shell lp-section" id="rooms">
          <div className="lp-section__head">
            <div>
              <h2>Your active rooms</h2>
              <p>The boards you opened or joined recently. Click to walk back in.</p>
            </div>
            <div className="actions">
              <div className="lp-tabs">
                <button className={tab === "all" ? "active" : ""} onClick={() => setTab("all")} type="button">
                  All <span>{rooms.length}</span>
                </button>
                <button className={tab === "live" ? "active" : ""} onClick={() => setTab("live")} type="button">
                  Live now <span>{liveRooms}</span>
                </button>
                <button className={tab === "mine" ? "active" : ""} onClick={() => setTab("mine")} type="button">
                  Created by me
                </button>
              </div>
            </div>
          </div>

          <div className="lp-rooms">
            <button className="lp-room new" onClick={() => void openRoom("Landing page review")} type="button">
              <div className="inner">
                <LIcon.Plus />
                <span className="label">Start a new room</span>
                <span>N</span>
              </div>
            </button>
            {visibleRooms.map((room) => (
              <RoomCard key={room.id} room={room} onOpen={(roomId) => router.push(`/rooms/${roomId}`)} />
            ))}
          </div>
        </section>

        <section className="lp-shell lp-faq" id="faq">
          <div className="lp-faq__head">
            <h2>Things you'll want to know before joining a room.</h2>
          </div>
          <div className="lp-faq__grid">
            <div className="lp-faq__row">
              <div className="q">
                <span className="num">01</span>Do I need an account?
              </div>
              <p className="a">No. Open a room, type a display name and pick a color. You're in the session. Accounts are only for keeping a personal room history.</p>
            </div>
            <div className="lp-faq__row">
              <div className="q">
                <span className="num">02</span>Who can see my room?
              </div>
              <p className="a">Anyone with the link, by default. The creator can lock the room, flip it to view-only, or close it.</p>
            </div>
            <div className="lp-faq__row">
              <div className="q">
                <span className="num">03</span>How long do rooms stick around?
              </div>
              <p className="a">Active rooms persist indefinitely. After 30 days of no activity, the creator gets a heads-up before archive. Closed rooms become read-only links.</p>
            </div>
            <div className="lp-faq__row">
              <div className="q">
                <span className="num">04</span>What can I drop in?
              </div>
              <p className="a">Notes, image URLs, file uploads (PNG/JPG/WebP, up to 10MB each), and connector lines between cards. No formal diagrams, no Kanban, on purpose.</p>
            </div>
          </div>
        </section>

        <section className="lp-shell lp-stack" id="stack">
          <div className="lp-stack__head">
            <div>
              <div className="eyebrow">Under the hood</div>
              <h2>One stack, six sharp boundaries.</h2>
            </div>
            <div className="right">
              Every layer earns its place. No monolith, no magic — just the right tool for each job, from edge delivery to pixel-perfect canvas.
            </div>
          </div>

          <div className="lp-stack__grid">
            <div className="lp-stack__card">
              <div className="lp-stack__icon nextjs">
                <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                  <path d="M11.573 1.452a.545.545 0 0 0-.385.518V14.99L3.01 3.067A10.99 10.99 0 0 0 1.2 5.625v13.623a.55.55 0 0 0 .84.47l4.202-2.426V9.876l7.05 10.617a.545.545 0 0 0 .838.47l3.71-2.143a.545.545 0 0 0 .265-.47V7.13L24 5.442V3.952L13.846 9.81v-2.16L24 1.76v-.29A.545.545 0 0 0 23.323 1L11.973 7.55V2.806a.545.545 0 0 0-.4-.525l4.79-2.766A10.93 10.93 0 0 0 11.573 1.452z"/>
                </svg>
              </div>
              <div className="lp-stack__name">Next.js 16</div>
              <div className="lp-stack__role">App Router — shell, routing, API</div>
              <p>Server components hydrate the board. Route handlers own room CRUD, local fallback, and upload streaming. Every page is edge-cached.</p>
              <div className="lp-stack__detail">
                <span className="k">SSR</span><span className="k">Route Handlers</span><span className="k">Local fallback</span>
              </div>
            </div>

            <div className="lp-stack__card">
              <div className="lp-stack__icon pixi">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
                  <rect x="3" y="3" width="7" height="7" rx="1.5" />
                  <rect x="14" y="3" width="7" height="7" rx="1.5" />
                  <rect x="3" y="14" width="7" height="7" rx="1.5" />
                  <path d="M14 17.5h7M17.5 14v7" strokeLinecap="round" />
                </svg>
              </div>
              <div className="lp-stack__name">Pixi.js v8</div>
              <div className="lp-stack__role">WebGL canvas — cards, links, zoom</div>
              <p>GPU-accelerated rendering for hundreds of draggable cards, bezier connectors, and smooth pan/zoom. Pixel-perfect text at any zoom level.</p>
              <div className="lp-stack__detail">
                <span className="k">WebGL2</span><span className="k">Drag · Zoom</span><span className="k">Crisp text</span>
              </div>
            </div>

            <div className="lp-stack__card">
              <div className="lp-stack__icon phoenix">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true">
                  <path d="M12 2C8 4 7 7 8 10c-2 .5-3 2-3 4 0-1 1-2 2-2 .5 2 2 3.5 5 4-1.5-1-2-2-2-3 2 1 4 1 5-1-2 .5-3 0-3.5-1-.5-2 .5-4 2.5-5.5C15 3 13.5 2.3 12 2z" strokeLinejoin="round" />
                  <circle cx="12" cy="21" r="1.2" fill="currentColor" stroke="none" />
                </svg>
              </div>
              <div className="lp-stack__name">Phoenix Channels</div>
              <div className="lp-stack__role">Elixir — realtime sync &amp; presence</div>
              <p>When the sidecar is live, card mutations, cursors, and presence broadcast through Phoenix with &lt;50ms latency. Hosted traffic stays off Vercel streams.</p>
              <div className="lp-stack__detail">
                <span className="k">WebSocket</span><span className="k">Presence</span><span className="k">No SSE burn</span>
              </div>
            </div>

            <div className="lp-stack__card">
              <div className="lp-stack__icon supabase">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true">
                  <path d="M13.5 1.5c-.4-.5-1.2-.2-1.2.4L12 9.5l9-1c.6-.1.8-.9.3-1.3L13.5 1.5z" />
                  <path d="M13.5 1.5c3.5 4 3.5 8 .5 12s-8.5 5-11 5l10.5-17z" strokeLinejoin="round" />
                </svg>
              </div>
              <div className="lp-stack__name">Supabase</div>
              <div className="lp-stack__role">Auth + Postgres — RLS state</div>
              <p>Supabase Auth owns users, while RLS scopes profiles, subscription reads, and owner-aware room rows to the active account.</p>
              <div className="lp-stack__detail">
                <span className="k">Auth</span><span className="k">RLS</span><span className="k">Storage</span>
              </div>
            </div>

            <div className="lp-stack__card">
              <div className="lp-stack__icon stripepay">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" aria-hidden="true">
                  <rect x="3" y="5" width="18" height="14" rx="2.5" />
                  <path d="M3 9h18M7 15h4M15 15h2" strokeLinecap="round" />
                </svg>
              </div>
              <div className="lp-stack__name">Stripe Billing</div>
              <div className="lp-stack__role">Annual plans — Checkout + webhooks</div>
              <p>Annual Prices run through subscription Checkout. Webhooks persist lifecycle events and the billing portal handles self-serve changes.</p>
              <div className="lp-stack__detail">
                <span className="k">Annual Prices</span><span className="k">Webhooks</span><span className="k">Portal</span>
              </div>
            </div>

            <div className="lp-stack__card">
              <div className="lp-stack__icon vercel">
                <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                  <path d="M12 2L2 19h20L12 2z" />
                </svg>
              </div>
              <div className="lp-stack__name">Vercel</div>
              <div className="lp-stack__role">Edge delivery — instant deploys</div>
              <p>Preview deploys for every PR. Edge functions for presence pings. Zero-config CI — push to main, live in under 60 seconds.</p>
              <div className="lp-stack__detail">
                <span className="k">Edge runtime</span><span className="k">Preview deploys</span><span className="k">Analytics</span>
              </div>
            </div>
          </div>

          <div className="lp-stack__flow">
            <div className="lp-stack__flow-label">A card drag, end to end:</div>
            <div className="lp-stack__flow-chain">
              <span className="node">Pointer</span>
              <span className="arrow">→</span>
              <span className="node">Pixi.js</span>
              <span className="arrow">→</span>
              <span className="node">Phoenix</span>
              <span className="arrow">→</span>
              <span className="node">Supabase</span>
              <span className="arrow">→</span>
              <span className="node">Other tabs</span>
            </div>
          </div>
        </section>

        <section className="lp-shell lp-section lp-final-cta">
          <div>
            <div>
              <span />
              Free while in public beta
            </div>
            <p>Got something to review? Open a room and paste the link in your group chat.</p>
          </div>
          <button className="lp-nav__cta" onClick={() => void openRoom("Landing page review")} type="button">
            Start a room <LIcon.Arrow />
          </button>
        </section>

        <footer className="lp-shell lp-footer">
          <div className="logo">
            <div className="mark" /> Roomboard
          </div>
          <span>© 2026</span>
          <span>·</span>
          <span>roomboard.online</span>
          <div className="right">
            <a href="#">Changelog</a>
            <a href="#">Privacy</a>
            <a href="#">Status</a>
            <a href="#">Contact</a>
          </div>
        </footer>
      </main>
    </>
  );
}
