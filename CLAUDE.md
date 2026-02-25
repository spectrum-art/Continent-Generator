# Continent Generator — CLAUDE.md

Browser-native procedural continent generator. WebGPU compute pipeline (WGSL) + Rust/WASM helpers, bundled with Vite. Fixed 2048×1024 grid. Fully deterministic from a u32 seed.

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

## Project Layout

```
src/main.js               # JS orchestration: GPU init, bind groups, run loop
src/style.css
shaders/                  # WGSL compute shaders (see pipeline below)
wasm-core/src/lib.rs      # Rust: parameter normalization + dispatch sizing
index.html                # UI controls + canvas
docs/notes-to-self.txt    # Canonical parameter constraints
```

## Pipeline — Runtime Execution Order

Pass file numbers do NOT match run order. Actual order:

| Step | File | Purpose |
|------|------|---------|
| 1 | `pass1_generate_land_mask.wgsl` | FBM + box-SDF falloff → binary land mask |
| 2 | `pass2_reduce_bbox.wgsl` | Parallel reduction → land bounding box |
| 3 | `pass3_shift_land_mask.wgsl` | Recentre land → `final_land_mask` |
| 4 | `pass4_generate_plate_ids.wgsl` | Weighted Voronoi: active plates + fossil plates + plume mask |
| 5 | `pass5_compute_fault_stress.wgsl` | 4-neighbour boundary scan → `kinematic_data` vec4 |
| 6 | `pass9_jfa_init.wgsl` | Seed JFA from boundary cells (`kinematic_data.w > 0.5`) |
| 7 | `pass8_jfa_step.wgsl` (looped) | Ping-pong Jump Flood → nearest-fault coords |
| 8 | `pass6_generate_elevation.wgsl` | Topography synthesis |
| 9 | `pass7_shaded_relief.wgsl` | RGBA output for all render modes |

## Key Buffer Shapes

All buffers are flat 1D, indexed `y * width + x`.

| Buffer | Type | Notes |
|--------|------|-------|
| `land_mask` / `final_land_mask` | `array<f32>` | 0.0 = ocean, 1.0 = land |
| `plate_id` | `array<u32>` | Index into active plates (0–99) |
| `plate_velocity` | `array<vec2<f32>>` | Per-pixel velocity (m/yr convention) |
| `fossil_id` | `array<u32>` | Index into fossil plate array |
| `plume_mask` | `array<f32>` | 0–1 hotspot proximity |
| `kinematic_data` | `array<vec4<f32>>` | `.x`=normal stress, `.y`=shear, `.z`=crust_type, `.w`=valid flag |
| `jfa_seed` / `jfa_ping` / `jfa_pong` | `array<vec2<f32>>` | Nearest boundary pixel coords; invalid = (-10000, -10000) |
| `elevation` | `array<f32>` | [0, 1] final height |
| `shaded_rgba` | `array<u32>` | Packed RGBA8 for canvas |

## Active Plate Data (Host → GPU)

Active plates are built in JS (`buildActivePlateSeedData`) and uploaded as a storage buffer. Layout per plate (8 floats / 32 bytes):

```
[0] pos.x   (×2.0 of norm, 0–2 range)
[1] pos.y   (0–1 range)
[2] weight  (pow4 curve, max 0.65)
[3] pad
[4] velocity.x
[5] velocity.y
[6] pad
[7] pad
```

Fossil plates (30) and plume points (5) are generated **inside pass4** as `var<private>` arrays — they are NOT uploaded from the host.

## UV Space Convention (Critical)

The grid is 2048×1024 — a 2:1 aspect ratio. Throughout all shaders:

```wgsl
let sample_uv = vec2<f32>(u_norm * 2.0, v_norm);  // x ∈ [0,2], y ∈ [0,1]
```

`u_norm * 2.0` appears everywhere. When sampling noise, computing plate positions, or doing UV-space distance calculations, **always account for the 2:1 stretch**. Plate positions, fossil positions, and plume positions also use `hx * 2.0` so they span the full canvas.

When converting pixel directions (across_px / along_px) to UV-space directions, you must rescale:
```wgsl
let across_uv = normalize(vec2<f32>(across_px.x * inv_width * 2.0, across_px.y * inv_height));
```

## Perlin Noise Implementation

All shaders use a custom seeded Perlin with a **16-gradient wheel** (22.5° increments). Using fewer gradients causes visible grid artifacts. The `seeded_hash_2d` function avoids a permutation table by hashing cell coordinates with the seed directly. Different seeds per octave are mixed with `seed + octave * 0x9e3779b9u`.

Pass4 applies per-corner seed XOR variants (`^ 0x9e3779b9u`, `^ 0x85ebca6bu`, etc.) for corner independence. Other shaders use the same seed for all corners (simpler variant).

## JFA (Jump Flood Algorithm) for Nearest-Fault Distance

- `pass9_jfa_init`: any cell with `kinematic_data.w > 0.5` becomes a seed (stores its own pixel coords)
- `pass8_jfa_step`: 3×3 neighbourhood check at stride `step_size`; ping-pong between two buffers
- Step sizes halve each iteration: `ceil(max_dim/2), ceil/4, ..., 1`
- Invalid cells store `(-10000, -10000)`; check with `p.x > -9999.0`
- `pass6` reads `jfa_nearest[flat_index]` as the nearest boundary pixel

In `pass6`, the JFA result is **smoothed over a 5×5 neighbourhood** around the nearest boundary cell to reduce sub-pixel jitter from dynamic plate velocities.

## Elevation Synthesis (pass6)

Four additive components, clamped to [0, 1] at the end:

```
final_elevation = base_continent_height + active_elev + fossil_elev + plume_elev
```

