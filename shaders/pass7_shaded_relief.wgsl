// Pass 7: Shaded relief rendering.
// Renders elevation as a USGS-inspired hypsometric shaded relief map.
// Phase 2: single-direction hillshading (Phase 4 will add multi-directional).

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

// ── USGS hypsometric land ramp ────────────────────────────────────────────────
// Elevation range for land: ~0.28 (base continental) to ~1.0 (high peaks)
// We map this to a cartographic colour ramp.
fn land_color(elev: f32) -> vec3<f32> {
  // Normalise to [0,1] across the land range
  let t = clamp((elev - 0.15) / (1.0 - 0.15), 0.0, 1.0);

  // 5-stop ramp: lowland green → mid tan → high stone → peak chalk
  let c0 = vec3<f32>(0.710, 0.745, 0.573); // sage green lowland
  let c1 = vec3<f32>(0.773, 0.718, 0.557); // warm buff
  let c2 = vec3<f32>(0.816, 0.769, 0.620); // pale tan
  let c3 = vec3<f32>(0.855, 0.820, 0.686); // light stone
  let c4 = vec3<f32>(0.925, 0.910, 0.882); // near-white chalk peak

  if (t < 0.22) {
    return mix(c0, c1, t / 0.22);
  } else if (t < 0.45) {
    return mix(c1, c2, (t - 0.22) / 0.23);
  } else if (t < 0.68) {
    return mix(c2, c3, (t - 0.45) / 0.23);
  } else {
    return mix(c3, c4, (t - 0.68) / 0.32);
  }
}

// ── Ocean colour ──────────────────────────────────────────────────────────────
fn ocean_color(shelf_t: f32) -> vec3<f32> {
  // shelf_t: 0 = right at coast, 1 = deep ocean
  let shallow = vec3<f32>(0.322, 0.533, 0.647); // coastal blue
  let mid     = vec3<f32>(0.133, 0.353, 0.506); // shelf blue
  let deep    = vec3<f32>(0.055, 0.180, 0.310); // abyssal deep blue
  if (shelf_t < 0.4) {
    return mix(shallow, mid, shelf_t / 0.4);
  }
  return mix(mid, deep, (shelf_t - 0.4) / 0.6);
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

  // ── Hillshading ─────────────────────────────────────────────────────────────
  let left   = sample_elev(x - 1, y);
  let right  = sample_elev(x + 1, y);
  let top    = sample_elev(x, y - 1);
  let bottom = sample_elev(x, y + 1);

  let relief_scale = params.elevation_scale * params.vertical_exaggeration;
  let dx     = (right - left) * relief_scale;
  let dy     = (bottom - top) * relief_scale;
  let normal = normalize(vec3<f32>(-dx, -dy, 1.0));

  // Primary sun — NW convention (315°)
  let sun_rad  = radians(params.sun_angle);
  let light    = normalize(vec3<f32>(cos(sun_rad), sin(sun_rad), 1.0));
  let diffuse  = max(dot(normal, light), 0.0);

  // Soft fill light from opposite direction at shallower angle
  let fill_rad = radians(params.sun_angle + 150.0);
  let fill_dir = normalize(vec3<f32>(cos(fill_rad), sin(fill_rad), 1.8));
  let fill     = max(dot(normal, fill_dir), 0.0) * 0.18;

  let ambient  = 0.15;
  let illum    = clamp(ambient + diffuse * (1.0 - ambient) + fill, 0.12, 1.0);

  // ── Land colour × light ──────────────────────────────────────────────────────
  let base_col = land_color(h);
  let lit      = base_col * illum;

  shaded_rgba[idx] = pack_rgba8(vec4<f32>(lit, 1.0));
}
