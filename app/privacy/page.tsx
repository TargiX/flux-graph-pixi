import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Privacy",
  description:
    "How Roomboard handles private rooms, invite links, local creator tokens, uploads, realtime presence, and analytics.",
};

const sections = [
  {
    title: "What Roomboard stores",
    body:
      "Roomboard stores the room document you create: room name, cards, comments, connector lines, review statuses, activity history, room access state, and uploaded image references. Hosted rooms use Supabase for durable room data and file storage.",
  },
  {
    title: "Private rooms and invite links",
    body:
      "New rooms are private and locked by default. Access is controlled by a creator token saved in the creator's browser and role-specific invite tokens for editors or viewers. Private rooms are not exposed as an open public directory.",
  },
  {
    title: "Local browser tokens",
    body:
      "Roomboard remembers creator and invite tokens in local browser storage so you can return to rooms without an account. Anyone with access to that browser profile may be able to reopen rooms remembered there, so use a trusted device for sensitive reviews.",
  },
  {
    title: "Uploads and visual material",
    body:
      "Image uploads are checked against room edit access before being accepted. Roomboard supports PNG, JPG, GIF, and WebP uploads up to the app limit and rejects SVG uploads. Uploaded files are intended for review context, not long-term archival storage.",
  },
  {
    title: "Realtime presence",
    body:
      "When you join a room, Roomboard may send your display name, color, cursor position, and recent activity state to other people in the same room so collaboration feels live. Presence is scoped to the room session.",
  },
  {
    title: "Analytics",
    body:
      "Roomboard uses Vercel Web Analytics and product events to understand the launch funnel: landing CTA clicks, room creation, first card creation, invite copying, and recap actions. These events avoid room names, invite tokens, owner tokens, and card content.",
  },
  {
    title: "Accounts and payments",
    body:
      "Roomboard's current product flow does not require an account to create or join a room. Experimental auth and billing code may exist in the repository for future technical work, but it is not required for the current room workflow.",
  },
  {
    title: "Contact",
    body:
      "For privacy questions or removal requests, contact the Roomboard operator through the project owner channels linked from the source repository.",
  },
];

export default function PrivacyPage() {
  return (
    <main className="lp-legal">
      <div className="lp-shell lp-legal__inner">
        <nav className="lp-legal__nav" aria-label="Privacy navigation">
          <a className="lp-nav__logo" href="/">
            <div className="mark" aria-hidden="true" />
            Roomboard
          </a>
          <a className="lp-nav__link" href="/">
            Back to product
          </a>
        </nav>

        <header className="lp-legal__hero">
          <div className="lp-hero__signal">Privacy</div>
          <h1>Roomboard privacy notes</h1>
          <p>
            Short version: rooms are private by default, access is token-based, and analytics avoids room content.
            This page explains the current hosted product behavior in plain language.
          </p>
          <span>Last updated: June 24, 2026</span>
        </header>

        <section className="lp-legal__grid" aria-label="Privacy details">
          {sections.map((section) => (
            <article className="lp-legal__section" key={section.title}>
              <h2>{section.title}</h2>
              <p>{section.body}</p>
            </article>
          ))}
        </section>
      </div>
    </main>
  );
}
