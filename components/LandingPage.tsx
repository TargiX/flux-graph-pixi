"use client";

import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import type { RoomItemStatus, RoomSummary } from "@/lib/canvasRoom";

type LandingPageProps = {
  initialRooms: RoomSummary[];
};

type Theme = "dark" | "light";
type RoomTab = "all" | "live" | "mine";
type PreviewColor = "amber" | "blue" | "green" | "rose" | "violet" | "slate";
type PreviewCardId = "a" | "b" | "c" | "d";
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
    titles: { a: "North star v2" },
  },
  {
    active: "b",
    cursorTargets: { m: { x: 20, y: 19 }, j: { x: 66, y: 22 }, t: { x: 72, y: 70 } },
    label: "dragging",
    offsets: { b: { x: -1.1, y: 0.8 }, c: { x: 0.2, y: 0.2 } },
    userId: "j",
    titles: { b: "Hero - variant B" },
  },
  {
    active: "c",
    cursorTargets: { m: { x: 21, y: 71 }, j: { x: 75, y: 23 }, t: { x: 70, y: 70 } },
    label: "typing",
    offsets: { c: { x: 0.9, y: -0.8 }, b: { x: -0.4, y: 0.5 } },
    userId: "t",
    titles: { c: "Decision locked" },
  },
  {
    active: "d",
    cursorTargets: { m: { x: 21, y: 71 }, j: { x: 75, y: 24 }, t: { x: 72, y: 70 } },
    label: "editing",
    offsets: { d: { x: 0.7, y: 0.5 }, a: { x: -0.2, y: 0.1 } },
    userId: "m",
    titles: { d: "Open questions" },
  },
  {
    active: "b",
    cursorTargets: { m: { x: 20, y: 19 }, j: { x: 67, y: 23 }, t: { x: 72, y: 70 } },
    label: "reviewing",
    offsets: { b: { x: 0.35, y: -0.25 }, c: { x: -0.25, y: 0.4 } },
    userId: "j",
    titles: { b: "Hero - variant A" },
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
  const [typedProgress, setTypedProgress] = useState(0);
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
    setTypedProgress(0);
    setCursors((current) =>
      current.map((cursor) => {
        const target = frame.cursorTargets[cursor.id] ?? { x: cursor.x, y: cursor.y };
        return { ...cursor, x: target.x, y: target.y };
      }),
    );
  }, [activityIndex]);

  const activity = previewActivityFrames[activityIndex];
  const activeTitle = activity.titles[activity.active] ?? "";

  useEffect(() => {
    if (!activeTitle) {
      setTypedProgress(0);
      return undefined;
    }

    let nextProgress = 0;
    let typer: number | undefined;
    const typingDelay = window.setTimeout(() => {
      typer = window.setInterval(() => {
        nextProgress += 1;
        setTypedProgress(Math.min(nextProgress, activeTitle.length));

        if (nextProgress >= activeTitle.length) {
          window.clearInterval(typer);
        }
      }, 72);
    }, 420);

    return () => {
      window.clearTimeout(typingDelay);
      if (typer) {
        window.clearInterval(typer);
      }
    };
  }, [activeTitle]);

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
    { id: "a", type: "note", color: "amber", left: 6, top: 8, width: 30, title: "North star", body: "Visual decisions in one shared room.", id_: "C1" },
    {
      id: "b",
      type: "image",
      color: "blue",
      left: 46,
      top: 8,
      width: 40,
      title: "Hero - variant A",
      id_: "C2",
      img: "https://images.unsplash.com/photo-1490604001847-b712b0c2f967?w=400&q=70",
    },
    { id: "c", type: "note", color: "rose", left: 60, top: 65, width: 32, title: "Decision", body: "Ship variant A. Pricing in second fold.", id_: "C5" },
    { id: "d", type: "note", color: "green", left: 6, top: 62, width: 28, title: "Open Qs", body: "Dark first?\nPricing copy?", id_: "C4" },
  ];
  const cards = baseCards.map((card) => {
    const offset = activity.offsets[card.id] ?? { x: 0, y: 0 };
    const targetTitle = activity.titles[card.id];
    const isActive = activity.active === card.id;

    return {
      ...card,
      activityLabel: activity.label,
      activityUser: activeUser?.name ?? "Someone",
      isActive,
      left: card.left + offset.x,
      title: isActive && targetTitle ? targetTitle.slice(0, typedProgress) : targetTitle ?? card.title,
      top: card.top + offset.y,
    };
  });
  const edges: Array<[PreviewCardId, PreviewCardId]> = [
    ["a", "b"],
    ["b", "c"],
    ["d", "c"],
    ["a", "d"],
  ];
  const cardMap = new Map(cards.map((card) => [card.id, card]));
  const cardH = (card: (typeof cards)[number]) => (card.type === "image" ? card.width * 0.66 : card.width * 0.45);
  const cx = (card: (typeof cards)[number]) => card.left + card.width / 2;
  const cy = (card: (typeof cards)[number]) => card.top + cardH(card) / 2;
  const connectionPath = (from: (typeof cards)[number], to: (typeof cards)[number]) => {
    const fromCenter = { x: cx(from), y: cy(from) };
    const toCenter = { x: cx(to), y: cy(to) };
    const horizontal = Math.abs(toCenter.x - fromCenter.x) >= Math.abs(toCenter.y - fromCenter.y);

    if (horizontal) {
      const fromIsLeft = fromCenter.x <= toCenter.x;
      const x1 = fromIsLeft ? from.left + from.width : from.left;
      const y1 = fromCenter.y;
      const x2 = fromIsLeft ? to.left : to.left + to.width;
      const y2 = toCenter.y;
      const bend = Math.max(10, Math.abs(x2 - x1) * 0.5);
      const c1x = x1 + (fromIsLeft ? bend : -bend);
      const c2x = x2 - (fromIsLeft ? bend : -bend);

      return { d: `M ${x1} ${y1} C ${c1x} ${y1}, ${c2x} ${y2}, ${x2} ${y2}`, x1, x2, y1, y2 };
    }

    const fromIsAbove = fromCenter.y <= toCenter.y;
    const x1 = fromCenter.x;
    const y1 = fromIsAbove ? from.top + cardH(from) : from.top;
    const x2 = toCenter.x;
    const y2 = fromIsAbove ? to.top : to.top + cardH(to);
    const bend = Math.max(9, Math.abs(y2 - y1) * 0.45);
    const c1y = y1 + (fromIsAbove ? bend : -bend);
    const c2y = y2 - (fromIsAbove ? bend : -bend);

    return { d: `M ${x1} ${y1} C ${x1} ${c1y}, ${x2} ${c2y}, ${x2} ${y2}`, x1, x2, y1, y2 };
  };

  return (
    <div className="lp-preview">
      <div className="lp-preview__chrome">
        <div className="dots">
          <span />
          <span />
          <span />
        </div>
        <div className="url">
          <LIcon.Globe />
          roomboard.online<span className="slash">/r/</span>landing-page-review
          <span className="live">live</span>
        </div>
        <div className="who">
          {cursors.slice(0, 3).map((cursor) => (
            <div key={cursor.id} className="av" style={{ background: cursor.color }}>
              {cursor.name[0]}
            </div>
          ))}
        </div>
      </div>

      <div className="lp-preview__board">
        <div className="lp-preview__grid" />
        <svg className="lp-preview__edges" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
          {edges.map(([from, to], index) => {
            const a = cardMap.get(from);
            const b = cardMap.get(to);

            if (!a || !b) {
              return null;
            }

            const edge = connectionPath(a, b);

            return (
              <g key={index} className="lp-preview__edge">
                <path className="edge-halo" d={edge.d} vectorEffect="non-scaling-stroke" />
                <path className="edge-line" d={edge.d} vectorEffect="non-scaling-stroke" />
                <circle className="edge-dot" cx={edge.x1} cy={edge.y1} r="0.44" vectorEffect="non-scaling-stroke" />
                <circle className="edge-dot" cx={edge.x2} cy={edge.y2} r="0.44" vectorEffect="non-scaling-stroke" />
              </g>
            );
          })}
        </svg>

        {cards.map((card) => (
          <div
            key={card.id}
            className={`lp-preview__card color-${card.color} ${card.type === "image" ? "image" : ""} ${card.isActive ? "is-active" : ""}`}
            style={{ left: `${card.left}%`, top: `${card.top}%`, width: `${card.width}%` }}
          >
            <div className="stripe" />
            <div className="head">
              <span className="typedot" style={{ background: `var(--note-${card.color}-stripe)` }} />
              {card.type === "image" ? "Image" : "Note"}
              <span className="id">#{card.id_}</span>
            </div>
            <div className="title">
              {card.title}
              {card.isActive && <span className="title-caret" />}
            </div>
            {card.type === "image" ? (
              <div className="media">
                <img src={card.img} alt={card.title} />
              </div>
            ) : (
              <div className="body">{card.body}</div>
            )}
            <div className="foot">
              {card.isActive ? (
                <span className="editing">
                  <span />
                  {card.activityUser} {card.activityLabel}
                </span>
              ) : (
                "240x130"
              )}
            </div>
          </div>
        ))}

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
            {!item.imageUrl && <div className="ms" style={{ background: `var(--note-${item.color}-stripe)` }} />}
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
  const [name, setName] = useState("");
  const [tab, setTab] = useState<RoomTab>("all");
  const [pasteLink, setPasteLink] = useState("");
  const [pasteOpen, setPasteOpen] = useState(false);
  const [ownerTokens, setOwnerTokens] = useState<Record<string, string>>(defaultOwnerTokens);
  const [isCreating, setIsCreating] = useState(false);
  const [isPrivate, setIsPrivate] = useState(false);

  useEffect(() => {
    setTheme(readStoredTheme());
  }, []);

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    saveStoredTheme(theme);
    document.body.classList.add("landing");
    document.documentElement.style.height = "auto";
    document.documentElement.style.minHeight = "100%";
    document.documentElement.style.overflow = "visible";
    document.body.style.height = "auto";
    document.body.style.minHeight = "100%";
    document.body.style.overflow = "auto";

    return () => {
      document.body.classList.remove("landing");
      document.documentElement.style.height = "";
      document.documentElement.style.minHeight = "";
      document.documentElement.style.overflow = "";
      document.body.style.height = "";
      document.body.style.minHeight = "";
      document.body.style.overflow = "";
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
    async (roomName?: string) => {
      if (isCreating) {
        return;
      }

      setIsCreating(true);

      try {
        const response = await fetch("/api/rooms", {
          body: JSON.stringify({ name: roomNameFromSlug(roomName ?? name), visibility: isPrivate ? "private" : "public" }),
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
    [isCreating, isPrivate, name, router],
  );

  const joinRoom = useCallback(() => {
    const roomId = parseRoomLink(pasteLink);

    if (roomId) {
      router.push(`/rooms/${roomId}`);
    }
  }, [pasteLink, router]);

  const visibleRooms = useMemo(() => {
    return rooms.filter((room) => {
      if (tab === "live") return room.liveCount > 0;
      if (tab === "mine") return Boolean(ownerTokens[room.id]);
      return true;
    });
  }, [ownerTokens, rooms, tab]);

  const liveRooms = rooms.filter((room) => room.liveCount > 0).length;
  const heroRoomCount = Math.max(87, rooms.length + liveRooms);

  const submitHero = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    void openRoom(name);
  };

  return (
    <>
      <nav className="lp-nav">
        <div className="lp-shell lp-nav__inner">
          <a className="lp-nav__logo" href="/">
            <div className="mark">
              <LIcon.Logo />
            </div>
            Roomboard
            <span className="beta">beta</span>
          </a>
          <div className="lp-nav__spacer" />
          <a className="lp-nav__link" href="#how">
            How it works
          </a>
          <a className="lp-nav__link" href="#rooms">
            Recent rooms
          </a>
          <button
            aria-label={theme === "dark" ? "Switch to light" : "Switch to dark"}
            className="lp-nav__icon"
            onClick={() => setTheme((current) => (current === "dark" ? "light" : "dark"))}
            title={theme === "dark" ? "Switch to light" : "Switch to dark"}
            type="button"
          >
            {theme === "dark" ? <LIcon.Sun /> : <LIcon.Moon />}
          </button>
          <button className="lp-nav__cta" onClick={() => void openRoom("Landing page review")} type="button">
            New room
            <span className="kbd">↵</span>
          </button>
        </div>
      </nav>

      <main className="lp-shell">
        <section className="lp-hero">
          <div>
            <div className="lp-hero__signal">
              <span className="dot" />
              <strong>{heroRoomCount} rooms live</strong>
              <span className="sep">·</span>
              <span>Realtime visual workspace</span>
            </div>
            <h1>
              Visual decisions,
              <br />
              made <span className="em-line">in one room.</span>
            </h1>
            <p className="lead">
              A live workspace for moodboards, landing-page reviews, and creative feedback. Drop references, write a
              note, share the link — no project setup, no onboarding.
            </p>

            <form className="lp-cta" onSubmit={submitHero}>
              <div className="lp-cta__prefix">
                roomboard.online<span className="slash">/r/</span>
              </div>
              <input
                autoFocus
                onChange={(event) => setName(slugInput(event.target.value))}
                placeholder="landing-page-review"
                value={name}
              />
              <button className="lp-cta__cta" disabled={isCreating} type="submit">
                {isCreating ? "Opening" : "Open room"}
                <span className="kbd">↵</span>
              </button>
            </form>

            <div className="lp-cta-meta">
              <label className="lp-private-toggle">
                <input checked={isPrivate} onChange={(e) => setIsPrivate(e.target.checked)} type="checkbox" />
                <LIcon.Lock />
                <span>Private room</span>
              </label>
              <span className="sep">·</span>
              <span className="item">Anyone with link joins</span>
              <button onClick={() => setPasteOpen((current) => !current)} type="button">
                {pasteOpen ? "↑ Hide link join" : "Have a link? Join →"}
              </button>
            </div>

            {pasteOpen && (
              <div className="lp-paste">
                <LIcon.Globe />
                <input
                  autoFocus
                  onChange={(event) => setPasteLink(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") {
                      joinRoom();
                    }
                  }}
                  placeholder="roomboard.online/r/your-room-7s2k"
                  value={pasteLink}
                />
                <button onClick={joinRoom} type="button">
                  Join
                </button>
              </div>
            )}
          </div>
          <div>
            <PreviewBoard />
          </div>
        </section>

        <section className="lp-proof">
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

        <section className="lp-how" id="how">
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

        <section className="lp-section" id="rooms">
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

        <section className="lp-faq" id="faq">
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

        <section className="lp-section lp-final-cta">
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

        <footer className="lp-footer">
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
