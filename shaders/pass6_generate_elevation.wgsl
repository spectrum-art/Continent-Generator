struct TopographyParams {
  width: u32,
  height: u32,
  seed: u32,
  _pad0: u32,
  mountain_radius: f32,
  mountain_height: f32,
  terrain_roughness: f32,
  terrain_frequency: f32,
  fossil_scale: f32,
  inv_width: f32,
  _pad1: f32,
  _pad2: f32,
}

const OCEAN_THRESHOLD: f32 = 0.1;
const PLUME_SCALE: f32 = 0.30;

@group(0) @binding(0) var<storage, read> kinematic_data: array<vec4<f32>>;
@group(0) @binding(1) var<storage, read> jfa_nearest: array<vec2<f32>>;
@group(0) @binding(2) var<storage, read> final_land_mask: array<f32>;
@group(0) @binding(3) var<storage, read> plume_mask: array<f32>;
@group(0) @binding(4) var<storage, read_write> elevation: array<f32>;
@group(0) @binding(5) var<uniform> params: TopographyParams;

fn hash_u32(x: u32) -> u32 {
  var h = x;
  h = h ^ (h >> 16u);
  h = h * 0x7feb352du;
  h = h ^ (h >> 15u);
  h = h * 0x846ca68bu;
  h = h ^ (h >> 16u);
  return h;
}

fn hash_to_unit(x: u32) -> f32 {
  return f32(hash_u32(x)) * (1.0 / 4294967295.0);
}

fn seeded_hash_2d(p: vec2<u32>, seed: u32) -> u32 {
  var h = p.x * 374761393u + p.y * 668265263u;
  h = h ^ (seed * 2246822519u + 3266489917u);
  return hash_u32(h);
}

fn fade2(t: vec2<f32>) -> vec2<f32> {
  return t * t * t * (t * (t * 6.0 - 15.0) + 10.0);
}

fn gradient_from_hash(h: u32) -> vec2<f32> {
  switch (h & 15u) {
    case 0u: { return vec2<f32>(1.0, 0.0); }
    case 1u: { return vec2<f32>(0.9238795, 0.3826834); }
    case 2u: { return vec2<f32>(0.70710677, 0.70710677); }
    case 3u: { return vec2<f32>(0.3826834, 0.9238795); }
    case 4u: { return vec2<f32>(0.0, 1.0); }
    case 5u: { return vec2<f32>(-0.3826834, 0.9238795); }
    case 6u: { return vec2<f32>(-0.70710677, 0.70710677); }
    case 7u: { return vec2<f32>(-0.9238795, 0.3826834); }
    case 8u: { return vec2<f32>(-1.0, 0.0); }
    case 9u: { return vec2<f32>(-0.9238795, -0.3826834); }
    case 10u: { return vec2<f32>(-0.70710677, -0.70710677); }
    case 11u: { return vec2<f32>(-0.3826834, -0.9238795); }
    case 12u: { return vec2<f32>(0.0, -1.0); }
    case 13u: { return vec2<f32>(0.3826834, -0.9238795); }
    case 14u: { return vec2<f32>(0.70710677, -0.70710677); }
    default: { return vec2<f32>(0.9238795, -0.3826834); }
  }
}

// Standard gradient noise in [-1, 1].
fn perlin_noise_2d(p: vec2<f32>, seed: u32) -> f32 {
  let cell = vec2<i32>(floor(p));
  let frac = fract(p);
  let u = fade2(frac);

  let c00 = vec2<u32>(u32(cell.x), u32(cell.y));
  let c10 = vec2<u32>(u32(cell.x + 1), u32(cell.y));
  let c01 = vec2<u32>(u32(cell.x), u32(cell.y + 1));
  let c11 = vec2<u32>(u32(cell.x + 1), u32(cell.y + 1));

  let g00 = gradient_from_hash(seeded_hash_2d(c00, seed));
  let g10 = gradient_from_hash(seeded_hash_2d(c10, seed));
  let g01 = gradient_from_hash(seeded_hash_2d(c01, seed));
  let g11 = gradient_from_hash(seeded_hash_2d(c11, seed));

  let d00 = frac - vec2<f32>(0.0, 0.0);
  let d10 = frac - vec2<f32>(1.0, 0.0);
  let d01 = frac - vec2<f32>(0.0, 1.0);
  let d11 = frac - vec2<f32>(1.0, 1.0);

  let n00 = dot(g00, d00);
  let n10 = dot(g10, d10);
  let n01 = dot(g01, d01);
  let n11 = dot(g11, d11);

  let nx0 = mix(n00, n10, u.x);
  let nx1 = mix(n01, n11, u.x);
  return mix(nx0, nx1, u.y);
}

