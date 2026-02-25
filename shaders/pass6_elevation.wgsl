// Pass 6: Elevation synthesis.
//
// Elevation components (additive, clamped [0,1]):
//   base      — plate-type-driven continental/oceanic floor
//   mountain  — convergent continental boundaries (anisotropic ridge noise)
//   rift      — divergent boundaries (depression)
//   noise     — interior FBM variation (craton texture, basins, swell)

struct ElevParams {
  width:             u32,
  height:            u32,
  seed:              u32,
  _pad0:             u32,
  inv_width:         f32,
  inv_height:        f32,
  mountain_height:   f32,
  mountain_radius:   f32,   // pixels
  terrain_roughness: f32,
  _pad1:             f32,
  _pad2:             f32,
  _pad3:             f32,
}

@group(0) @binding(0) var<storage, read>       plate_type:     array<f32>;
@group(0) @binding(1) var<storage, read>       kinematic_data: array<vec4<f32>>;
@group(0) @binding(2) var<storage, read>       jfa_nearest:    array<vec2<f32>>;
@group(0) @binding(3) var<storage, read_write> elevation:      array<f32>;
@group(0) @binding(4) var<uniform>             params:         ElevParams;

// ── Noise ────────────────────────────────────────────────────────────────────

fn hash_u32(x: u32) -> u32 {
  var h = x;
  h ^= h >> 16u; h *= 0x7feb352du;
  h ^= h >> 15u; h *= 0x846ca68bu;
  h ^= h >> 16u;
  return h;
}

fn seeded_hash_2d(p: vec2<u32>, seed: u32) -> u32 {
  var h = p.x * 374761393u + p.y * 668265263u;
  h ^= seed * 2246822519u + 3266489917u;
  return hash_u32(h);
}

fn fade2(t: vec2<f32>) -> vec2<f32> {
  return t * t * t * (t * (t * 6.0 - 15.0) + 10.0);
}

fn grad(h: u32) -> vec2<f32> {
  switch (h & 15u) {
    case 0u:  { return vec2<f32>( 1.0,       0.0       ); }
    case 1u:  { return vec2<f32>( 0.9238795,  0.3826834 ); }
    case 2u:  { return vec2<f32>( 0.7071068,  0.7071068 ); }
    case 3u:  { return vec2<f32>( 0.3826834,  0.9238795 ); }
    case 4u:  { return vec2<f32>( 0.0,        1.0       ); }
    case 5u:  { return vec2<f32>(-0.3826834,  0.9238795 ); }
    case 6u:  { return vec2<f32>(-0.7071068,  0.7071068 ); }
    case 7u:  { return vec2<f32>(-0.9238795,  0.3826834 ); }
    case 8u:  { return vec2<f32>(-1.0,        0.0       ); }
    case 9u:  { return vec2<f32>(-0.9238795, -0.3826834 ); }
    case 10u: { return vec2<f32>(-0.7071068, -0.7071068 ); }
    case 11u: { return vec2<f32>(-0.3826834, -0.9238795 ); }
    case 12u: { return vec2<f32>( 0.0,       -1.0       ); }
    case 13u: { return vec2<f32>( 0.3826834, -0.9238795 ); }
    case 14u: { return vec2<f32>( 0.7071068, -0.7071068 ); }
    default:  { return vec2<f32>( 0.9238795, -0.3826834 ); }
  }
}

fn perlin(p: vec2<f32>, seed: u32) -> f32 {
  let c = vec2<i32>(floor(p));
  let f = fract(p);
  let u = fade2(f);
  let g00 = grad(seeded_hash_2d(vec2<u32>(u32(c.x),     u32(c.y)),     seed));
  let g10 = grad(seeded_hash_2d(vec2<u32>(u32(c.x + 1), u32(c.y)),     seed));
  let g01 = grad(seeded_hash_2d(vec2<u32>(u32(c.x),     u32(c.y + 1)), seed));
  let g11 = grad(seeded_hash_2d(vec2<u32>(u32(c.x + 1), u32(c.y + 1)), seed));
  let n00 = dot(g00, f - vec2<f32>(0.0, 0.0));
  let n10 = dot(g10, f - vec2<f32>(1.0, 0.0));
  let n01 = dot(g01, f - vec2<f32>(0.0, 1.0));
  let n11 = dot(g11, f - vec2<f32>(1.0, 1.0));
  return mix(mix(n00, n10, u.x), mix(n01, n11, u.x), u.y);
}

