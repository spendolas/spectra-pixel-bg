# Sombra — Project Brief

## What Is Sombra

**Sombra** is a browser-based, node-based WebGL shader builder. Users wire visual nodes together on a canvas to create fragment shaders, with a live fullscreen preview updating in real time. Think Shadertoy meets Blender's shader nodes, in the browser.

**Repo:** `spendolas/sombra` (GitHub — create this repo before starting)
**Deploy target:** `spendolas.github.io/sombra` via GitHub Pages
**Starting point:** Nothing exists yet. Build from zero.

---

## Tech Stack (All Decisions Final)

| Layer | Choice | Why |
|---|---|---|
| Build | **Vite** | Fast dev, good TS/React support |
| UI framework | **React 19 + TypeScript** (strict mode) | Industry standard, strong typing |
| Node canvas | **@xyflow/react** (React Flow v12) | Purpose-built node editor, handles pan/zoom/wiring |
| State | **Zustand** | Lightweight, pairs naturally with React Flow |
| Styling | **Tailwind CSS v4** | Utility-first, fast iteration, fully flexible |
| WebGL | **Raw WebGL2** (no Three.js) | Output is always a fragment shader on a fullscreen quad — Three.js is overkill |
| GLSL target | **GLSL ES 3.0** | Cleaner syntax, 97%+ browser support |
| Backend | **None** | localStorage + JSON file export. Static site only |
| Deploy | **GitHub Pages** | Free, simple, `base: '/sombra/'` in Vite config |

---

## Architecture Decisions

| Decision | Choice | Reasoning |
|---|---|---|
| Separate repo from spectra-pixel-bg | Yes | Different tech stack, purpose, and deploy target |
| Node previews | Single offscreen WebGL context, capture to `<img>` | Avoids hitting browser WebGL context limits (8-16) |
| No Three.js | Raw WebGL fullscreen quad | All output is 2D fragment shaders on 2 triangles |
| No backend until Phase 5 | localStorage + JSON | Static site keeps things simple; server only when sharing/gallery features demand it |
| Domain | `spendolas.github.io/sombra` | Custom domain later when branding warrants it |

---

## Project Conventions

```
src/
  components/        — React components (canvas, panels, toolbar)
  nodes/             — Node type definitions (one file per category or per node)
  compiler/          — Graph-to-GLSL compiler
  stores/            — Zustand stores
  webgl/             — WebGL renderer (fullscreen quad, offscreen preview)
  App.tsx            — Root layout
  main.tsx           — Entry point
  index.css          — Tailwind imports + dark base styles
```

- TypeScript strict mode everywhere
- Tailwind utility classes only (no per-component CSS files)
- All source in `src/`
- `npm run dev` / `npm run build` / `npm run lint`

---

## Roadmap

### Phase 0 — Scaffold & Proof of Concept

**Goal:** An empty React Flow canvas you can pan around, with a colored fullscreen WebGL quad rendering beside it. Deploys to GitHub Pages.

- [ ] Vite + React + TypeScript scaffold
- [ ] Install and configure: `@xyflow/react`, `zustand`, `tailwindcss`
- [ ] `vite.config.ts` with `base: '/sombra/'`
- [ ] Basic `App.tsx` with React Flow canvas (Background, Controls, MiniMap)
- [ ] Dark theme base styles (`#0a0a12` background)
- [ ] **Fullscreen WebGL quad renderer** — a raw WebGL2 canvas that renders a simple passthrough fragment shader (solid color or gradient). Proves the WebGL pipeline works before connecting it to the node graph. Renders beside or behind the React Flow canvas.
- [ ] **Layout shell** — node canvas (center), placeholder for properties panel (right), placeholder for node palette (left)
- [ ] **GitHub Pages deploy** — GitHub Actions workflow that builds and pushes `dist/` to `gh-pages` branch
- [ ] Write `CLAUDE.md` (project instructions for future sessions)
- [ ] Write `ROADMAP.md` (this roadmap, standalone file in the repo)
- [ ] Git init, initial commit, push to `spendolas/sombra`

**Milestone:** Pan around an empty canvas. A colored WebGL quad renders. Site is live at `spendolas.github.io/sombra`.

---

### Phase 1 — Core Editor MVP

**Goal:** Drag UV Coords -> Noise -> Mix -> Fragment Output, tweak parameters, see live animated noise fullscreen. This is the "it works" moment.

#### Node System Architecture

```typescript
interface NodeDefinition {
  type: string;              // e.g. "simplex_noise"
  label: string;             // e.g. "Simplex Noise"
  category: string;          // e.g. "Noise"
  inputs: PortDefinition[];  // typed input ports
  outputs: PortDefinition[]; // typed output ports
  defaults: Record<string, any>;
  glsl: (inputs, outputs, params) => string;  // GLSL code generator
  ui?: React.ComponentType;  // optional custom node body
}

// Port types: float, vec2, vec3, vec4, color, sampler2D
// Auto-coercion: float -> vec3 broadcasts, vec4 -> vec3 drops alpha, etc.
```

#### Starter Node Library (~15 nodes)

| Category | Nodes |
|---|---|
| **Input** | UV Coordinates, Time, Resolution, Float Constant, Vec2 Constant, Color Picker |
| **Math** | Add, Multiply, Mix (lerp), Smoothstep, Sin/Cos, Remap |
| **Noise** | Simple Noise (value), Simplex Noise |
| **Color** | HSV to RGB, Brightness/Contrast |
| **Output** | Fragment Output (master node — always exactly one) |

#### Graph-to-GLSL Compiler

