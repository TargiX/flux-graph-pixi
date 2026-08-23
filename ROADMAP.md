# Roomboard Roadmap

Roomboard is being shaped as a focused launch approval product: one private room for the real material, reviewer calls, and a decision record, backed by credible Next.js App Router, Pixi.js canvas, Phoenix realtime, Supabase persistence, and Vercel delivery.

The current product promise is intentionally narrow:

> Add the real launch material, invite the reviewer who can decide, resolve every card, and close with a decision record.

This roadmap is the product and engineering control loop for the showcase. GitHub milestones and issues should mirror the sections below.

## Operating Model

- `ROADMAP.md` describes product direction, release criteria, and the next tranche of work.
- GitHub milestones define shippable slices.
- GitHub issues define implementation tasks with acceptance criteria.
- A task is done only when it is verified locally or against `https://www.roomboard.online`, and the verification is written in the issue or PR.
- Showcase work takes priority over broad SaaS work until the first milestone is complete.

## Milestone 1: Showcase v1 - reliable product preview

Goal: an employer, collaborator, or early user can open `https://www.roomboard.online`, understand the product in under a minute, create or join a private room, and see a believable realtime collaboration flow without hand-holding.

### Definition of Done

- The landing page communicates one clear category: launch approval rooms.
- Creating a private room, joining by editor/viewer invite, and reopening recent rooms works reliably.
- Notes, uploaded images, comments, connectors, card dragging, room lock, and room close all work in the hosted product preview.
- A two-browser or two-tab session shows live presence, cursor movement, and board updates with no confusing jumps or stale collaborator state.
- The room canvas feels production-grade: smooth drag, predictable zoom/pan, crisp cards, readable states, and polished empty/error states.
- The technical story is easy to explain: what Next.js owns, what Pixi.js owns, what Phoenix owns, how Supabase persists data, and how Vercel hosts the app.
- A production smoke checklist passes before sharing the project publicly.

### Workstreams

#### 1. Room Reliability

Make the happy path boringly dependable:

- Create a room from the landing page and dashboard.
- Open an existing room from recent rooms.
- Add note cards and image cards.
- Upload local images and preserve their aspect ratio.
- Drag cards without visual snap-back.
- Connect cards with readable, non-distracting lines.
- Lock and close rooms with clear user feedback.
- Verify the same flow on `www.roomboard.online`.

#### 2. Realtime Collaboration Feel

Make the room feel live without becoming noisy:

- Keep user cursors on a separate screen-space overlay so pan/zoom does not drag remote pointers incorrectly.
- Keep presence labels stable, readable, and cheap to render.
- Ensure board mutations are broadcast through Phoenix when available and degrade cleanly to the Next fallback.
- Remove stale collaborators quickly after tab close, refresh, or network loss.
- Keep a small sample state for the landing hero so the product feels active before the user opens a room.

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
- Maintain a release checklist so future product pushes are not vibe-based.

## Milestone 2: SaaS-shaped MVP

This starts only after Showcase v1 is solid.

- Optional account system for personal room history.
- Organizations or small teams.
- Proxied private file delivery or shorter-lived signed asset rotation for stricter file controls.
- Room templates for review workflows.
- Better permissions: owner, editor, viewer.
- Exportable decision recap and shareable read-only snapshots.
- Account/workspace usage limits and automatic retention policies. Private-beta rooms already enforce document capacities, bounded JSON mutations, and owner-controlled permanent deletion of room data and hosted uploads.

## Milestone 3: Product Depth

Explore only if the project needs to grow beyond portfolio and first-user value:

- Multiplayer selection and card editing conflicts.
- Version history and room activity search.
- Better asset management for moodboards and design references.
- Comment resolution states.
- Invite links with expiration.
- More expressive canvas tools without becoming a general whiteboard clone.

## Release Checklist

Before calling a Roomboard build showcase-ready:

Use `LAUNCH.md` for campaign positioning, first-user entry URLs, and the do-not-launch checks.

### Automated checks

- `pnpm typecheck`
- `pnpm test`
- `pnpm build`
- `pnpm verify` as the standard local pre-release bundle.
- `pnpm readiness:local` after starting `pnpm dev` or `pnpm start -p 3050`; this checks the public launch surface, sample room, privacy/billing indexing, private room defaults, invite access, owner controls, upload gating, and legacy API shutdown.
- `pnpm release:local` after starting `pnpm dev` or `pnpm start -p 3050`; this runs `pnpm verify`, `pnpm readiness:local`, and `git diff --check`.
- `pnpm readiness:prod` after deployment and before inviting first users or sending paid traffic.
- `pnpm realtime:prod` to verify the live Next `/api/health` realtime checks and the configured Phoenix sidecar `/health` endpoint agree before traffic.
- `pnpm smoke` for the local app path after starting `pnpm dev` or `pnpm start -p 3050`.
- `pnpm smoke:realtime` to launch Next + Phoenix, verify realtime fanout, then verify fallback after Phoenix stops. Requires the Elixir toolchain and `mix setup` in `realtime/roomboard_realtime/` first.
- `SMOKE_BASE_URL=https://www.roomboard.online pnpm smoke` against the production showcase. This creates, mutates, and uploads assets for a real smoke-test room, then permanently deletes its room document and hosted uploads.
- `curl -fsS https://<phoenix-host>/health` returns healthy for the deployed sidecar.
- `curl -fsS https://www.roomboard.online/api/health` returns `launchReady: true` before inviting real users; failed `launch.checks` include the concrete remediation.
- Vercel and Phoenix/Render share the same `ROOMBOARD_REALTIME_SECRET`; production Phoenix joins without a signed room token are rejected.
- `/api/rooms` returns only rooms owned by the current browser's owner tokens or remembered invite tokens; newly created rooms are not globally discoverable. The sample room is available only through its explicit room URL.
- Upload privacy is stated accurately: hosted uploads are editor-gated before creation, stored in a private bucket, and exposed through signed asset URLs for authorized room snapshots.

### Manual production checks

- `https://www.roomboard.online` loads with the expected favicon and current landing UI.
- Create a room from the landing page or dashboard.
- Open the room URL in a second tab or browser and verify a bare link is blocked until an editor or viewer invite is used.
- Add a note card and an image card; verify both appear in the second session.
- Drag cards, connect two cards, edit a note, and add a comment.
- Verify the viewer invite can read but cannot mutate the board.
- Unlock only when deliberately testing link-access mode, make another board change, then close the room and verify both sessions show the closed state.
- Two-tab realtime presence, cursor movement, and board mutation flow are manually verified through Phoenix; if Phoenix is unavailable, the UI clearly indicates local fallback and board edits still sync.
- Any known launch caveats are documented in the active GitHub milestone.
