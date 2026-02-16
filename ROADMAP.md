# Roadmap: Spectra Shader Builder

> Evolving spectra-pixel-bg into a browser-based, node-based WebGL shader builder.
> Full-frame fragment shaders. No backend. GitHub Pages.

---

## Workflow

```
Figma (design) ←→ Claude Code (implement) → GitHub Pages (deploy)
```

Each phase follows this loop:
1. **Figma** — design the UI for the phase's features (wireframes → high-fidelity)
2. **Claude Code** — implement against the Figma spec, iterate
3. **GitHub Pages** — deploy the static build, validate live

---

## Tech Stack

| Layer | Choice | Rationale |
|---|---|---|
| Build tool | **Vite** | Fast HMR, static output, zero-config TypeScript |
| Language | **TypeScript** | Type safety matters for graph/compiler code |
| UI framework | **React 19** | Ecosystem, React Flow compatibility |
| Node editor | **React Flow** (`@xyflow/react`) | Largest community, custom React nodes, TypeScript-first |
| State | **Zustand** | Lightweight, pairs naturally with React Flow |
| Preview renderer | **Raw WebGL** (fullscreen quad) | No Three.js scene needed — two triangles + fragment shader |
| Styling | **Tailwind CSS** | Utility-first, fast Figma→code translation, fully flexible visually |
| Deploy | **GitHub Pages** via `gh-pages` branch | Static output from `vite build` |

### Why Not Keep the Current Stack?

