# Continent Generator (WebGPU + WASM)

Browser-native, deterministic continent generation on a fixed 2048x1024 grid using a multi-pass WebGPU compute pipeline.  
Rust/WASM is used for parameter normalization and dispatch sizing; generation and visualization are WGSL-driven.

## Current Capabilities
- Deterministic landmask generation with threshold/falloff/noise controls
- Plate partitioning with weighted cells, domain warping, and dynamic plate count
- Host-seeded active plate velocity field (heavy-tailed speed distribution)
- Fault kinematics extraction (normal stress, shear stress, crust class)
- JFA nearest-fault propagation (SDF-style distance field)
- Elevation synthesis from active stress + ancient ranges + plume contribution
- Debug and presentation views:
  - `land_mask`
  - `plate_id`
  - `kinematics`
  - `sdf_distance`
  - `elevation`
  - `shaded_relief`

## UI Controls
- Seed
- Land: threshold, falloff strength, noise amplitude, edge warp
- Plates: plate count, plate warp amplitude, plate warp roughness
- Terrain: mountain radius, mountain height, terrain roughness, terrain frequency, fossil scale
- Lighting: sun angle, elevation scale, vertical exaggeration
- Render mode selector

## Pipeline (Runtime Order)
1. `pass1_generate_land_mask.wgsl`: initial land/ocean mask
2. `pass2_reduce_bbox.wgsl`: land extents reduction
3. `pass3_shift_land_mask.wgsl`: recenter into `final_land_mask`
4. `pass4_generate_plate_ids.wgsl`: active/fossil/plume fields + per-pixel plate velocity lookup
5. `pass5_compute_fault_stress.wgsl`: boundary kinematics (`vec4`: normal, shear, crust, valid)
6. `pass9_jfa_init.wgsl`: initialize nearest-fault seeds from kinematic validity
7. `pass8_jfa_step.wgsl` (looped): ping-pong Jump Flood steps down to stride 1
8. `pass6_generate_elevation.wgsl`: topography synthesis using kinematics + JFA distance + noise shaping
9. `pass7_shaded_relief.wgsl`: visualization buffer output for kinematics/SDF/elevation/shaded views

## Data Model Notes
- Primary spatial buffers are flat 1D arrays
- `plate_velocity` is `array<vec2<f32>>`
- `kinematic_data` is `array<vec4<f32>>`
- JFA buffers are ping-pong `array<vec2<f32>>`
- Active plate seed data is uploaded from host JS (`ActivePlate` packed into storage buffer)

## Tech Stack
- WebGPU + WGSL compute
- Vite (dev/build)
- Rust + wasm-bindgen + wasm-pack (`wasm-core`)

## Running Locally
### Prerequisites
- Node.js (recent)
- Rust toolchain + `wasm-pack`
- Chromium-based browser with WebGPU support

### Commands
```bash
npm install
npm run dev
```

```bash
npm run build
npm run preview
```

`dev` and `build` both run:
```bash
wasm-pack build wasm-core --target web --out-dir ../src/wasm --release
```

## Repository Layout
- `src/`: app orchestration (`main.js`) and UI styles
- `shaders/`: WGSL compute shaders
- `wasm-core/`: Rust/WASM parameter and dispatch helpers
- `docs/`: milestone/tweak artifacts and screenshots

## Scope
This project is still a fast tectonics-flavored procedural generator, not a full physical simulation.  
It currently prioritizes deterministic behavior, interactive parameter tuning, and high-speed iteration on structural terrain patterns.
