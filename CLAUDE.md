# Continent Generator v4 — CLAUDE.md

Browser-native procedural continent generator. WebGPU compute pipeline (WGSL) +
Rust/WASM helpers, bundled with Vite. Fixed 2048×1024 grid. Fully deterministic from
a u32 seed. See `docs/vision.md` for the emotional core and narrative design goals.

## Commands

```bash
npm run dev         # wasm:build + vite dev server
npm run build       # wasm:build + vite build
npm run preview     # serve dist/
```

WASM step (runs inside dev/build automatically):
```bash
wasm-pack build wasm-core --target web --out-dir ../src/wasm --release
```

Requires: Node.js, Rust toolchain + `wasm-pack`, Chromium-based browser with WebGPU.

## Architecture Principle

**Plates first. Everything flows from the plates.**

The continent shape is derived from tectonic plate types — continental plates become
land, oceanic plates become ocean. The coastline IS the plate boundary (organic shape
comes from domain-warped Voronoi in pass1). Mountains stand at convergent margins;
rifts open at divergent ones.

v3 generated a blob, then painted plates on top (inverted, broken).
v4 generates plates, then derives land from them (correct, narrative).

## Project Layout

```
src/main.js               # JS orchestration: GPU init, buildPlateStory, pipeline
src/style.css
shaders/                  # WGSL compute shaders (see pipeline below)
wasm-core/src/lib.rs      # Rust: grid dimensions + dispatch helpers
index.html                # Minimal UI: seed input, generate button, canvas
docs/vision.md            # Emotional core and narrative design principles
```

## Pipeline — Runtime Execution Order

| Step | File | Purpose |
|------|------|---------|
| 1 | `pass1_generate_plates.wgsl` | Domain-warped Voronoi → plate_id, plate_type, plate_velocity |
| 2 | `pass2_derive_land_mask.wgsl` | Continental plate pixels → land_mask = 1.0 |
| 3 | `pass3_boundary_stress.wgsl` | 4-neighbour scan → kinematic_data |
| 4 | `pass9_jfa_init.wgsl` | Seed JFA from boundary cells (kinematic_data.w > 0.5) |
| 5 | `pass8_jfa_step.wgsl` (×11) | Ping-pong Jump Flood → nearest boundary pixel |
| 6 | `pass6_elevation.wgsl` | Narrative elevation synthesis |
| 7 | `pass7_shaded_relief.wgsl` | USGS-inspired RGBA output |

## Geological Story Generator (JS)

`buildPlateStory(seed)` in `main.js` generates a structured geological narrative
before any GPU work. Four archetypes derived from seed:

| Archetype | Description | Key Effect |
|-----------|-------------|------------|
| `single_continent` | One dominant continental cluster | Central landmass, passive margins |
| `collision` | Two continental masses converging | Guaranteed central orogen |
| `rift` | One continent pulling apart | Central divergent rift valley |
| `archipelago` | Several scattered small plates | Island chains, varied coasts |

Continental plates are placed in the central UV region [0.35,1.65]×[0.25,0.75].
Oceanic plates fill the remainder. No centering pass needed — position is by design.

## Plate Buffer Layout (Host → GPU)

Each plate: 8 floats / 32 bytes. Max 24 plates (typically 20 used).

```
[0] pos.x        (x ∈ [0,2])
[1] pos.y        (y ∈ [0,1])
[2] weight       (Voronoi bias, linear; continental 0.06–0.20, oceanic 0.0)
[3] plate_type   (0.0 = continental, 1.0 = oceanic)
[4] velocity.x   (m/yr convention, up to ±12)
[5] velocity.y
[6] _pad
[7] _pad
```

## Key Buffer Shapes

All buffers flat 1D, indexed `y * width + x`.

| Buffer | Type | Notes |
|--------|------|-------|
| `plate_id` | `array<u32>` | Voronoi cell index (0–23) |
| `plate_type` | `array<f32>` | 0.0 = continental, 1.0 = oceanic |
| `plate_velocity` | `array<vec2<f32>>` | Per-pixel velocity from plate |
| `land_mask` | `array<f32>` | 1.0 = land, 0.0 = ocean |
| `kinematic_data` | `array<vec4<f32>>` | .x=approach_speed, .y=shear, .z=boundary_type, .w=valid |
| `jfa_seed/ping/pong` | `array<vec2<f32>>` | Nearest boundary pixel coords; invalid = (-10000,-10000) |
| `elevation` | `array<f32>` | [0,1] final height |
| `shaded_rgba` | `array<u32>` | Packed RGBA8 for canvas |

## Kinematic Convention (Critical)