fn fbm(p: vec2<f32>, freq: f32, roughness: f32, octaves: u32, seed: u32) -> f32 {
  let rot = mat2x2<f32>(0.8, -0.6, 0.6, 0.8);
  var q   = rot * p;
  var amp = 0.5; var f = freq; var sum = 0.0; var div = 0.0;
  for (var i = 0u; i < octaves; i += 1u) {
    sum += (perlin(q * f, seed + i * 0x9e3779b9u) * 0.5 + 0.5) * amp;
    div += amp;
    q = rot * q; f *= 2.0; amp *= roughness;
  }
  return sum / max(div, 0.00001);
}

fn ridge_fbm(p: vec2<f32>, freq: f32, roughness: f32, octaves: u32, seed: u32) -> f32 {
  let rot = mat2x2<f32>(0.8, -0.6, 0.6, 0.8);
  var q   = rot * p;
  var amp = 0.5; var f = freq; var sum = 0.0; var div = 0.0;
  for (var i = 0u; i < octaves; i += 1u) {
    let n     = perlin(q * f, seed + i * 0x85ebca6bu);
    var ridge = 1.0 - abs(n);
    ridge     = ridge * ridge;
    sum      += ridge * amp;
    div      += amp;
    q = rot * q; f *= 2.0; amp *= roughness;
  }
  return sum / max(div, 0.00001);
}

// ── Smoothed kinematic sampling (5×5 neighbourhood around JFA nearest point) ─
// Returns (approach_speed, boundary_type) smoothed from nearest boundary region.

fn sample_kinematic(nearest: vec2<f32>) -> vec2<f32> {
  let fx = clamp(i32(round(nearest.x)), 0, i32(params.width)  - 1);
  let fy = clamp(i32(round(nearest.y)), 0, i32(params.height) - 1);
  var sum_x     = 0.0;
  var sum_btype = 0.0;
  var cnt       = 0.0;
  for (var dy = -2; dy <= 2; dy += 1) {
    for (var dx = -2; dx <= 2; dx += 1) {
      let sx  = clamp(fx + dx, 0, i32(params.width)  - 1);
      let sy  = clamp(fy + dy, 0, i32(params.height) - 1);
      let k   = kinematic_data[u32(sy) * params.width + u32(sx)];
      if (k.w > 0.5) {   // only sample valid boundary pixels
        sum_x     += k.x;
        sum_btype += k.z;
        cnt       += 1.0;
      }
    }
  }
  if (cnt < 0.5) { return vec2<f32>(0.0, 0.0); }
  return vec2<f32>(sum_x / cnt, sum_btype / cnt);
}

// ── Main ─────────────────────────────────────────────────────────────────────

const LAND_THRESHOLD: f32   = 0.5;   // plate_type threshold (0=continental)
const OCEAN_ELEV_BASE: f32  = 0.04;
const CONT_ELEV_BASE: f32   = 0.28;

