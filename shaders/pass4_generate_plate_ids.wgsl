struct PlateParams {
  width: u32,
  height: u32,
  plate_count: u32,
  seed: u32,
  inv_width: f32,
  inv_height: f32,
  plate_warp_amplitude: f32,
  plate_warp_roughness: f32,
  plate_warp_frequency: f32,
  _pad0: f32,
  _pad1: f32,
  _pad2: f32,
}

@group(0) @binding(0) var<storage, read_write> plate_id: array<u32>;
@group(0) @binding(1) var<uniform> params: PlateParams;

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

fn hash_to_unit(x: u32) -> f32 {
  return f32(hash_u32(x)) * (1.0 / 4294967295.0);
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

  let g00 = gradient_from_hash(seeded_hash_2d(c00, params.seed ^ 0xa341316cu));
  let g10 = gradient_from_hash(seeded_hash_2d(c10, params.seed ^ 0xc8013ea4u));
  let g01 = gradient_from_hash(seeded_hash_2d(c01, params.seed ^ 0xad90777du));
  let g11 = gradient_from_hash(seeded_hash_2d(c11, params.seed ^ 0x7e95761eu));

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
  let rot = mat2x2<f32>(0.8, -0.6, 0.6, 0.8);
  var p_octave = p;
  var amplitude = 0.5;
  var frequency = params.plate_warp_frequency;
  var total = 0.0;
  var amplitude_sum = 0.0;

  for (var octave: u32 = 0u; octave < 6u; octave = octave + 1u) {
    let shifted = p_octave * frequency;
    let octave_noise = perlin_noise_2d(shifted) * 0.5 + 0.5;
    total = total + octave_noise * amplitude;
    amplitude_sum = amplitude_sum + amplitude;
    p_octave = rot * p_octave + vec2<f32>(12.3, 45.6);
    frequency = frequency * 2.0;
    amplitude = amplitude * params.plate_warp_roughness;
  }

  return total / max(amplitude_sum, 0.00001);
}

fn plate_seed_point(id: u32) -> vec2<f32> {
  let base = params.seed ^ (id * 747796405u + 2891336453u);
  let sx = hash_to_unit(base ^ 0x9e3779b9u) * 2.0;
  let sy = hash_to_unit(base ^ 0x85ebca6bu);
  return vec2<f32>(sx, sy);
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
  let safe_warp = params.plate_warp_amplitude * 0.1;

  let warp_x = (fbm(sample_uv + vec2<f32>(13.7, 1.9)) * 2.0 - 1.0) * safe_warp;
  let warp_y = (fbm(sample_uv - vec2<f32>(2.3, 11.1)) * 2.0 - 1.0) * safe_warp;
  let warped_uv = sample_uv + vec2<f32>(warp_x, warp_y);

  let plate_count = max(params.plate_count, 1u);
  var best_id: u32 = 0u;
  var best_dist2: f32 = 1e20;
  for (var plate: u32 = 0u; plate < plate_count; plate = plate + 1u) {
    let plate_seed = plate_seed_point(plate);
    let delta = warped_uv - plate_seed;
    let dist2 = dot(delta, delta);
    if (dist2 < best_dist2) {
      best_dist2 = dist2;
      best_id = plate;
    }
  }

  plate_id[flat_index] = best_id;
}