The current spectra-pixel-bg is vanilla JS with no build step. That works for a single-page visualization but not for a tool with:
- A complex node graph UI (React Flow requires React)
- A shader compiler (TypeScript's type system prevents graph wiring bugs)
- Dozens of node types (need module system, not global scripts)

The existing spectra-pixel-bg presets become the **first demo materials** in the new tool — proof that the system can reproduce what the old setup did.

---

## Phase 0 — Scaffolding & Figma Groundwork

**Goal:** Empty canvas renders. Design system started. Dev loop works.

### Figma
- [ ] Set up Figma project with design tokens (colors, typography, spacing, radii)
- [ ] Wireframe the core layout: node canvas (center), properties panel (right), node palette (left), toolbar (top), preview viewport (bottom or split)
- [ ] Define the visual language for nodes: header bar, port dots, connection wires, selection state, error state
- [ ] Design the fullscreen preview toggle (editor ↔ preview modes)

### Code
- [ ] Scaffold Vite + React + TypeScript project
- [ ] Install React Flow, Zustand
- [ ] Basic layout shell matching Figma wireframe (panels, canvas area)
- [ ] Empty React Flow canvas with pan/zoom
- [ ] Fullscreen WebGL quad renderer (passthrough fragment shader: solid color)
- [ ] Vite builds to `dist/`, deploy script pushes to `gh-pages` branch
- [ ] Set up GitHub Actions for automated deploy on push to main

### Milestone
A blank canvas you can pan around, with a colored fullscreen WebGL quad rendering beside it. Deploys to GitHub Pages.

---

## Phase 1 — Core Editor MVP

**Goal:** Wire up nodes, see a live shader. This is the "it works" moment.

### Figma
- [ ] Design node visuals for each starter type (below)
- [ ] Design the properties/inspector panel (shows selected node's parameters)
- [ ] Design connection wires (color-coded by type: float=gray, vec2=green, vec3=blue, vec4=purple, color=rainbow)
- [ ] Design inline node previews (small thumbnail showing that node's output)
- [ ] Design error states (invalid connections, compilation errors highlighted on nodes)

### Code — Node System
- [ ] Node type registry architecture:
  ```
  NodeDefinition {
    type: string
    label: string
    category: string
    inputs: PortDefinition[]
    outputs: PortDefinition[]
    defaults: Record<string, any>
    glsl: (inputs, outputs, params) => string
    ui?: React.ComponentType  // optional custom node body
  }
  ```
- [ ] Port type system: `float`, `vec2`, `vec3`, `vec4`, `color`, `sampler2D`
- [ ] Automatic type coercion rules (float→vec3 broadcasts, vec4→vec3 drops alpha, etc.)
- [ ] Starter node library (~15 nodes):

  | Category | Nodes |
  |---|---|
  | **Input** | UV Coordinates, Time, Resolution, Float Constant, Vec2 Constant, Color Picker |
  | **Math** | Add, Multiply, Mix (lerp), Smoothstep, Sin/Cos, Remap |
  | **Noise** | Simple Noise (value), Simplex Noise |
  | **Color** | HSV↔RGB, Brightness/Contrast |
  | **Output** | Fragment Output (the master node — always exactly one) |

### Code — Compiler
- [ ] Graph-to-GLSL compiler:
  1. Topological sort from Fragment Output node backward
  2. Each node emits its GLSL snippet with unique variable names (`node_<id>_out`)
  3. Unconnected inputs use the node's default value
  4. Automatic type conversion inserted at mismatched connections
  5. Assemble into a complete fragment shader (uniforms, main, snippets)
- [ ] Built-in uniforms injected automatically: `u_time`, `u_resolution`, `u_mouse`
- [ ] Compilation error handling: parse WebGL shader log, map errors back to the offending node, highlight it red

### Code — Preview
- [ ] Fullscreen quad renders the compiled fragment shader
- [ ] Hot-recompile on every graph change (debounced ~100ms)
- [ ] Per-node mini-preview: compile a variant shader that outputs that node's value as the fragment color
- [ ] Toggle between split view (editor + preview) and fullscreen preview

### Milestone
You can drag out UV Coords → Noise → Mix → Fragment Output, tweak parameters in the inspector, and see a live animated noise pattern filling the screen. Your existing spectra presets can be manually recreated as node graphs.

---

## Phase 2 — Save, Load & Export

**Goal:** Materials persist. You can share your work.

### Figma
- [ ] Design save/load UI (toolbar buttons, file picker modal)
- [ ] Design export panel (tabs: GLSL / Embed HTML / JSON)
- [ ] Design the material thumbnail/card (for the local library browser)
- [ ] Design the "new material" / "open recent" flow

### Code — Persistence
- [ ] Serialize graph to JSON: node types, positions, connections, parameter values, metadata (name, author, timestamp)
- [ ] Schema version field for future migration
- [ ] Save to `localStorage` (auto-save on change, debounced)
- [ ] "Recent Materials" list from localStorage
- [ ] Download as `.json` file
- [ ] Upload/import `.json` file (drag-and-drop onto canvas)

### Code — Export
- [ ] **Copy GLSL** — raw fragment shader source with uniform declarations and comments
- [ ] **Copy Embed Snippet** — self-contained HTML:
  ```html
  <canvas id="shader" style="width:100%;height:100%"></canvas>
  <script>
    // Minimal WebGL bootstrap (~40 lines)
    // Compiled fragment shader inlined
    // Uniform wiring (time, resolution, mouse)
  </script>
  ```
- [ ] **Embed page** — `/embed.html?material=<base64-encoded-json>` hosted on GitHub Pages, renders the material fullscreen. Shareable via URL (material data is in the URL, no server needed — size limit ~2KB of graph data which is usually enough)

### Milestone
Create a material, close the browser, come back, it's still there. Download it as JSON, send it to someone, they can import it. Copy an embed snippet into any webpage and it renders.

---

## Phase 3 — Node Library Expansion

**Goal:** Enough nodes to build anything interesting. Import external shaders.

### Figma
- [ ] Design the node palette/browser (searchable, categorized, with previews)
- [ ] Design the "custom GLSL node" editor (code input with syntax highlighting)
- [ ] Design the import flow for external shaders (paste URL or code)

### Code — More Nodes
- [ ] Expand library to ~40 nodes:

  | Category | New Nodes |
  |---|---|
  | **Noise** | Worley, FBM, Turbulence, Ridged, Box Noise |
  | **Pattern** | Checkerboard, Stripes, Dots, Brick, Voronoi |
  | **Math** | Abs, Fract, Step, Clamp, Pow, Mod, Distance, Dot Product, Cross Product |
  | **Vector** | Split (vec→floats), Combine (floats→vec), Normalize, Reflect, Transform |
  | **Color** | Gradient Ramp (multi-stop), Blend Modes (multiply, screen, overlay), Posterize |
  | **Distortion** | Domain Warp, Rotate UV, Scale UV, Offset UV, Swirl, Polar Coordinates |
  | **Utility** | Comment (non-functional grouping node), Preview (force-show any node's output fullscreen) |

### Code — Subgraphs
- [ ] "Group" selected nodes into a subgraph (collapses to a single node with exposed inputs/outputs)
- [ ] Subgraphs are saveable as reusable node types
- [ ] Double-click a subgraph node to "dive in" and edit its contents

### Code — External Shader Import
- [ ] **Custom GLSL Node**: paste arbitrary GLSL function, define typed inputs/outputs, node wraps it
- [ ] **Shadertoy import adapter**: paste a Shadertoy URL or `mainImage()` code, adapter rewrites uniforms (`iTime`→`u_time`, `iResolution`→`u_resolution`, `fragCoord`→`gl_FragCoord`), wraps it as a function node
- [ ] **GLSL Sandbox adapter**: same pattern, different uniform names
- [ ] Each adapter produces a standard node with typed ports — the imported shader becomes just another node in the graph

### Code — UX Polish
- [ ] Node search palette (Cmd+K / Ctrl+K to open, type to filter, Enter to place)
- [ ] Undo/redo (Zustand middleware or custom history stack)
- [ ] Keyboard shortcuts: Delete (remove node), Cmd+D (duplicate), Cmd+G (group), Space+drag (pan)
- [ ] Minimap (React Flow built-in)
- [ ] Snap-to-grid (optional, toggle)

### Milestone
A user can paste a Shadertoy shader, wire its output through a color ramp and a domain warp, and export the result as an embeddable snippet. The node palette has enough variety to build complex procedural materials from scratch.

---

## Phase 4 — Polish & Performance

**Goal:** Feels like a real tool, not a prototype.

### Figma
- [ ] Full high-fidelity pass on all UI surfaces
- [ ] Dark theme (primary) + light theme
- [ ] Design responsive breakpoints (the tool should work on a 13" laptop)
- [ ] Design onboarding flow (first-time tooltip tour or example material that auto-loads)
- [ ] Design the "gallery" view for local saved materials

### Code — Fit & Finish
- [ ] Implement the final Figma designs across all panels
- [ ] Smooth animations: node placement, wire drawing, panel collapse/expand
- [ ] Proper error boundaries (compiler crash doesn't kill the editor)
- [ ] Loading states for shader compilation
- [ ] Responsive layout (collapsible panels for smaller screens)

### Code — Performance
- [ ] Lazy compilation: only recompile the subgraph that changed
- [ ] Throttle preview FPS when the editor tab is in the background
- [ ] Virtualize the node palette list (hundreds of nodes shouldn't lag)
- [ ] Profile and optimize React Flow with large graphs (100+ nodes)

### Code — DX
- [ ] "Spectra Mode": one-click recreate the current spectra-pixel-bg presets as node graphs (proves backward compatibility)
- [ ] Example materials library (ship 5-10 built-in materials showcasing different node combinations)
- [ ] Tooltips on every port (shows type + description)
- [ ] Right-click context menu on nodes and canvas

### Milestone
Someone unfamiliar with shaders can open the tool, load an example material, tweak colors, and export an embed snippet — without reading docs.

---

## Phase 5 — Future (When the Need Arises)

These are not planned — they're documented triggers for when the architecture needs to evolve.

| Trigger | Response |
|---|---|
| Users want shareable URLs (`/m/:id`) | Add Vercel + Supabase, move from GitHub Pages |
| Users want a public gallery | Add backend persistence + search |
| Users want texture/image inputs | Add `sampler2D` upload nodes, asset storage (Supabase Storage or R2) |
| Users want 3D preview | Add Three.js scene with orbit camera, mesh selector, environment maps |
| Users want real-time collaboration | Add Liveblocks or Supabase Realtime |
| Users want WebGPU output | Add Three.js TSL export alongside GLSL |
| Users want to publish npm packages of materials | Add build pipeline for `@spectra/material-*` packages |
| MaterialX adoption grows | Add MaterialX XML import/export for interchange with native DCC tools |

---

## Relationship to Current spectra-pixel-bg

The current project (`src/spectraGL-noisekit.js`, presets, palettes) is the **spiritual predecessor**. It proves the concept: procedural noise → color palette → fullscreen WebGL. The shader builder generalizes this into an open-ended tool.

**Migration path:**
- The new tool is a **separate repo** (different tech stack, build system, and purpose)
- `spectra-pixel-bg` continues to power spendolas.com as-is
- Once the shader builder can reproduce all 4 spectra presets via node graphs, those become the first entries in the built-in example library
- Eventually, spendolas.com could embed a material built with the new tool (coming full circle)

---

## Resolved Decisions

| # | Question | Decision | Rationale |
|---|---|---|---|
| 1 | Repo structure | **Separate repo** | Different tech stack (React/TS/Vite vs vanilla JS), different deploy pipeline, different purpose. spectra-pixel-bg stays untouched on spendolas.com. |
| 2 | Styling | **Tailwind CSS** | Utility-first — no visual constraints, any look is achievable. Fast Figma→Claude Code translation. No context-switching between component and CSS files. |
| 3 | Domain | **GitHub Pages default** (`spendolas.github.io/<repo>`) | No point buying a domain until there's something worth branding. Custom domain can be added later with one CNAME file. |
| 4 | Node previews | **Single offscreen renderer** | One hidden WebGL context renders each node's preview in sequence, captures to `<img>`. Avoids browser WebGL context limits (8-16). Scales to 100+ nodes. |
| 5 | GLSL target | **GLSL ES 3.0 / WebGL2** | Cleaner syntax (`in`/`out`), integers, better loops. 97%+ browser support. The 3% gap is dead platforms (old iOS Safari, IE11). |
