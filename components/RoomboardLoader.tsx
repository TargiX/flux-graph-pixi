"use client";

type RoomboardLoaderProps = {
  actionHref?: string;
  actionLabel?: string;
  detail?: string;
  message?: string;
  state?: "loading" | "error";
  tone?: "overlay" | "route";
};

export function RoomboardLoader({
  actionHref,
  actionLabel = "Back home",
  detail = "Preparing canvas, presence, and room state.",
  message = "Opening room",
  state = "loading",
  tone = "overlay",
}: RoomboardLoaderProps) {
  const isError = state === "error";

  return (
    <div className={`rb-loader rb-loader--${tone} ${isError ? "is-error" : ""}`} role={isError ? "alert" : "status"}>
      <div className="rb-loader__panel" aria-live={isError ? "assertive" : "polite"}>
        <div className="rb-loader__stage" aria-hidden="true">
          <div className="rb-loader__grid" />
          <svg className="rb-loader__edges" viewBox="0 0 220 154">
            <path d="M62 54 C94 34, 128 34, 158 56" />
            <path d="M60 95 C94 123, 132 120, 160 96" />
            <path d="M66 58 C76 80, 78 90, 62 104" />
          </svg>
          <div className="rb-loader__mark" aria-hidden="true">
            <span className="tile tile-a" />
            <span className="tile tile-b" />
            <span className="tile tile-c" />
            <span className="tile tile-d" />
          </div>
          <div className="rb-loader__card card-a">
            <span />
            Note
          </div>
          <div className="rb-loader__card card-b">
            <span />
            Image
          </div>
          <div className="rb-loader__cursor">
            <svg viewBox="0 0 16 18" aria-hidden="true">
              <path d="M2 1.5l11 7-5.5 1.5L5 16z" />
            </svg>
            <span>joining</span>
          </div>
        </div>
        <div className="rb-loader__copy">
          <div className="rb-loader__eyebrow">
            <span />
            {isError ? "Room unavailable" : "Realtime room"}
          </div>
          <h2>{message}</h2>
          <p>{detail}</p>
          {actionHref ? (
            <a className="rb-loader__action" href={actionHref}>
              {actionLabel}
            </a>
          ) : null}
        </div>
      </div>
    </div>
  );
}
