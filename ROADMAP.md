# Roomboard Roadmap

Roomboard is being shaped as a showcase-grade realtime collaboration product: a small, credible SaaS surface that demonstrates Next.js App Router, Pixi.js canvas engineering, Phoenix realtime infrastructure, Supabase persistence, and Vercel delivery.

The current product promise is intentionally narrow:

> Open a room, drop visual material, make notes, connect related cards, discuss details, and share or close the room when the decision is made.

This roadmap is the product and engineering control loop for the showcase. GitHub milestones and issues should mirror the sections below.

## Operating Model

- `ROADMAP.md` describes product direction, release criteria, and the next tranche of work.
- GitHub milestones define shippable slices.
- GitHub issues define implementation tasks with acceptance criteria.
- A task is done only when it is verified locally or against `https://roomboard.online`, and the verification is written in the issue or PR.
- Showcase work takes priority over broad SaaS work until the first milestone is complete.

## Milestone 1: Showcase v1 - reliable demo

Goal: an employer, collaborator, or investor can open `https://roomboard.online`, understand the product in under a minute, create or join a room, and see a believable realtime collaboration flow without hand-holding.

### Definition of Done

- The landing page communicates one clear use case: realtime visual review rooms.
- Creating a private room, joining by editor/viewer invite, and reopening recent rooms works reliably.
- Notes, uploaded images, comments, connectors, card dragging, room lock, and room close all work in the hosted demo.
- A two-browser or two-tab session shows live presence, cursor movement, and board updates with no confusing jumps or stale collaborator state.
- The room canvas feels production-grade: smooth drag, predictable zoom/pan, crisp cards, readable states, and polished empty/error states.
- The technical story is easy to explain: what Next.js owns, what Pixi.js owns, what Phoenix owns, how Supabase persists data, and how Vercel hosts the app.
- A production smoke checklist passes before sharing the project publicly.

### Workstreams

#### 1. Demo Reliability

Make the happy path boringly dependable:

- Create a room from the landing page and dashboard.
- Open an existing room from recent rooms.
- Add note cards and image cards.
- Upload local images and preserve their aspect ratio.
- Drag cards without visual snap-back.
- Connect cards with readable, non-distracting lines.
- Lock and close rooms with clear user feedback.
- Verify the same flow on `roomboard.online`.

#### 2. Realtime Collaboration Feel

Make the room feel live without becoming noisy:

- Keep user cursors on a separate screen-space overlay so pan/zoom does not drag remote pointers incorrectly.
- Keep presence labels stable, readable, and cheap to render.
- Ensure board mutations are broadcast through Phoenix when available and degrade cleanly to the Next fallback.
- Remove stale collaborators quickly after tab close, refresh, or network loss.
- Add a small scripted demo state for the landing hero so the product feels active before the user opens a room.

#### 3. Room Lifecycle and Permissions

Make invite-first rooms feel intentional rather than unfinished:

- Remember the visitor's local display name and color.
- Explain invite access, locked rooms, closed rooms, and view-only states in the UI.
- Preserve creator-only controls through the local owner token.
- Make destructive actions reversible where possible, or clearly final where not.
- Add concise empty states for new rooms, closed rooms, and failed joins.

#### 4. Canvas and UX Polish

Keep the product visually credible:

- Preserve the design system from the current dark board direction.
- Support light mode only when the full room surface is styled, not partially inverted.
- Keep cards crisp at high zoom and avoid accidental raster scaling where vector/text rendering should remain sharp.
- Tune zoom limits so close inspection is possible without breaking interaction.
- Keep inspector panels, toolbar controls, and card states visually consistent.

#### 5. Employer-Facing Story

Make the project easy to evaluate:

- Add a short architecture section that explains Next.js, Pixi.js, Phoenix, Supabase, and Vercel responsibilities.
- Document what Pixi.js does in the room canvas.
- Keep screenshots and the portfolio case study aligned with the current production UI.
- Maintain a release checklist so future demo pushes are not vibe-based.

## Milestone 2: SaaS-shaped MVP

This starts only after Showcase v1 is solid.

- Optional account system for personal room history.
- Organizations or small teams.
- Durable file management beyond demo uploads.
- Room templates for review workflows.
- Better permissions: owner, editor, viewer.
- Exportable decision recap and shareable read-only snapshots.
- Usage limits and cleanup policies.

## Milestone 3: Product Depth

Explore only if the project needs to grow beyond portfolio/demo value:

- Multiplayer selection and card editing conflicts.
- Version history and room activity search.
- Better asset management for moodboards and design references.
- Comment resolution states.
- Invite links with expiration.
- More expressive canvas tools without becoming a general whiteboard clone.

## Release Checklist

Before calling a Roomboard build showcase-ready:

### Automated checks

- `npm run typecheck`
- `npm run build`
- `npm run smoke` for the local app path after starting `npm run dev` or `npx next start -p 3050`.
- `npm run smoke:realtime` to launch Next + Phoenix, verify realtime fanout, then verify fallback after Phoenix stops. Requires the Elixir toolchain and `mix setup` in `realtime/roomboard_realtime/` first.
- `SMOKE_BASE_URL=https://roomboard.online npm run smoke` against the production showcase. This creates, mutates, uploads assets for, and closes a real smoke-test room; storage cleanup is a separate operator task.
- `curl -fsS https://<phoenix-host>/health` returns healthy for the deployed sidecar.
- `curl -fsS https://roomboard.online/api/health` returns `durableStorage: true` before inviting real users.
- Vercel and Phoenix/Render share the same `ROOMBOARD_REALTIME_SECRET`; production Phoenix joins without a signed room token are rejected.
- `/api/rooms` returns only the built-in demo room plus rooms owned by the current browser's owner tokens; newly created rooms are not globally discoverable.

### Manual production checks

- `https://roomboard.online` loads with the expected favicon and current landing UI.
- Create a room from the landing page or dashboard.
- Open the room URL in a second tab or browser and verify a bare link is blocked until an editor or viewer invite is used.
- Add a note card and an image card; verify both appear in the second session.
- Drag cards, connect two cards, edit a note, and add a comment.
- Verify the viewer invite can read but cannot mutate the board.
- Unlock only when deliberately testing link-access mode, make another board change, then close the room and verify both sessions show the closed state.
- Two-tab realtime presence, cursor movement, and board mutation flow are manually verified through Phoenix; if Phoenix is unavailable, the UI clearly indicates local fallback and board edits still sync.
- Any known demo caveats are documented in the active GitHub milestone.