1. Topological sort from Fragment Output backward
2. Each node emits GLSL with unique variable names (`node_<id>_out`)
3. Unconnected inputs use default values
4. Auto type conversion at mismatched connections
5. Assemble complete fragment shader: uniforms + main() + node snippets
6. Built-in uniforms: `u_time`, `u_resolution`, `u_mouse`
7. Error handling: parse WebGL shader compile log, map errors back to offending nodes

#### Live Preview

- Fullscreen quad renders the compiled fragment shader
- Hot-recompile on every graph change (debounced ~100ms)
- Per-node mini-preview via single offscreen WebGL context (captures to `<img>`)
- Split view (editor + preview) and fullscreen preview toggle

**Milestone:** Wire nodes together, tweak parameters with inline controls, see live animated output.

---

### Phase 2 — Save/Load/Export

- localStorage auto-save with schema versioning
- JSON download/upload for sharing graph files
- "Copy GLSL" button — exports the compiled fragment shader
- Embed HTML snippet generator
- `/embed.html?material=<base64>` shareable URLs (still static, no backend)

**Milestone:** Save your work, share a link, copy the shader code.

---

### Phase 3 — Node Library Expansion (~40 nodes)

- **Noise:** Worley, FBM, Turbulence, Ridged, Box
- **Patterns:** Checkerboard, Stripes, Dots, Voronoi
- **Distortion:** Domain Warp, Rotate/Scale/Offset UV, Polar Coordinates
- **More Math/Vector/Color nodes** as needed
- **Subgraphs:** Group nodes into reusable compound nodes
- **Custom GLSL Node:** Paste arbitrary GLSL with user-defined ports
- **Shadertoy/GLSL Sandbox import adapters**
- Cmd+K node search palette
- Undo/redo, keyboard shortcuts

**Milestone:** Rich enough node library to recreate complex shaders entirely in the editor.

---

### Phase 4 — Polish & Performance

- Final visual design (Figma-driven), dark/light themes, responsive layout
- Lazy compilation, FPS throttling, React Flow virtualization for large graphs
- **"Spectra Mode"** — reproduce all 4 spectra-pixel-bg presets as node graphs (these become built-in example materials)
- Example materials library, onboarding flow / tutorial

**Milestone:** Polished, performant, with built-in examples that showcase what's possible.

---

### Phase 5 — Future (Trigger-Based, Not Scheduled)

These happen when specific conditions are met, not on a timeline:

- Backend + shareable URLs (trigger: user demand) — Vercel + Supabase
- Public gallery (trigger: enough users creating materials)
- Texture/image uploads as sampler2D inputs
- 3D mesh preview (apply shader to a sphere/cube)
- Real-time collaboration
- WebGPU compute backend
- MaterialX / glTF export

---

## Relationship to spectra-pixel-bg

spectra-pixel-bg continues to power spendolas.com unchanged. The 4 spectra presets (Value FBM, Simplex FBM, Worley Ridged, Box None) and 6 palettes become built-in example materials in sombra's Phase 4 "Spectra Mode." Eventually spendolas.com could embed a sombra-built material directly.

---

## Initial Prompts

Copy-paste these into a new Claude Code session (local environment, working directory where you want the project created).

### Prompt 1 — Scaffold the project

```
I'm building a project called sombra — a browser-based node-based WebGL shader builder.

Read the file at ~/spectra-pixel-bg/sombra-handoff.md for the full project brief, tech stack, architecture decisions, and roadmap.

Then do the following:

1. Create a new directory ~/sombra and initialize it:
   - npm create vite@latest . -- --template react-ts
   - Install deps: @xyflow/react zustand
   - Install Tailwind CSS v4: tailwindcss @tailwindcss/vite
   - Configure Tailwind via the Vite plugin (not PostCSS)
   - Set base: '/sombra/' in vite.config.ts

2. Set up the project structure:
   - Create placeholder directories: src/nodes/, src/compiler/, src/stores/, src/webgl/, src/components/
   - Set up App.tsx with an empty React Flow canvas (Background, Controls, MiniMap) and dark theme
   - Set up index.css with Tailwind import and dark base styles (#0a0a12 background)

3. Write CLAUDE.md for the project (project overview, tech stack, conventions, commands, architecture — based on the handoff brief)

4. Write ROADMAP.md (copy the roadmap section from the handoff brief into a standalone file)

5. Verify: npm run build succeeds, npm run lint passes

6. Git init, create initial commit with all files, add remote origin git@github.com:spendolas/sombra.git, push to main

Do NOT start on the WebGL renderer or layout shell yet — just the scaffold.
```

### Prompt 2 — Finish Phase 0

```
Read CLAUDE.md and ROADMAP.md in this repo for full context.

We're finishing Phase 0. The scaffold is done. Now:

1. Build a fullscreen WebGL2 quad renderer in src/webgl/:
   - Create a WebGL2 context on a <canvas> element
   - Render a fullscreen quad (2 triangles) with a simple fragment shader (animated gradient or solid color)
   - Export a clean API: init(canvas), updateShader(fragmentSource), destroy()
   - Wire it into App.tsx so it renders behind or beside the React Flow canvas

2. Set up the layout shell in App.tsx:
   - Center: React Flow node canvas (takes most of the space)
   - Right: placeholder panel div for future properties inspector
   - Left: placeholder panel div for future node palette
   - Bottom or split: the WebGL preview canvas
   - Use Tailwind for layout (grid or flex)

3. Add a GitHub Actions workflow (.github/workflows/deploy.yml):
   - On push to main: npm ci, npm run build, deploy dist/ to gh-pages branch
   - Use actions/deploy-pages or peaceiris/actions-gh-pages

4. Update ROADMAP.md — check off completed Phase 0 items

5. Commit and push

Phase 0 milestone: Pan around an empty canvas. A colored WebGL quad renders. Site is live.
```
