// Pass 7: Shaded relief rendering.
// Renders elevation as a USGS-inspired hypsometric shaded relief map.
// v4.4: multi-directional oblique weighted (MDOW) hillshading + recalibrated palette.

struct RenderParams {
  width:                u32,
  height:               u32,
  render_mode:          u32,
  _pad0:                u32,
  sun_angle:            f32,
  elevation_scale:      f32,
  vertical_exaggeration: f32,
  seed:                 f32,
}

@group(0) @binding(0) var<storage, read>       jfa_nearest:    array<vec2<f32>>;
@group(0) @binding(1) var<storage, read>       elevation:      array<f32>;
@group(0) @binding(2) var<storage, read_write> shaded_rgba:    array<u32>;
@group(0) @binding(3) var<uniform>             params:         RenderParams;

fn pack_rgba8(c: vec4<f32>) -> u32 {
  let b = vec4<u32>(round(clamp(c, vec4<f32>(0.0), vec4<f32>(1.0)) * 255.0));
  return b.x | (b.y << 8u) | (b.z << 16u) | (b.w << 24u);
}

fn sample_elev(x: i32, y: i32) -> f32 {
  let cx = clamp(x, 0, i32(params.width)  - 1);
  let cy = clamp(y, 0, i32(params.height) - 1);
  return elevation[u32(cy) * params.width + u32(cx)];
}

// ── Hypsometric land ramp (USGS-inspired) ────────────────────────────────────
// Calibrated to actual terrain output range [0.15, 0.65].
// t = (elev − 0.15) / 0.50  maps land to [0,1].
// Coast green → lowland green → olive-buff → warm brown → reddish mountain →
// grey-buff peak → snow above ~0.60.
fn land_color(elev: f32) -> vec3<f32> {
  let t = clamp((elev - 0.15) / 0.50, 0.0, 1.0);

  let c0 = vec3<f32>(0.34, 0.50, 0.19); // coast / estuary green
  let c1 = vec3<f32>(0.47, 0.57, 0.23); // lowland green
  let c2 = vec3<f32>(0.64, 0.60, 0.27); // transition olive-buff
  let c3 = vec3<f32>(0.68, 0.48, 0.22); // upland warm brown
  let c4 = vec3<f32>(0.57, 0.35, 0.16); // mountain reddish-brown
  let c5 = vec3<f32>(0.74, 0.68, 0.56); // high-peak grey-buff

  var base_col: vec3<f32>;
  if (t < 0.20) {
    base_col = mix(c0, c1, t / 0.20);
  } else if (t < 0.44) {
    base_col = mix(c1, c2, (t - 0.20) / 0.24);
  } else if (t < 0.64) {
    base_col = mix(c2, c3, (t - 0.44) / 0.20);
  } else if (t < 0.82) {
    base_col = mix(c3, c4, (t - 0.64) / 0.18);
  } else {
    base_col = mix(c4, c5, (t - 0.82) / 0.18);
  }

  // Snow: blend to near-white above elev 0.60 (peaks now reachable)
  let snow  = vec3<f32>(0.955, 0.958, 0.965);
  let snow_t = smoothstep(0.60, 0.68, elev);
  return mix(base_col, snow, snow_t);
}

// ── Ocean colour ──────────────────────────────────────────────────────────────
fn ocean_color(shelf_t: f32) -> vec3<f32> {
  // shelf_t: 0 = right at coast, 1 = deep ocean
  let shallow = vec3<f32>(0.376, 0.600, 0.690); // bright coastal teal
  let mid     = vec3<f32>(0.122, 0.341, 0.502); // shelf blue
  let deep    = vec3<f32>(0.039, 0.133, 0.259); // abyssal near-black blue
  if (shelf_t < 0.35) {
    return mix(shallow, mid, shelf_t / 0.35);
  }
  return mix(mid, deep, (shelf_t - 0.35) / 0.65);
}

@compute @workgroup_size(256, 1, 1)
fn main(@builtin(global_invocation_id) gid: vec3<u32>) {
  let idx = gid.x;
  if (idx >= params.width * params.height) { return; }

  let x = i32(idx % params.width);
  let y = i32(idx / params.width);
  let h = sample_elev(x, y);

  // ── Ocean ───────────────────────────────────────────────────────────────────
  let ocean_threshold: f32 = 0.15;
  if (h < ocean_threshold) {
    let nearest = jfa_nearest[idx];
    var shelf_t = 1.0;
    if (nearest.x > -9999.0) {
      let pf = vec2<f32>(f32(x), f32(y));
      shelf_t = smoothstep(0.0, 260.0, length(nearest - pf));
    }
    shaded_rgba[idx] = pack_rgba8(vec4<f32>(ocean_color(shelf_t), 1.0));
    return;
  }

  // ── MDOW Hillshading ────────────────────────────────────────────────────────
  // Multi-directional oblique weighted (Patterson 2001 / USGS style).
  // Four light azimuths at progressively steeper angles; NW primary carries
  // the most weight and sits at a low elevation angle (~25°) for strong shadows.
  // Additional directions fill valleys and reveal ridges at all orientations.
  let left   = sample_elev(x - 1, y);
  let right  = sample_elev(x + 1, y);
  let top    = sample_elev(x, y - 1);
  let bottom = sample_elev(x, y + 1);

  let relief_scale = params.elevation_scale * params.vertical_exaggeration;
  let dx     = (right - left) * relief_scale;
  let dy     = (bottom - top) * relief_scale;
  let normal = normalize(vec3<f32>(-dx, -dy, 1.0));

  let sun = radians(params.sun_angle); // 315° NW
  // l1: NW  at ~25° altitude  (z=0.47) — primary dramatic shadows
  let l1 = normalize(vec3<f32>(cos(sun),           sin(sun),           0.47));
  // l2: NE  at ~35° altitude  (z=0.70) — fills valleys NW misses
  let l2 = normalize(vec3<f32>(cos(sun + 1.5708),  sin(sun + 1.5708),  0.70));
  // l3: WNW at ~45° altitude  (z=1.00) — gentle cross-fill
  let l3 = normalize(vec3<f32>(cos(sun + 0.7854),  sin(sun + 0.7854),  1.00));
  // l4: SE  near-overhead      (z=2.50) — prevents ink-black enclosed shadows
  let l4 = normalize(vec3<f32>(cos(sun + 3.14159), sin(sun + 3.14159), 2.50));

  let diffuse = max(dot(normal, l1), 0.0) * 0.55
              + max(dot(normal, l2), 0.0) * 0.25
              + max(dot(normal, l3), 0.0) * 0.12
              + max(dot(normal, l4), 0.0) * 0.08;

  let ambient = 0.10;
  let illum   = clamp(ambient + diffuse, 0.08, 1.0);

  // ── Land colour × light ──────────────────────────────────────────────────────
  let base_col = land_color(h);
  let lit      = base_col * illum;

  shaded_rgba[idx] = pack_rgba8(vec4<f32>(lit, 1.0));
}