@compute @workgroup_size(256, 1, 1)
fn main(@builtin(global_invocation_id) gid: vec3<u32>) {
  let idx = gid.x;
  if (idx >= params.width * params.height) { return; }

  let x  = i32(idx % params.width);
  let y  = i32(idx / params.width);
  let p  = vec2<f32>(f32(x), f32(y));
  let uv = vec2<f32>(f32(x) * params.inv_width * 2.0,
                     f32(y) * params.inv_height);

  let is_continental = plate_type[idx] < 0.5;

  // ── Base elevation ──────────────────────────────────────────────────────────
  var base: f32;
  if (is_continental) {
    // Continental crust: flat interior with gentle craton swell
    let craton = fbm(uv * 3.0, 1.0, 0.55, 4u, params.seed ^ 0xb7e15162u);
    let swell  = (fbm(uv * 1.2, 1.0, 0.50, 3u, params.seed ^ 0x9b2d4e7fu) * 2.0 - 1.0) * 0.06;
    base = CONT_ELEV_BASE + (craton - 0.5) * 0.10 + swell;
  } else {
    // Oceanic crust: low and slightly varied
    let abyssal = fbm(uv * 4.0, 1.0, 0.50, 3u, params.seed ^ 0x4d2a7f3eu);
    base = OCEAN_ELEV_BASE + abyssal * 0.04;
  }

  // ── Boundary-driven elevation ───────────────────────────────────────────────
  var boundary_elev = 0.0;

  let nearest = jfa_nearest[idx];
  let has_boundary = nearest.x > -9999.0;

  if (has_boundary) {
    let kin_sample = sample_kinematic(nearest);
    let kin_x      = kin_sample.x;
    let btype      = kin_sample.y;  // 0=cont-cont, 1=mixed, 2=ocean-ocean

    // --- Boundary frame ---
    let bp_diff = p - nearest;
    let bp_len  = length(bp_diff);
    let across_px = select(vec2<f32>(1.0, 0.0), bp_diff / bp_len, bp_len > 0.5);
    let along_px  = vec2<f32>(-across_px.y, across_px.x);

    let inv_h     = params.inv_height;
    let across_uv = normalize(vec2<f32>(across_px.x * params.inv_width * 2.0,
                                        across_px.y * inv_h));
    let along_uv  = vec2<f32>(-across_uv.y, across_uv.x);

    // Anisotropic noise coordinates (14× stretch along boundary)
    let bn_along  = dot(uv * 14.0, along_uv);
    let bn_across = dot(uv * 14.0, across_uv);
    let aniso_uv  = along_uv * bn_along * 0.07 + across_uv * bn_across;

    // Distance from boundary (with warp for snaking)
    let dw_raw = vec2<f32>(
      perlin(uv * 3.5, params.seed ^ 0xa4093822u)
        + perlin(uv * 9.0, params.seed ^ 0x5f3759dfu) * 0.4,
      perlin(uv * 3.5 + vec2<f32>(3.1, -1.2), params.seed ^ 0x299f31d0u)
        + perlin(uv * 9.0 + vec2<f32>(1.7, -2.3), params.seed ^ 0xc0b18458u) * 0.4
    ) * (params.mountain_radius * 1.4);
    let dw_along = dot(dw_raw, along_px);
    let dw_across = dot(dw_raw, across_px);
    let dist_warp = along_px * dw_along + across_px * dw_across * 0.25;
    let bdist = length((p + dist_warp) - nearest);

    // Mountain gate: breaks continuous ranges into distinct segments
    let gap_a = perlin(nearest * params.inv_width * 1.8, params.seed ^ 0x3c6ef372u);
    let gap_b = perlin(nearest * params.inv_width * 0.6, params.seed ^ 0x9e3779b9u);
    let mountain_gate = smoothstep(-0.05, 0.40, gap_a * 0.55 + gap_b * 0.45);

    // Width modulation along boundary arc
    let arc_coord  = dot(nearest * params.inv_width, along_uv);
    let width_mod  = clamp(
      perlin(along_uv * arc_coord * 2.5, params.seed ^ 0x13198a2eu) * 0.65
      + perlin(along_uv * arc_coord * 8.0, params.seed ^ 0x27c0da8bu) * 0.40
      + 0.80,
      0.20, 1.60
    );
    let mod_radius = max(params.mountain_radius * width_mod, 1.0);

    let dist_norm = clamp(bdist / mod_radius, 0.0, 1.0);
    let falloff   = pow(smoothstep(1.0, 0.0, dist_norm), 1.5);

    // ── Convergent (positive approach_speed = compression) ──────────────────
    if (kin_x > 0.0 && btype < 1.5) {
      // Only cont-cont (0) or mixed (1) boundaries build mountains on land
      let land_here = is_continental;
      if (land_here) {
        let range_uv  = along_uv * bn_along * 0.06 + across_uv * bn_across * 0.7;
        let range_ridge = ridge_fbm(range_uv, 1.0, 0.58, 3u, params.seed ^ 0xf53a7c1eu);
        let crest_uv    = along_uv * bn_along * 0.18 + across_uv * bn_across * 0.5;
        let crest_ridge = ridge_fbm(crest_uv, 1.0, 0.55, 3u, params.seed ^ 0x7c3b9a4fu);
        let fine_ridge  = ridge_fbm(aniso_uv, 1.0, 0.55 + params.terrain_roughness * 0.35,
                                    4u, params.seed ^ 0x243f6a88u);

        boundary_elev = kin_x * mountain_gate * params.mountain_height * (
          pow(falloff, 0.7)                          * 0.30  // massif envelope
          + range_ridge * pow(falloff, 0.85)          * 0.30  // sub-ranges
          + crest_ridge * range_ridge * pow(falloff, 1.8) * 0.25 // ridgelines
          + fine_ridge  * pow(falloff, 2.5)           * 0.15  // peak detail
        );
      }
    }

    // ── Divergent (negative approach_speed = extension) ─────────────────────
    if (kin_x < 0.0) {
      let rift_noise = fbm(uv * 7.0, 1.0, 0.50, 2u, params.seed ^ 0x082efa98u);
      if (is_continental) {
        // Rift valley on land
        boundary_elev = kin_x * pow(falloff, 0.6) * 0.14
                        * (0.7 + rift_noise * 0.3) * params.mountain_height;
      } else {
        // Mid-ocean ridge: slight rise on ocean floor
        boundary_elev = abs(kin_x) * falloff * 0.06
                        * (0.6 + rift_noise * 0.4);
      }
    }
  }

  let final_elev = clamp(base + boundary_elev, 0.0, 1.0);
  elevation[idx] = final_elev;
}
