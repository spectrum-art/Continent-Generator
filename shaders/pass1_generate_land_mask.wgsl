struct GenerateParams {
  width: u32,
  height: u32,
  _pad0: u32,
  seed: u32,
  inv_width: f32,
  inv_height: f32,
  fbm_base_frequency: f32,
  land_threshold: f32,
  falloff_strength: f32,
  noise_amplitude: f32,
  edge_warp: f32,
  _pad1: f32,
}

@group(0) @binding(0) var<storage, read_write> land_mask: array<f32>;
@group(0) @binding(1) var<uniform> params: GenerateParams;

fn hash_u32(x: u32) -> u32 {
  var h = x;
  h = h ^ (h >> 16u);
  h = h * 0x7feb352du;
  h = h ^ (h >> 15u);
  h = h * 0x846ca68bu;
  h = h ^ (h >> 16u);
  return h;
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
  switch (h & 7u) {
    case 0u: { return vec2<f32>(1.0, 0.0); }
    case 1u: { return vec2<f32>(-1.0, 0.0); }
    case 2u: { return vec2<f32>(0.0, 1.0); }
    case 3u: { return vec2<f32>(0.0, -1.0); }
    case 4u: { return vec2<f32>(0.70710677, 0.70710677); }
    case 5u: { return vec2<f32>(-0.70710677, 0.70710677); }
    case 6u: { return vec2<f32>(0.70710677, -0.70710677); }
    default: { return vec2<f32>(-0.70710677, -0.70710677); }
  }
}

fn perlin_noise_2d(p: vec2<f32>) -> f32 {
  let cell = vec2<i32>(floor(p));
  let frac = fract(p);
  let u = fade2(frac);

  let c00 = vec2<u32>(u32(cell.x), u32(cell.y));
  let c10 = vec2<u32>(u32(cell.x + 1), u32(cell.y));
  let c01 = vec2<u32>(u32(cell.x), u32(cell.y + 1));
  let c11 = vec2<u32>(u32(cell.x + 1), u32(cell.y + 1));

  let g00 = gradient_from_hash(seeded_hash_2d(c00, params.seed));
  let g10 = gradient_from_hash(seeded_hash_2d(c10, params.seed));
  let g01 = gradient_from_hash(seeded_hash_2d(c01, params.seed));
  let g11 = gradient_from_hash(seeded_hash_2d(c11, params.seed));

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

fn fbm(p: vec2<f32>) -> f32 {
  var amplitude = 0.5;
  var frequency = params.fbm_base_frequency;
  var total = 0.0;
  var amplitude_sum = 0.0;

  for (var octave: u32 = 0u; octave < 3u; octave = octave + 1u) {
    let octave_noise = perlin_noise_2d(p * frequency) * 0.5 + 0.5;
    total = total + octave_noise * amplitude;
    amplitude_sum = amplitude_sum + amplitude;
    frequency = frequency * 2.0;
    amplitude = amplitude * 0.5;
  }

  return total / max(amplitude_sum, 0.00001);
}

@compute @workgroup_size(256, 1, 1)
fn main(@builtin(global_invocation_id) gid: vec3<u32>) {
  let flat_index: u32 = gid.x;
  let cell_count: u32 = params.width * params.height;

  if (flat_index >= cell_count) {
    return;
  }

  let x: f32 = f32(flat_index % params.width);
  let y: f32 = f32(flat_index / params.width);
  let u_norm: f32 = x * params.inv_width;
  let v_norm: f32 = y * params.inv_height;

  let sample_uv = vec2<f32>(u_norm * 2.0, v_norm);
  let warp_x = (fbm(sample_uv + vec2<f32>(5.3, 2.9)) * 2.0 - 1.0) * params.edge_warp;
  let warp_y = (fbm(sample_uv - vec2<f32>(1.1, 4.4)) * 2.0 - 1.0) * params.edge_warp;
  let dx = u_norm - 0.5;
  let dy = v_norm - 0.5;
  let physical_dist = length(vec2<f32>(dx, dy));
  let warped_dist = length(vec2<f32>(dx + warp_x, dy + warp_y));
  let outward_dampener = smoothstep(0.38, 0.50, physical_dist);
  var final_dist = warped_dist;
  if (warped_dist < physical_dist) {
    final_dist = mix(warped_dist, physical_dist, outward_dampener);
  }

  let base_shape = 1.0 - (final_dist * params.falloff_strength);
  let raw_noise = fbm(sample_uv) * params.noise_amplitude;
  var final_noise = raw_noise;
  if (raw_noise > 0.0) {
    final_noise = mix(raw_noise, 0.0, outward_dampener);
  }
  let potential = base_shape + final_noise;
  let is_land = potential > params.land_threshold;

  land_mask[flat_index] = select(0.0, 1.0, is_land);
}