fn snoise(p: vec2<f32>, seed: u32) -> f32 {
  return perlin_noise_2d(p, seed);
}

// Standard FBM normalized to [0, 1].
fn fbm(
  p: vec2<f32>,
  base_frequency: f32,
  roughness: f32,
  octaves: u32,
  seed: u32
) -> f32 {
  let rot = mat2x2<f32>(0.8, -0.6, 0.6, 0.8);
  var p_octave = rot * p + vec2<f32>(12.3, 45.6);
  var amplitude = 0.5;
  var frequency = base_frequency;
  var total = 0.0;
  var amplitude_sum = 0.0;

  for (var octave: u32 = 0u; octave < octaves; octave = octave + 1u) {
    let octave_noise = perlin_noise_2d(p_octave * frequency, seed + octave * 0x9e3779b9u) * 0.5 + 0.5;
    total = total + octave_noise * amplitude;
    amplitude_sum = amplitude_sum + amplitude;
    p_octave = rot * p_octave + vec2<f32>(12.3, 45.6);
    frequency = frequency * 2.0;
    amplitude = amplitude * roughness;
  }

  return total / max(amplitude_sum, 0.00001);
}

// Swiss-style ridge multifractal in [0, 1].
fn ridge_multifractal(
  p: vec2<f32>,
  base_frequency: f32,
  roughness: f32,
  octaves: u32,
  seed: u32
) -> f32 {
  let rot = mat2x2<f32>(0.8, -0.6, 0.6, 0.8);
  var p_octave = rot * p + vec2<f32>(12.3, 45.6);
  var amplitude = 0.5;
  var frequency = base_frequency;
  var total = 0.0;
  var amplitude_sum = 0.0;

  for (var octave: u32 = 0u; octave < octaves; octave = octave + 1u) {
    let n = perlin_noise_2d(p_octave * frequency, seed + octave * 0x85ebca6bu);
    var ridge = 1.0 - abs(n);
    ridge = ridge * ridge;
    total = total + ridge * amplitude;
    amplitude_sum = amplitude_sum + amplitude;
    p_octave = rot * p_octave + vec2<f32>(12.3, 45.6);
    frequency = frequency * 2.0;
    amplitude = amplitude * roughness;
  }

  return total / max(amplitude_sum, 0.00001);
}