In pass3, approach_speed = `dot(self_v − neighbor_v, dir_to_neighbor)`:
- **Positive** = self approaching neighbor = **compression → mountains**
- **Negative** = self diverging from neighbor = **extension → rift**

This is the OPPOSITE sign from v3's pass5 (which used `neighbor_v - self_v`).

`kinematic_data.z` (boundary_type) = `plate_type[self] + plate_type[neighbor]`:
- 0.0 = continental–continental
- 1.0 = continental–oceanic (mixed)
- 2.0 = oceanic–oceanic

## Elevation Synthesis (pass6)

Base elevation (plate-type driven):
- Continental: `0.28 + (craton_fbm − 0.5) × 0.10 + interior_swell`
- Oceanic: `0.04 + abyssal_fbm × 0.04`

Boundary-driven (uses JFA nearest + 5×5 smoothed kinematic sample):
- Convergent cont-cont (kin_x > 0, btype < 1.5): anisotropic ridge mountains
- Divergent continental (kin_x < 0, is_continental): rift valley depression
- Divergent oceanic (kin_x < 0, oceanic): mid-ocean ridge swell

Anisotropic mountain frame from v3 preserved: along/across boundary decomposition,
14× stretch along boundary, mountain gate noise for non-continuous ranges.

## Shaded Relief (pass7)

Ocean threshold: 0.15 (pixels below this render as water regardless of plate type).

USGS-inspired 5-stop land ramp:
- 0.15–0.28 (t 0–0.22): sage green `#b5be92`
- 0.28–0.42 (t 0.22–0.45): warm buff `#c5b78e`
- 0.42–0.57 (t 0.45–0.68): pale tan `#d0c49e`
- 0.57–0.73 (t 0.68–1.0): light stone → chalk `#dad1af → #ece8e1`

Ocean: JFA distance → shelf crossfade from coastal blue `#527888` → abyssal `#0e2e4f`

Hillshading: primary NW (315°) + soft fill (+150°, 0.18 weight). Phase 4 will
upgrade to multi-directional oblique (MDOW).

## UV Space Convention

Grid is 2048×1024 (2:1 aspect). Throughout all shaders:
```wgsl
let uv = vec2<f32>(x * inv_width * 2.0, y * inv_height);  // x ∈ [0,2], y ∈ [0,1]
```
Plate positions are set in this same UV space. Noise sampling always uses this
space. If a pattern looks squashed, check the `* 2.0` factor.

## JFA (Jump Flood Algorithm)

- pass9: seeds from `kinematic_data.w > 0.5` (plate boundary pixels)
- pass8: 3×3 neighbourhood at stride `step_size`; ping-pong jfaPing ↔ jfaPong
- 11 steps for 2048-wide grid: 1024, 512, 256, 128, 64, 32, 16, 8, 4, 2, 1
- After 11 steps, result is in jfaPongBuf → copied to jfaPingBuf for pass6
- Per-step uniform buffers pre-created in JS (avoids mid-encoder writeBuffer)
- Invalid cells: (-10000, -10000); test with `p.x > -9999.0`

## Dispatch Sizing (Rust/WASM)

Grid: 2048×1024 = 2,097,152 cells. Workgroup size: 256. dispatch_x = 8192.
Use `n_pass_dispatch(CELL_COUNT, 1)` for a single full-grid pass dispatch value.
`n_pass_dispatch(CELL_COUNT, N)` returns N identical dispatch_x values.

## Road Map

| Phase | Status | Goal |
|-------|--------|------|
| 1 | ✅ done | Repo skeleton, archive v3 |
| 2 | ✅ done | Plates-first pipeline, narrative story generator |
| 3 | pending | Interior terrain richness (cratons, basins, passive margins) |
| 4 | pending | Multi-directional hillshading + USGS palette refinement |
| 5 | pending | Rivers (D8 flow accumulation) |
| 6 | pending | Polish: render modes, UI, export |

## Gotchas

- **Pass numbering ≠ run order.** pass6/7/8/9 run in non-sequential order (see table).
- **No WebGPU in Firefox** by default. Use Chrome/Edge with WebGPU enabled.
- **No WebGPU in headless Chromium / WSL**. Test in a real browser window.
- **WASM rebuild required** after any `wasm-core/src/lib.rs` change. `npm run dev` does this.
- **Uniform buffer alignment:** All param structs are multiples of 16 bytes. Maintain this.
- **`i++` is not valid WGSL.** Use `i += 1u` (unsigned) or `i += 1` (signed).
- **Kinematic sign**: positive approach_speed = compression = mountains (v3 was inverted).
- **Archive branch**: `archive/v3` on origin has the full v3 history with tweak-5.x work.
