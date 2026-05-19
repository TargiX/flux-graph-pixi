# flux-graph-pixi

A WebGL node-graph editor built on [Pixi.js v8](https://pixijs.com) — a learning
project and prototype for replacing the Vue Flow / D3 graph editor in `nuxt-flux`
with a faster canvas-based renderer.

## Stack

- [Pixi.js v8](https://pixijs.com) — WebGL/Canvas 2D rendering
- [Vite](https://vite.dev) — dev server + bundler
- TypeScript

## Run

```bash
npm install
npm run dev      # http://localhost:5173
npm run typecheck
npm run build
```

## Learning roadmap

1. **Draggable nodes on a canvas** — Pixi `Application`, `Container`, `Graphics`, `Text`, the event system, drag interaction.
2. **Pan & zoom** — world vs. screen coordinates, a camera container.
3. **Ports & edges** — bezier connections between nodes that follow them.
4. **Selection & many nodes** — hit-testing, performance, culling.
5. **Port to nuxt-flux** — extract the renderer into a client-only component.

Built while learning Pixi.js with Claude Code.
