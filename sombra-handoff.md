# Session 2 Handoff — sombra

## What Happened in Session 1

We designed and scaffolded **sombra**, a browser-based node-based WebGL shader builder. Starting from the spectra-pixel-bg codebase (a generative pixel background for spendolas.com), we made all the key architectural decisions, wrote a full 5-phase roadmap, and scaffolded the project.

**Repo:** `spendolas/sombra` (GitHub)
**What's pushed to `main`:** A working Vite + React 19 + TypeScript + React Flow + Zustand + Tailwind CSS v4 scaffold. It builds, lints, and renders an empty React Flow canvas with dark theme. One commit: `"Initial scaffold: Vite + React + TypeScript + React Flow + Tailwind"`.

**What exists in the repo:**
- `CLAUDE.md` — project overview, tech stack, conventions, architecture decisions
- `ROADMAP.md` — full 5-phase development plan (281 lines, very detailed)
- `package.json` — all dependencies installed and locked
- `src/App.tsx` — empty React Flow canvas (Background, Controls, MiniMap)
- `src/main.tsx` — React entry point
- `src/index.css` — Tailwind import + dark base styles (`#0a0a12`)
- Config files: `vite.config.ts`, `tsconfig.json`, `tsconfig.app.json`, `tsconfig.node.json`, `eslint.config.js`

**Read CLAUDE.md and ROADMAP.md first** — they contain the full architectural context.

---

## Current Phase: 0 (Partially Complete)

### Phase 0 — Done
- [x] Vite + React + TypeScript scaffold
- [x] React Flow installed with empty canvas (pan/zoom works)
- [x] Zustand installed (no stores created yet)
- [x] Tailwind CSS v4 configured
- [x] Build pipeline works (`npm run build` → `dist/`)
- [x] `base: '/sombra/'` set for GitHub Pages

### Phase 0 — Remaining
- [ ] **Fullscreen WebGL quad renderer** — a raw WebGL2 canvas that renders a simple passthrough fragment shader (solid color or gradient). This proves the WebGL pipeline works before connecting it to the node graph. Should render beside or behind the React Flow canvas.
- [ ] **Basic layout shell** — match the planned layout: node canvas (center), space for future properties panel (right), space for future node palette (left). Just placeholder panels for now.
- [ ] **GitHub Pages deploy** — either a GitHub Actions workflow or manual deploy script that pushes `dist/` to `gh-pages` branch
- [ ] Figma design work (separate from code — wireframes, design tokens, node visual language)

### Phase 0 Milestone
A blank React Flow canvas you can pan around, with a colored fullscreen WebGL quad rendering beside it. Deploys to GitHub Pages.

---

## Phase 1 — Core Editor MVP (The Big One)

This is the "it works" moment. After this phase, users can wire nodes together and see a live shader.

### Node System Architecture
```typescript
interface NodeDefinition {
  type: string              // e.g. "simplex_noise"
  label: string             // e.g. "Simplex Noise"
  category: string          // e.g. "Noise"
  inputs: PortDefinition[]  // typed input ports
  outputs: PortDefinition[] // typed output ports
  defaults: Record<string, any>
  glsl: (inputs, outputs, params) => string  // GLSL code generator
  ui?: React.ComponentType  // optional custom node body
}

// Port types: float, vec2, vec3, vec4, color, sampler2D
// Auto-coercion: float→vec3 broadcasts, vec4→vec3 drops alpha, etc.
```

### Starter Node Library (~15 nodes)
| Category | Nodes |
|---|---|
| **Input** | UV Coordinates, Time, Resolution, Float Constant, Vec2 Constant, Color Picker |
| **Math** | Add, Multiply, Mix (lerp), Smoothstep, Sin/Cos, Remap |
| **Noise** | Simple Noise (value), Simplex Noise |
| **Color** | HSV↔RGB, Brightness/Contrast |
| **Output** | Fragment Output (master node — always exactly one) |