**`base_continent_height`**: `mix(0.08, 0.22, mask) + base_noise_component * craton_feather`
- Low-freq FBM lowland noise ± interior swell layer
- Feathered near active boundaries (`craton_feather` from 0.65 → 1.0)

**`active_elev`** (compression `final_kin_x > 0`):
- `base_shape` (pow 0.7) + `peak_detail * ridge_noise` (pow 1.8) concentrated at crest
- Slope-masked erosion incisions subtract at mid-slope (`falloff * (1 - falloff) * 4`)
- Gated by `mountain_gate` (two-octave gap noise) — mountains do NOT span every boundary

**`active_elev`** (extension `final_kin_x < 0`):
- Low-amplitude rift depression: `final_kin_x * falloff * 0.18 * rift_fbm`
- Rift multiplier was 0.35 before Tweak 5.36 — caused ocean-depth gashes

**`fossil_elev`**: Ancient ridge terrain from `ridge_multifractal`, gated by `zone_gate` (smoothstep 0.30–0.75)

**`plume_elev`**: Hotspot dome — `smoothstep(0,1, plume + snoise_perturb) * (fbm_noise + detail)`

### Anisotropic Mountain Ranges (Tweak 5.36+)

Mountains are aligned to tectonic boundaries using a local frame built from the JFA nearest-point direction:

```wgsl
let across_px = bp_diff / bp_len;            // perpendicular to boundary
let along_px  = vec2(-across_px.y, across_px.x);  // tangent to boundary
```

Ridge noise is stretched 4× along the boundary tangent. `dist_warp` is projected 100% along / 25% across to keep snaking on-track. `long_mod` varies width by sampling noise along a 1D arc coordinate.

## Shaded Relief (pass7)

Render mode codes: 1=kinematics, 2=sdf_distance, 3=shaded_relief, 4=elevation.

Shaded relief lighting model:
- Main light from `sun_angle`, fill light at `sun_angle + 120°` (weight 0.22)
- Ambient 0.18, total light clamped [0.15, 1.0] to prevent pitch-black shadows
- Hypsometric land ramp over elevation range [0.08, 0.73] (4 colour stops)
- Ocean: shallow/deep gradient using JFA boundary distance, crossfade over 280px

## Fixed vs. Tunable Parameters

Several parameters look like sliders but are promoted to JS constants in `main.js`:

| Parameter | Fixed Value | Clamp in WASM |
|-----------|-------------|---------------|
| Falloff Strength | 2.00 | — |
| Noise Amplitude | 0.60 | — |
| Plate Warp Amplitude | 1.10 | — |
| Terrain Roughness | 0.70 | — |
| Terrain Frequency | 18.0 | — |

User-adjustable ranges (see `wasm-core/src/lib.rs` for authoritative clamps):

| Parameter | Default | Clamp |
|-----------|---------|-------|
| Land Threshold | 0.54 | [0.2, 1.0] |
| Edge Warp | 0.18 | [0.0, 5.0] |
| Plate Count | 15 | [3, 100] |
| Plate Warp Roughness | 0.60 | [0.3, 0.70] |
| Mountain Radius | 35.0 | [20.0, 50.0] |
| Mountain Height | 0.75 | [0.1, 1.0] |
| Fossil Scale | 0.15 | — |
| Sun Angle | 315° | [0, 360] |
| Elevation Scale | 10.0 | [1.0, 20.0] |
| Vertical Exaggeration | 7.5 | [1.0, 20.0] |

## Dispatch Sizing (Rust/WASM)

`wasm-core` handles workgroup math. Grid is always 2048×1024. Workgroup size = 256. The reduce pass (pass2) uses `dispatch_x.div_ceil(64)`. Use `six_pass_dispatch_sequence` for the current 6-pass land generation sequence.

## Known Artifacts and Their Fixes

| Artifact | Root Cause | Fix Applied |
|----------|-----------|-------------|
| Perlin grid visible in terrain | Too few gradient directions | 16-gradient wheel (Tweak 5.34) |
| Scale striation bands | snoise warp anchor offsets at same scale | Remove anchors entirely (Tweak 5.33) |
| Comb/stripe on mountain crests | Ridge noise at 6 octaves | Reduce to 4 octaves (Tweak 5.37) |
| Circular/radial mountain shapes | Isotropic ridge noise | Anisotropic frame + 4× along-boundary stretch (Tweak 5.36) |
| Rift zones creating ocean-depth gashes | Rift multiplier 0.35 too strong | Reduced to 0.18 (Tweak 5.36) |
| Interior land completely flat | base_noise amplitude too small | Amplitude 0.06→0.10 + interior swell layer (Tweak 5.37) |
| Mountains span every boundary end-to-end | No gap gating | `mountain_gate` two-octave noise (Tweak 5.35) |
| Regular striation in terrain warp | UV warp frequency too high (0.4) | Lowered to 0.03, centered output (Tweak 5.35) |

## Gotchas

- **Pass numbering ≠ run order.** pass6/7/8/9 run in a different order than their filenames suggest. See the pipeline table above.
- **No WebGPU in Firefox** by default. Use Chrome/Edge with WebGPU enabled.
- **WASM rebuild required** after any `wasm-core/src/lib.rs` change. `npm run dev` does this automatically.
- **Uniform buffer alignment:** All param structs use explicit `_pad` fields to satisfy 16-byte alignment. When adding fields, maintain the pattern.
- **Aspect ratio in noise coords:** If a noise pattern looks squashed/stretched, check that `sample_uv.x` uses the `* 2.0` factor.
- **JFA requires `kinematic_data.w > 0.5`** to be set at boundary pixels — if `pass5` logic changes, verify the valid-flag write.
