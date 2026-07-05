"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { CircleCheck } from "lucide-react";
import type { RoomItemStatus, RoomSummary } from "@/lib/canvasRoom";
import { captureCampaignAttribution, trackProductEvent } from "@/lib/productAnalytics";
import { LandingLower } from "./LandingLower";

type LandingPageProps = {
  initialRooms: RoomSummary[];
  initialStarter?: StarterId;
  entryIntent?: StarterId;
};

type Theme = "dark" | "light";
type RoomTab = "all" | "live" | "mine" | "joined";
export type StarterId = "landing-review" | "moodboard" | "blank";
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
const inviteTokensKey = "roomboard-invite-tokens";
const themeStorageKey = "roomboard-theme";
const defaultOwnerTokens: Record<string, string> = {};
const defaultInviteTokens: Record<string, string> = {};
const starterOptions: Array<{
  id: StarterId;
  label: string;
  name: string;
  note: string;
  outcome: string;
  promise: string;
  seeded: boolean;
}> = [
  {
    id: "landing-review",
    label: "Landing review",
    name: "Landing page review",
    note: "5 cards + comments",
    outcome: "A seeded review room with homepage direction, hero copy, mobile layout, comments, and statuses already on the board.",
    promise: "Best for ad traffic that needs to see the product working immediately.",
    seeded: true,
  },
  {
    id: "moodboard",
    label: "Moodboard",
    name: "Moodboard decision",
    note: "References + criteria",
    outcome: "A moodboard room with reference images, decision criteria, team comments, and a next-step card.",
    promise: "Best when the user needs to choose a visual direction with other people.",
    seeded: true,
  },
  {
    id: "blank",
    label: "Blank room",
    name: "Untitled review",
    note: "Clean canvas + guide",
    outcome: "A private blank canvas with the first-room checklist, invite links, and owner backup link ready.",
    promise: "Best when the material is already prepared and the user just needs a private room.",
    seeded: false,
  },
];
const useCaseOptions: Array<{
  id: string;
  label: string;
  title: string;
  body: string;
  starterId: StarterId;
  cta: string;
}> = [
  {
    id: "landing-review",
    label: "For founders and marketers",
    title: "Review a landing page before traffic hits it.",
    body: "Drop desktop and mobile screenshots, compare copy options, collect comments, and lock the version the team should ship.",
    starterId: "landing-review",
    cta: "Start landing review",
  },
  {
    id: "moodboard",
    label: "For brand and creative work",
    title: "Choose a visual direction without a messy thread.",
    body: "Put references, notes, and decision criteria in one private room so the conversation stays attached to the material.",
    starterId: "moodboard",
    cta: "Start moodboard",
  },
  {
    id: "blank",
    label: "For any visual decision",
    title: "Open a clean room when the material is already ready.",
    body: "Use a blank canvas for screenshots, product states, campaign ideas, or design critique that does not need a starter board.",
    starterId: "blank",
    cta: "Start blank room",
  },
];

const faqItems: Array<{ q: string; a: string }> = [
  {
    q: "How do I get back to a room?",
    a: "Rooms you create are remembered in this browser with a creator token. Rooms you join from an invite link are remembered too, and you can copy an owner link for your own backup.",
  },
  {
    q: "Who can see my room?",
    a: "New rooms are private and locked by default. Access comes from the creator token or role-specific invite links, so private rooms are not exposed as an open public directory.",
  },
  {
    q: "How long do rooms stick around?",
    a: "Active rooms are saved durably and can be reopened from this browser or an invite link. When the creator closes a room, it leaves the active flow and stops accepting edits.",
  },
  {
    q: "What can I drop in?",
    a: "Notes, image URLs, file uploads (PNG/JPG/GIF/WebP, up to 10MB each), comments, statuses, and connector lines between cards. It stays focused on visual review, not project management.",
  },
];

function getStarterOption(starterId: StarterId) {
  return starterOptions.find((option) => option.id === starterId) ?? starterOptions[0];
}