@compute @workgroup_size(256, 1, 1)
fn main(@builtin(global_invocation_id) gid: vec3<u32>) {
  let flat_index = gid.x;
  let cell_count = params.width * params.height;
  if (flat_index >= cell_count) {
    return;
  }

  let mask = final_land_mask[flat_index];
  if (mask < OCEAN_THRESHOLD) {
    elevation[flat_index] = 0.0;
    return;
  }

  let x = i32(flat_index % params.width);
  let y = i32(flat_index / params.width);
  let p = vec2<f32>(f32(x), f32(y));
  let sample_uv = vec2<f32>(
    f32(x) * (1.0 / f32(params.width)) * 2.0,
    f32(y) * (1.0 / f32(params.height))
  );

  let base_noise_uv = sample_uv * params.terrain_frequency * 50.0;
  let uv_warp = vec2<f32>(
    fbm(base_noise_uv * 0.03, 1.0, 0.55, 3u, params.seed ^ 0xd2511f53u),
    fbm(base_noise_uv * 0.03 + vec2<f32>(7.4, 2.9), 1.0, 0.55, 3u, params.seed ^ 0xcd9e8d57u)
  ) * 6.0 - 3.0;
  let lowland_noise = fbm(
    sample_uv * (params.terrain_frequency * 0.35),
    1.0,
    0.6,
    4u,
    params.seed ^ 0xb7e15162u
  );
  let interior_swell = fbm(
    sample_uv * (params.terrain_frequency * 0.12),
    1.0, 0.50, 3u, params.seed ^ 0x9b2d4e7fu
  ) * 0.14 - 0.05;
  let base_noise_component = (lowland_noise - 0.5) * 0.10 + interior_swell;

  // Continental-scale tilt and basin/arch structure (issue 4: interior flatness)
  let tilt_uv = sample_uv * (params.terrain_frequency * 0.03);
  let regional_tilt = perlin_noise_2d(tilt_uv, params.seed ^ 0x4d2a7f3eu) * 0.07;
  let basin_uv = sample_uv * (params.terrain_frequency * 0.07);
  let basin_arch = (fbm(basin_uv, 1.0, 0.50, 2u, params.seed ^ 0x6c3e9b1fu) * 2.0 - 1.0) * 0.05;

  var active_elev = 0.0;
  var fossil_elev = 0.0;
  var craton_feather = 1.0;

  let nearest = jfa_nearest[flat_index];
  if (nearest.x >= 0.0 && nearest.y >= 0.0) {
    var smoothed_kin_x = 0.0;
    var smoothed_pos = vec2<f32>(0.0, 0.0);
    var valid_samples = 0.0;
    let fx = clamp(i32(round(nearest.x)), 0, i32(params.width) - 1);
    let fy = clamp(i32(round(nearest.y)), 0, i32(params.height) - 1);
    for (var dy = -2; dy <= 2; dy = dy + 1) {
      for (var dx = -2; dx <= 2; dx = dx + 1) {
        let sx = clamp(fx + dx, 0, i32(params.width) - 1);
        let sy = clamp(fy + dy, 0, i32(params.height) - 1);
        let s_idx = u32(sy) * params.width + u32(sx);
        let k_val = kinematic_data[s_idx].x;
        if (abs(k_val) > 0.001) {
          smoothed_kin_x = smoothed_kin_x + k_val;
          smoothed_pos = smoothed_pos + vec2<f32>(f32(sx), f32(sy));
          valid_samples = valid_samples + 1.0;
        }
      }
    }
    var final_nearest = nearest;
    if (valid_samples > 0.0) {
      final_nearest = smoothed_pos / valid_samples;
    }
    let final_kin_x = smoothed_kin_x / max(valid_samples, 1.0);

    // --- Boundary frame ---
    let bp_diff = p - final_nearest;
    let bp_len = length(bp_diff);
    let across_px = select(vec2<f32>(1.0, 0.0), bp_diff / bp_len, bp_len > 0.5);
    let along_px = vec2<f32>(-across_px.y, across_px.x);
    // Convert direction to noise-UV space (x is 2/width-scaled, y is 1/height-scaled)
    let inv_h = 1.0 / f32(params.height);
    let across_uv = normalize(vec2<f32>(across_px.x * params.inv_width * 2.0,
                                        across_px.y * inv_h));
    let along_uv = vec2<f32>(-across_uv.y, across_uv.x);

    // --- Anisotropic ridge noise: ~14× stretch along boundary (issue 2: directionality) ---
    let bn_along = dot(base_noise_uv, along_uv);
    let bn_across = dot(base_noise_uv, across_uv);
    let warp_along  = dot(uv_warp, along_uv);
    let warp_across = dot(uv_warp, across_uv);
    let aniso_warp  = along_uv * warp_along * 0.07 + across_uv * warp_across;
    let aniso_noise_uv = along_uv * bn_along * 0.07 + across_uv * bn_across + aniso_warp;
    // Fine peak detail (highest frequency, strongly aligned)
    let ridge_noise = ridge_multifractal(
      aniso_noise_uv, 1.0,
      0.55 + params.terrain_roughness * 0.35,
      4u, params.seed ^ 0x243f6a88u
    );
    // Range-scale ridges (~30–80 cycles): sub-ranges within the orogen (issue 1: hierarchy)
    let range_uv = along_uv * bn_along * 0.06 + across_uv * bn_across * 0.7 + aniso_warp * 0.3;
    let range_ridge = ridge_multifractal(range_uv, 1.0, 0.58, 3u, params.seed ^ 0xf53a7c1eu);
    // Ridgeline-scale (~100–250 cycles): individual crests within each arm
    let crest_uv = along_uv * bn_along * 0.18 + across_uv * bn_across * 0.5 + aniso_warp * 0.5;
    let crest_ridge = ridge_multifractal(crest_uv, 1.0, 0.55, 3u, params.seed ^ 0x7c3b9a4fu);

    // --- dist_warp: full along-boundary snaking, 25% across ---
    let dist_warp_raw = vec2<f32>(
      snoise(sample_uv * 3.5, params.seed ^ 0xa4093822u)
        + snoise(sample_uv * 9.0, params.seed ^ 0x5f3759dfu) * 0.4,
      snoise(sample_uv * 3.5 + vec2<f32>(3.1, -1.2), params.seed ^ 0x299f31d0u)
        + snoise(sample_uv * 9.0 + vec2<f32>(1.7, -2.3), params.seed ^ 0xc0b18458u) * 0.4
    ) * (params.mountain_radius * 1.4);
    let dw_along = dot(dist_warp_raw, along_px);
    let dw_across = dot(dist_warp_raw, across_px);
    let dist_warp = along_px * dw_along + across_px * dw_across * 0.25;
    let active_distance = length((p + dist_warp) - final_nearest);

    // --- long_mod: smooth variation along 1D boundary arc ---
    let boundary_arc = dot(final_nearest * params.inv_width, along_uv);
    let arc_uv = along_uv * boundary_arc;
    let width_low  = snoise(arc_uv * 2.5, params.seed ^ 0x13198a2eu);
    let width_high = snoise(arc_uv * 8.0, params.seed ^ 0x27c0da8bu);
    let long_mod = clamp(width_low * 0.65 + width_high * 0.40 + 0.80, 0.15, 1.65);
    let modulated_radius = max(params.mountain_radius * long_mod, 1.0);

    // --- gap gate (unchanged from 5.35) ---
    let gap_a = snoise(final_nearest * params.inv_width * 1.8, params.seed ^ 0x3c6ef372u);
    let gap_b = snoise(final_nearest * params.inv_width * 0.6, params.seed ^ 0x9e3779b9u);
    let mountain_gate = smoothstep(-0.05, 0.40, gap_a * 0.55 + gap_b * 0.45);

    let active_dist_normalized = clamp(active_distance / modulated_radius, 0.0, 1.0);
    let linear_falloff = smoothstep(1.0, 0.0, active_dist_normalized);
    let falloff = pow(linear_falloff, 1.5);
    craton_feather = mix(0.65, 1.0, falloff);

    if (final_kin_x > 0.0) {
      // Hierarchical composition: massif → sub-ranges → ridgelines → fine peak detail
      // (issues 1+2: elevation hierarchy and directionality)
      let base_shape = pow(falloff, 0.7);
      active_elev = final_kin_x * mountain_gate * params.mountain_height * (
        base_shape                                        * 0.30   // massif envelope
        + range_ridge  * pow(falloff, 0.85)               * 0.30   // sub-range arms
        + crest_ridge  * range_ridge * pow(falloff, 1.8)  * 0.25   // ridgelines gated by arms
        + ridge_noise  * pow(falloff, 2.5)                * 0.15   // fine peak detail
      );
    } else if (final_kin_x < 0.0) {
      // Smooth rift valley — low frequency, wide gentle depression (issue 3: fault artifacts)
      let rift_uv = sample_uv * (params.terrain_frequency * 0.8);
      let rift_fbm = fbm(rift_uv, 1.0, 0.50, 2u, params.seed ^ 0x082efa98u);
      active_elev = final_kin_x * pow(falloff, 0.6) * 0.14
                    * (0.7 + rift_fbm * 0.3) * params.mountain_height;
    }

    let macro_dist = clamp(active_distance / (f32(params.width) * 0.5), 0.0, 1.0);
    let react_mult = mix(1.0, 0.3, macro_dist);
    let ancient_uv = sample_uv * (params.terrain_frequency * 0.55) + vec2<f32>(14.2, -5.8);
    let raw_ancient = ridge_multifractal(ancient_uv, 1.0, 0.68, 5u, params.seed ^ 0x8aed2a6bu);
    let ancient_zone = snoise(
      sample_uv * (params.terrain_frequency * 0.10) + vec2<f32>(3.7, -1.4),
      params.seed ^ 0x4b7e1f3au
    ) * 0.5 + 0.5;
    let zone_gate     = smoothstep(0.30, 0.75, ancient_zone);
    let ancient_crest = clamp((raw_ancient - 0.48) * 2.2, 0.0, 1.0);
    fossil_elev = ancient_crest * zone_gate * react_mult * params.fossil_scale * params.mountain_height;
  }

  let base_continent_height = mix(0.08, 0.22, mask) + base_noise_component * craton_feather
                              + regional_tilt + basin_arch;
  let plume = plume_mask[flat_index];
  let plume_perturb = snoise(
    sample_uv * (params.terrain_frequency * 3.0), params.seed ^ 0x14c93a7eu
  ) * 0.10;
  let plume_curve = smoothstep(0.0, 1.0, plume + plume_perturb);
  let plume_noise = fbm(
    sample_uv * (params.terrain_frequency * 0.22) + vec2<f32>(3.1, 7.4),
    1.0, 0.65, 4u, params.seed ^ 0x6a09e667u
  );
  let plume_detail = fbm(
    sample_uv * (params.terrain_frequency * 1.4) + vec2<f32>(5.2, -3.8),
    1.0, 0.72, 4u, params.seed ^ 0x4a2c3d1eu
  );
  let plume_elev = plume_curve * (0.40 + 0.35 * plume_noise + 0.25 * plume_detail)
                   * PLUME_SCALE * params.mountain_height;

  let final_elevation = base_continent_height + active_elev + fossil_elev + plume_elev;
  elevation[flat_index] = clamp(final_elevation, 0.0, 1.0);
}