### Graph-to-GLSL Compiler
1. Topological sort from Fragment Output backward
2. Each node emits GLSL with unique variable names (`node_<id>_out`)
3. Unconnected inputs → default values
4. Auto type conversion at mismatched connections
5. Assemble complete fragment shader (uniforms + main + snippets)
6. Built-in uniforms: `u_time`, `u_resolution`, `u_mouse`
7. Error handling: parse WebGL shader log, map errors to offending nodes

### Live Preview
- Fullscreen quad renders compiled fragment shader
- Hot-recompile on every graph change (debounced ~100ms)
- Per-node mini-preview via single offscreen WebGL context (captures to `<img>`)
- Split view (editor + preview) and fullscreen preview toggle

### Phase 1 Milestone
Drag UV Coords → Noise → Mix → Fragment Output, tweak parameters, see live animated noise fullscreen.

---

## Later Phases (Summary)

### Phase 2 — Save/Load/Export
- localStorage auto-save, JSON download/upload, schema versioning
- Copy GLSL, embed HTML snippet, `/embed.html?material=<base64>` shareable URLs

### Phase 3 — Node Library Expansion (~40 nodes)
- Noise (Worley, FBM, Turbulence, Ridged, Box), Patterns (Checkerboard, Stripes, Dots, Voronoi), Distortion (Domain Warp, Rotate/Scale/Offset UV, Polar), more Math/Vector/Color nodes
- Subgraphs (group nodes → reusable compound nodes)
- Custom GLSL Node (paste arbitrary GLSL)
- Shadertoy/GLSL Sandbox import adapters
- Cmd+K node search palette, undo/redo, keyboard shortcuts

### Phase 4 — Polish & Performance
- Final Figma designs, dark/light themes, responsive layout
- Lazy compilation, FPS throttling, React Flow virtualization
- "Spectra Mode" (reproduce spectra-pixel-bg presets as node graphs)
- Example materials library, onboarding flow

### Phase 5 — Future (documented triggers, not planned)
- Backend + shareable URLs → Vercel + Supabase
- Public gallery, texture uploads, 3D preview, collaboration, WebGPU, MaterialX

---

## Key Architecture Decisions (Already Resolved)

| Decision | Choice | Why |
|---|---|---|
| Repo | Separate from spectra-pixel-bg | Different tech stack, purpose, deploy |
| GLSL target | GLSL ES 3.0 / WebGL2 | Cleaner syntax, 97%+ browser support |
| Node previews | Single offscreen WebGL renderer | Avoids context limits (8-16), captures to `<img>` |
| Styling | Tailwind CSS v4 | Utility-first, fast Figma→code, fully flexible |
| State | Zustand | Lightweight, natural React Flow pairing |
| No Three.js | Raw WebGL fullscreen quad | Output is always a fragment shader on 2 triangles |
| No backend | localStorage + JSON files | Static site, no server needed until Phase 5 triggers |
| Domain | `spendolas.github.io/sombra` | Custom domain later when worth branding |

## Project Conventions

- All source in `src/`, TypeScript strict mode
- Tailwind utility classes (no per-component CSS)
- Zustand stores in `src/stores/`
- Node type definitions in `src/nodes/`
- Shader compiler in `src/compiler/`
- `npm run dev` / `npm run build` / `npm run lint`

## Relationship to spectra-pixel-bg

spectra-pixel-bg continues to power spendolas.com unchanged. Once sombra can reproduce all 4 spectra presets as node graphs, those become built-in example materials. Eventually spendolas.com could embed a sombra-built material.

---

## What to Do Next

1. **Read `CLAUDE.md` and `ROADMAP.md`** in the repo for full context
2. **Finish Phase 0** — WebGL quad renderer, layout shell, deploy pipeline
3. **Start Phase 1** — this is the core: node system, compiler, live preview
4. Design work happens in Figma separately — code should follow the planned layout (canvas center, properties right, palette left, toolbar top, preview bottom/split)