function normalizeStarterId(value: string | null): StarterId | null {
  const normalized = value?.toLowerCase().replace(/_/g, "-").trim();

  if (!normalized) return null;
  if (["landing", "landing-page", "landing-review", "review"].includes(normalized)) return "landing-review";
  if (["mood", "moodboard", "references", "brand"].includes(normalized)) return "moodboard";
  if (["blank", "empty", "scratch"].includes(normalized)) return "blank";
  return null;
}

function readUrlStarter(): StarterId | null {
  if (typeof window === "undefined") {
    return null;
  }

  const params = new URLSearchParams(window.location.search);
  return (
    normalizeStarterId(params.get("starter")) ??
    normalizeStarterId(params.get("template")) ??
    normalizeStarterId(params.get("use_case")) ??
    normalizeStarterId(params.get("campaign"))
  );
}

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

function readInviteTokens() {
  if (typeof window === "undefined") {
    return defaultInviteTokens;
  }

  try {
    return {
      ...defaultInviteTokens,
      ...(JSON.parse(localStorage.getItem(inviteTokensKey) ?? "{}") as Record<string, string>),
    };
  } catch {
    return defaultInviteTokens;
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

export function LandingPage({ initialRooms, initialStarter, entryIntent }: LandingPageProps) {
  const router = useRouter();
  const [theme, setTheme] = useState<Theme>("dark");
  const [rooms, setRooms] = useState(initialRooms);
  const [tab, setTab] = useState<RoomTab>("all");
  const [inviteTokens, setInviteTokens] = useState<Record<string, string>>(defaultInviteTokens);
  const [ownerTokens, setOwnerTokens] = useState<Record<string, string>>(defaultOwnerTokens);
  const [isCreating, setIsCreating] = useState(false);
  // Blank by default: generic CTAs ("Start a room" in nav/hero/final) should open
  // a clean private room. Seeded starters only come from campaign URLs
  // (?starter=...) or the explicit use-case buttons that pass their own starter.
  const [selectedStarter, setSelectedStarter] = useState<StarterId>(initialStarter ?? entryIntent ?? "blank");

  useEffect(() => {
    setTheme("dark");
  }, []);

  useEffect(() => {
    captureCampaignAttribution();
  }, []);

  useEffect(() => {
    const urlStarter = readUrlStarter();
    if (urlStarter) {
      setSelectedStarter(urlStarter);
      trackProductEvent("Starter Selected", { source: "url", starter: urlStarter });
    }
  }, []);

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    saveStoredTheme(theme);
    document.body.classList.add("landing");
    document.documentElement.style.height = "auto";
    document.documentElement.style.minHeight = "100%";
    document.documentElement.style.overflow = "visible";
    // overflow-x: clip (not hidden/auto) — a hidden/auto value turns body into
    // a scroll container, which detaches every position:sticky descendant from
    // the viewport scroll and silently kills the pinned sections below.
    document.documentElement.style.overflowX = "clip";
    document.body.style.height = "auto";
    document.body.style.minHeight = "100%";
    document.body.style.overflow = "visible";
    document.body.style.overflowX = "clip";

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
    const nextInviteTokens = readInviteTokens();
    const nextOwnerTokens = readOwnerTokens();
    setInviteTokens(nextInviteTokens);
    setOwnerTokens(nextOwnerTokens);

    const headers: Record<string, string> = {};
    if (Object.keys(nextOwnerTokens).length > 0) {
      headers["X-Owned-Rooms"] = JSON.stringify(nextOwnerTokens);
    }
    if (Object.keys(nextInviteTokens).length > 0) {
      headers["X-Invite-Rooms"] = JSON.stringify(nextInviteTokens);
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
    async (roomName?: string, source = "landing", starterId = selectedStarter) => {
      if (isCreating) {
        return;
      }

      const starter = getStarterOption(starterId);
      setIsCreating(true);
      trackProductEvent("Room Start Clicked", { source, starter: starter.id });

      try {
        const response = await fetch("/api/rooms", {
          body: JSON.stringify({
            name: roomNameFromSlug(roomName ?? starter.name),
            starterTemplate: starter.seeded ? starter.id : undefined,
          }),
          headers: { "Content-Type": "application/json" },
          method: "POST",
        });
        const data = (await response.json()) as { ownerToken?: string; room?: RoomSummary };

        if (data.room && data.ownerToken) {
          trackProductEvent("Room Created", {
            source,
            starter: starter.id,
            access: data.room.access,
            visibility: data.room.visibility,
            itemCount: data.room.itemCount,
          });
          setOwnerTokens(writeOwnerToken(data.room.id, data.ownerToken));
          setRooms((current) => [data.room!, ...current.filter((room) => room.id !== data.room!.id)]);
          router.push(`/rooms/${data.room.id}?new=1&starter=${starter.id}`);
        } else {
          trackProductEvent("Room Create Failed", { reason: "missing_room", source });
        }
      } catch {
        trackProductEvent("Room Create Failed", { reason: "request_error", source, starter: starter.id });
      } finally {
        setIsCreating(false);
      }
    },
    [isCreating, router, selectedStarter],
  );

  const openDemoRoom = useCallback(() => {
    trackProductEvent("Demo Room Opened", { source: "landing" });
    router.push("/rooms/pitch-deck-review");
  }, [router]);

  const selectStarter = useCallback((starterId: StarterId, source = "starter_picker") => {
    setSelectedStarter(starterId);
    trackProductEvent("Starter Selected", { source, starter: starterId });
  }, []);

  const visibleRooms = useMemo(() => {
    return rooms.filter((room) => {
      if (tab === "live") return room.liveCount > 0;
      if (tab === "mine") return Boolean(ownerTokens[room.id]);
      if (tab === "joined") return Boolean(inviteTokens[room.id]) && !ownerTokens[room.id];
      return true;
    });
  }, [inviteTokens, ownerTokens, rooms, tab]);

  const joinedRooms = rooms.filter((room) => inviteTokens[room.id] && !ownerTokens[room.id]).length;
  const liveRooms = rooms.filter((room) => room.liveCount > 0).length;
  const selectedStarterOption = getStarterOption(selectedStarter);
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
            <a className="lp-nav__link" href="#use-cases">
              Use cases
            </a>
            <a className="lp-nav__link" href="#rooms">
              Rooms
            </a>
            <a className="lp-nav__link" href="#faq">
              FAQ
            </a>
          </div>
          <div className="lp-nav__spacer" />
          <a className="lp-nav__login" href="#rooms">
            Rooms
          </a>
          <button className="lp-nav__cta" disabled={isCreating} onClick={() => void openRoom(undefined, "nav")} type="button">
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
              <button className="lp-cta__cta" disabled={isCreating} onClick={() => void openRoom(undefined, "hero")} type="button">
                {isCreating ? "Opening" : "Start a room"}
                <LIcon.Arrow />
              </button>
              <button
                className="lp-demo-cta"
                disabled={isCreating}
                onClick={openDemoRoom}
                type="button"
              >
                View demo room
              </button>
            </div>
            <PreviewBoard />

            <div className="lp-hero__trust">
              <span className="lp-hero__trust-label">Room status</span>
              <strong><CircleCheck aria-hidden="true" size={14} strokeWidth={1.8} />Private by default</strong>
              <strong><CircleCheck aria-hidden="true" size={14} strokeWidth={1.8} />Invite links</strong>
              <strong><CircleCheck aria-hidden="true" size={14} strokeWidth={1.8} />Live cursors</strong>
              <strong><CircleCheck aria-hidden="true" size={14} strokeWidth={1.8} />Lockable</strong>
              <strong><CircleCheck aria-hidden="true" size={14} strokeWidth={1.8} />No account gate</strong>
            </div>
          </div>
        </section>

        <LandingLower
          isCreating={isCreating}
          startRoom={({ name, source, starter }) => void openRoom(name, source, starter ?? selectedStarter)}
        />

      </main>
    </>
  );
}
