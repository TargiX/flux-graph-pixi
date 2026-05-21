"use client";

import { FormEvent, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { 
  Archive,
  ArrowRight, 
  Clock3, 
  Copy, 
  Check,
  LayoutGrid, 
  LockKeyhole,
  PanelsTopLeft, 
  Plus, 
  UsersRound,
  ExternalLink,
  Sparkles,
  Link2,
  FolderOpen,
  UnlockKeyhole
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import type { RoomSummary } from "@/lib/canvasRoom";

type RoomsDashboardProps = {
  initialRooms: RoomSummary[];
};

function readOwnerTokens() {
  const defaultTokens: Record<string, string> = { "pitch-deck-review": "demo-owner" };

  if (typeof window === "undefined") {
    return defaultTokens;
  }

  try {
    return {
      ...defaultTokens,
      ...(JSON.parse(localStorage.getItem("roomboard-owner-tokens") ?? "{}") as Record<string, string>),
    };
  } catch {
    return defaultTokens;
  }
}

function writeOwnerToken(roomId: string, ownerToken: string) {
  const tokens = readOwnerTokens();
  tokens[roomId] = ownerToken;
  localStorage.setItem("roomboard-owner-tokens", JSON.stringify(tokens));
  return tokens;
}

function formatRelativeTime(timestamp: number) {
  const diff = Date.now() - timestamp;
  const minutes = Math.max(1, Math.round(diff / 60000));

  if (minutes < 60) {
    return `${minutes}m ago`;
  }

  const hours = Math.round(minutes / 60);

  if (hours < 24) {
    return `${hours}h ago`;
  }

  return `${Math.round(hours / 24)}d ago`;
}

export function RoomsDashboard({ initialRooms }: RoomsDashboardProps) {
  const router = useRouter();
  const [rooms, setRooms] = useState(initialRooms);
  const [ownerTokens, setOwnerTokens] = useState<Record<string, string>>({});
  const [name, setName] = useState("Design review");
  const [copiedId, setCopiedId] = useState("");
  const [closingId, setClosingId] = useState("");
  const [isCreating, setIsCreating] = useState(false);

  useEffect(() => {
    setOwnerTokens(readOwnerTokens());
  }, []);

  const createRoom = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setIsCreating(true);

    try {
      const response = await fetch("/api/rooms", {
        body: JSON.stringify({ name }),
        headers: { "Content-Type": "application/json" },
        method: "POST",
      });
      const data = (await response.json()) as { ownerToken?: string; room?: RoomSummary };

      if (data.room && data.ownerToken) {
        setOwnerTokens(writeOwnerToken(data.room.id, data.ownerToken));
        setRooms((current) => [data.room!, ...current]);
        router.push(`/rooms/${data.room.id}`);
      }
    } finally {
      setIsCreating(false);
    }
  };

  const copyInvite = async (roomId: string) => {
    const url = `${window.location.origin}/rooms/${roomId}`;
    await navigator.clipboard.writeText(url);
    setCopiedId(roomId);
    window.setTimeout(() => setCopiedId(""), 1400);
  };

  const closeRoom = async (roomId: string) => {
    setClosingId(roomId);

    try {
      const response = await fetch(`/api/rooms/${roomId}`, {
        headers: { "X-Room-Owner-Token": ownerTokens[roomId] ?? "" },
        method: "DELETE",
      });

      if (response.ok) {
        setRooms((current) => current.filter((room) => room.id !== roomId));
      }
    } finally {
      setClosingId("");
    }
  };

  const toggleRoomAccess = async (room: RoomSummary) => {
    const ownerToken = ownerTokens[room.id];

    if (!ownerToken) {
      return;
    }

    const nextAccess = room.access === "locked" ? "link" : "locked";
    const response = await fetch(`/api/rooms/${room.id}`, {
      body: JSON.stringify({ action: "access", access: nextAccess }),
      headers: { "Content-Type": "application/json", "X-Room-Owner-Token": ownerToken },
      method: "PATCH",
    });
    const data = (await response.json()) as { room?: RoomSummary };

    if (response.ok && data.room) {
      setRooms((current) => current.map((currentRoom) => (currentRoom.id === room.id ? data.room! : currentRoom)));
    }
  };

  return (
    <main className="dashboard-shell">
      <header className="dashboard-header">
        <a className="brand" href="/">
          <div className="brand-icon-bg">
            <LayoutGrid size={18} className="brand-logo" aria-hidden="true" />
          </div>
          <span>Roomboard</span>
        </a>
        <Badge variant="outline" className="dashboard-badge">
          <UsersRound size={13} aria-hidden="true" />
          <span>Anyone with link can join</span>
        </Badge>
      </header>

      <section className="dashboard-hero">
        <div className="hero-content">
          <div className="hero-kicker-wrapper">
            <Sparkles size={12} className="kicker-sparkle" aria-hidden="true" />
            <p className="dashboard-kicker">Realtime visual rooms</p>
          </div>
          
          <h1>Start a shared board, invite people, and work in the same space.</h1>
          
          <p className="hero-description">
            Create an instant canvas for sticky notes, image layout reviews, and mind mapping. 
            Rooms are link-join by default, and creators can lock or close them when the work is done.
          </p>

          <Card className="create-room-card ui-card">
            <CardHeader>
              <CardTitle>Launch a new room</CardTitle>
              <CardDescription>Name your board to get a secure shared room URL.</CardDescription>
            </CardHeader>
            <CardContent>
              <form className="create-room-form" onSubmit={createRoom}>
                <div className="input-wrapper">
                  <input
                    aria-label="Room name"
                    onChange={(event) => setName(event.target.value)}
                    placeholder="e.g. Sprint kickoff, Website review"
                    value={name}
                  />
                </div>
                <Button disabled={isCreating || name.trim().length === 0} type="submit" className="create-room-submit">
                  <span>{isCreating ? "Initializing..." : "Create workspace"}</span>
                  <ArrowRight size={15} aria-hidden="true" />
                </Button>
              </form>
            </CardContent>
          </Card>
        </div>

        <div className="hero-preview-container">
          <div className="preview-mesh-overlay"></div>
          <svg viewBox="0 0 540 380" className="canvas-preview-mockup" aria-hidden="true">
            {/* Grid Pattern */}
            <defs>
              <pattern id="preview-grid" width="24" height="24" patternUnits="userSpaceOnUse">
                <path d="M 24 0 L 0 0 0 24" fill="none" stroke="rgba(255, 255, 255, 0.025)" strokeWidth="1"/>
              </pattern>
            </defs>
            <rect width="100%" height="100%" fill="url(#preview-grid)" />

            {/* Glowing lines connections */}
            <path d="M 170 170 C 240 170, 240 110, 330 110" fill="none" stroke="rgba(99, 102, 241, 0.4)" strokeWidth="2" strokeDasharray="4,4" />
            <path d="M 330 135 C 330 190, 240 200, 240 260" fill="none" stroke="rgba(14, 165, 233, 0.4)" strokeWidth="2" />
            
            {/* Arrowheads */}
            <polygon points="325,110 330,110 327,115" fill="rgba(99, 102, 241, 0.8)" transform="rotate(45 330 110)" />
            <polygon points="240,255 240,260 245,257" fill="rgba(14, 165, 233, 0.8)" transform="rotate(90 240 260)" />

            {/* Canvas Card 1 - Yellow Sticky Note */}
            <g className="preview-card mockup-card-1">
              <rect x="30" y="110" width="160" height="110" rx="10" fill="#0f111a" stroke="rgba(250, 204, 92, 0.3)" strokeWidth="1.5" />
              <rect x="30" y="110" width="160" height="18" rx="10" fill="#facc5c" clipPath="inset(0 0 8px 0)" />
              <text x="42" y="145" fill="#f3f4f6" fontSize="11" fontWeight="700">Project Kickoff</text>
              <text x="42" y="165" fill="#8e95a5" fontSize="9">Determine core MVP items.</text>
              <text x="42" y="180" fill="#8e95a5" fontSize="9">Establish real-time presence.</text>
              <rect x="42" y="195" width="40" height="12" rx="4" fill="rgba(250, 204, 92, 0.12)" />
              <text x="46" y="204" fill="#facc5c" fontSize="7" fontWeight="700">HIGH PRIO</text>
            </g>

            {/* Canvas Card 2 - Blue Image Card */}
            <g className="preview-card mockup-card-2">
              <rect x="310" y="50" width="180" height="135" rx="10" fill="#0f111a" stroke="rgba(72, 167, 255, 0.3)" strokeWidth="1.5" />
              <rect x="310" y="50" width="180" height="18" rx="10" fill="#48a7ff" clipPath="inset(0 0 8px 0)" />
              <text x="322" y="85" fill="#f3f4f6" fontSize="11" fontWeight="700">Design Moodboard</text>
              {/* Wireframe Mock Graphics */}
              <rect x="322" y="100" width="156" height="52" rx="6" fill="rgba(255, 255, 255, 0.03)" stroke="rgba(255, 255, 255, 0.08)" strokeWidth="1" />
              <circle cx="340" cy="126" r="14" fill="rgba(72, 167, 255, 0.1)" stroke="rgba(72, 167, 255, 0.2)" />
              <line x1="365" y1="120" x2="445" y2="120" stroke="rgba(255, 255, 255, 0.15)" strokeWidth="3" strokeLinecap="round" />
              <line x1="365" y1="130" x2="415" y2="130" stroke="rgba(255, 255, 255, 0.1)" strokeWidth="3" strokeLinecap="round" />
              {/* Link Badge */}
              <rect x="420" y="158" width="58" height="15" rx="4" fill="rgba(14, 165, 233, 0.1)" stroke="rgba(14, 165, 233, 0.2)" />
              <text x="424" y="168" fill="#0ea5e9" fontSize="7" fontWeight="700">unsplash.com</text>
            </g>

            {/* Canvas Card 3 - Emerald Note */}
            <g className="preview-card mockup-card-3">
              <rect x="150" y="240" width="170" height="95" rx="10" fill="#0f111a" stroke="rgba(16, 185, 129, 0.3)" strokeWidth="1.5" />
              <rect x="150" y="240" width="170" height="18" rx="10" fill="#10b981" clipPath="inset(0 0 8px 0)" />
              <text x="162" y="275" fill="#f3f4f6" fontSize="11" fontWeight="700">Open Questions</text>
              <text x="162" y="295" fill="#8e95a5" fontSize="9">How does scaling behave with</text>
              <text x="162" y="310" fill="#8e95a5" fontSize="9">large image uploads?</text>
            </g>

            {/* Collaborator Cursors */}
            <g className="mockup-cursor cursor-pink">
              <polygon points="0,0 4,13 8,11 13,16 15,14 10,9 14,8" fill="#f43f5e" transform="translate(140 180)" />
              <rect x="150" y="190" width="34" height="14" rx="4" fill="#f43f5e" />
              <text x="154" y="200" fill="#ffffff" fontSize="8" fontWeight="700">Sarah</text>
            </g>

            <g className="mockup-cursor cursor-purple">
              <polygon points="0,0 4,13 8,11 13,16 15,14 10,9 14,8" fill="#6366f1" transform="translate(390 120)" />
              <rect x="400" y="130" width="30" height="14" rx="4" fill="#6366f1" />
              <text x="404" y="140" fill="#ffffff" fontSize="8" fontWeight="700">Alex</text>
            </g>
          </svg>
        </div>
      </section>

      <section className="dashboard-features">
        <div className="section-title-wrap">
          <p className="features-kicker">Built for visual thinkers</p>
          <h2>A lightweight workspace designed to feel fast</h2>
        </div>
        <div className="features-grid">
          <div className="feature-card">
            <div className="feature-icon-wrapper blue">
              <PanelsTopLeft size={20} aria-hidden="true" />
            </div>
            <h3>Infinite Canvas</h3>
            <p>Brainstorm without limits. Post notes, organize wireframes, and build spatial layouts on a smooth zoomable board.</p>
          </div>
          <div className="feature-card">
            <div className="feature-icon-wrapper indigo">
              <UsersRound size={20} aria-hidden="true" />
            </div>
            <h3>Realtime Presence</h3>
            <p>Work together live. Share your board's unique link to instantly see collaborators' cursors, updates, and selections.</p>
          </div>
          <div className="feature-card">
            <div className="feature-icon-wrapper emerald">
              <Link2 size={20} aria-hidden="true" />
            </div>
            <h3>Linked Connections</h3>
            <p>Create visual architecture. Draw direct connector lines between cards to map user flows, hierarchies, and processes.</p>
          </div>
        </div>
      </section>

      <section className="rooms-section">
        <div className="section-heading">
          <h2>Active workspaces</h2>
          <span className="rooms-total-badge">{rooms.length} total</span>
        </div>

        {rooms.length === 0 ? (
          <div className="empty-rooms-state">
            <div className="empty-state-icon">
              <FolderOpen size={32} className="empty-icon" aria-hidden="true" />
            </div>
            <h3>No active rooms found</h3>
            <p>Workspaces you create will appear here. Launch a new room above to start.</p>
          </div>
        ) : (
          <div className="rooms-grid">
            {rooms.map((room) => (
              <div 
                className="room-card ui-card" 
                key={room.id}
              >
                <div className="room-card-inner">
                  <div className="room-card-topline">
                    <Badge variant="secondary" className="room-card-objects-badge">
                      {room.itemCount} {room.itemCount === 1 ? "object" : "objects"}
                    </Badge>
                    <Badge variant="outline" className="room-card-access-badge">
                      {room.access === "locked" ? (
                        <LockKeyhole size={11} aria-hidden="true" />
                      ) : (
                        <UnlockKeyhole size={11} aria-hidden="true" />
                      )}
                      <span>{room.access === "locked" ? "Locked" : "Link access"}</span>
                    </Badge>
                    <span className="room-card-time">
                      <Clock3 size={12} aria-hidden="true" />
                      <span>{formatRelativeTime(room.updatedAt)}</span>
                    </span>
                  </div>
                  
                  <h3 className="room-card-title">{room.name}</h3>
                  <p className="room-card-connections-info">
                    <Link2 size={12} aria-hidden="true" />
                    <span>{room.connectionCount} connections</span>
                  </p>

                  <div className="room-card-footer-actions">
                    <a className="room-card-open-link" href={`/rooms/${room.id}`}>
                      <span>Open board</span>
                      <ExternalLink size={13} className="arrow-icon" aria-hidden="true" />
                    </a>
                    <Button 
                      onClick={(e) => {
                        e.stopPropagation();
                        void copyInvite(room.id);
                      }} 
                      type="button" 
                      variant="secondary"
                      className="room-card-copy-btn"
                    >
                      {copiedId === room.id ? (
                        <>
                          <Check size={13} aria-hidden="true" className="success-icon" />
                          <span>Copied</span>
                        </>
                      ) : (
                        <>
                          <Copy size={12} aria-hidden="true" />
                          <span>Copy link</span>
                        </>
                      )}
                    </Button>
                    {ownerTokens[room.id] && (
                      <>
                        <Button
                          onClick={(e) => {
                            e.stopPropagation();
                            void toggleRoomAccess(room);
                          }}
                          type="button"
                          variant="secondary"
                          className="room-card-copy-btn"
                        >
                          {room.access === "locked" ? (
                            <UnlockKeyhole size={12} aria-hidden="true" />
                          ) : (
                            <LockKeyhole size={12} aria-hidden="true" />
                          )}
                          <span>{room.access === "locked" ? "Unlock" : "Lock"}</span>
                        </Button>
                        <Button
                          disabled={closingId === room.id}
                          onClick={(e) => {
                            e.stopPropagation();
                            void closeRoom(room.id);
                          }}
                          type="button"
                          variant="outline"
                          className="room-card-copy-btn"
                        >
                          <Archive size={12} aria-hidden="true" />
                          <span>{closingId === room.id ? "Closing" : "Close"}</span>
                        </Button>
                      </>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>
    </main>
  );
}
