# Continent Generator (WebGPU + WASM) — Milestone 4.3

A real-time, deterministic continent / tectonics-inspired heightmap generator built around a multi-pass WebGPU compute pipeline, with parameter mapping + dispatch sizing handled in Rust → wasm-pack (WASM).

This project focuses on:
- Continent silhouette generation (land mask with controllable falloff / edge warp)
- Plate partitioning (plate IDs)
- Boundary-driven kinematics (relative plate motion along borders)
- Fault-driven topography (mountain belts / trenches approximated from boundary distance + kinematics)
- Fast debug visualization (land mask, plate IDs, kinematics, SDF distance, shaded relief)

Current UI title: “Continent Generator: Milestone 4.3”

---

## Demo / UI Controls

The UI exposes a set of live parameters:
- Seed (deterministic)
- Land Threshold, Falloff Strength, Noise Amplitude, Edge Warp
- Plate Count, Plate Warp Amplitude, Plate Warp Roughness
- Mountain Radius, Mountain Height
- Terrain Roughness, Terrain Frequency
- Sun Angle, Elevation Scale, Vertical Exaggeration
- Render Mode (Land Mask / Plate IDs / Kinematics / SDF Distance / Shaded Relief)

---

## Tech Stack

- WebGPU compute pipeline (WGSL shaders in /shaders)
- Vite dev server + bundling
- Rust + wasm-bindgen + wasm-pack for:
  - parameter normalization / validation
  - deterministic RNG utilities
  - compute dispatch sizing sequences
- Render output is written into GPU buffers and displayed on a canvas.

---

## Pipeline Overview (Compute Passes)

The generation is structured as sequential compute passes (names reflect shader files):

1. Land Mask — pass1_generate_land_mask.wgsl  
   Produces the base land/ocean field with falloff and noise shaping.

2. Reduce Bounding Box — pass2_reduce_bbox.wgsl  
   Finds a tight-ish bounding region / stats used for post-processing.

3. Shift Land Mask — pass3_shift_land_mask.wgsl  
   Re-centers / normalizes the land distribution (keeps continents from hugging edges).

4. Plate IDs — pass4_generate_plate_ids.wgsl  
   Assigns plate identifiers across the grid.

5. Fault Kinematics — pass5_compute_fault_stress.wgsl  
   Computes a per-cell “best boundary interaction” from neighbor plate differences
   (relative velocity → normal + shear components; also tags crust pairing).

6. Elevation / Topography — pass6_generate_elevation.wgsl  
   Uses distance-to-boundary (SDF-ish) and kinematics to build ridges/trenches + terrain texture.

7. Shaded Relief — pass7_shaded_relief.wgsl  
   Computes normals from elevation and produces a shaded map for quick visual evaluation.

8–9. Jump Flood Algorithm (JFA) SDF — pass9_jfa_init.wgsl, pass8_jfa_step.wgsl  
   Generates nearest-boundary fields used to approximate distance-to-fault efficiently.

---

## Running Locally

### Prereqs
- Node.js (recent)
- Rust toolchain + wasm-pack
- A browser with WebGPU enabled (Chrome/Edge recent builds typically work)

### Dev

npm install  
npm run dev  

### Build

npm run build  
npm run preview  

The dev/build steps run:

wasm-pack build wasm-core --target web --release

into src/wasm before Vite starts.

---

## Repo Layout

- /src — app entrypoint (main.js) + styling
- /shaders — WGSL compute passes
- /wasm-core — Rust WASM utilities (parameter mapping, dispatch sizing, deterministic helpers)
- /public/docs — milestone screenshots + shader snapshots

---

## Design Philosophy

This is not (yet) a full geophysical simulation. It’s a fast, controllable generator that produces “tectonics-flavored” structure:
- plate partitioning + boundary detection
- boundary kinematics driving ridge/trench-like elevation
- controllable noise and stylization for terrain texture

Future realism steps would typically add:
- boundary-type classification (convergent/divergent/transform)
- bathymetry + continental shelves
- erosion + river networks
- time-stepped plate advection rather than single-pass static velocities
