struct ComputeParams {
  width: f32,
  height: f32,
  inv_width: f32,
  inv_height: f32,
  fbm_base_frequency_norm: f32,
  land_threshold_norm: f32,
  margin_size: f32,
  _pad0: f32,
  seed: u32,
  _pad1: u32,
  _pad2: u32,
  _pad3: u32,
}

@group(0) @binding(0) var<storage, read_write> land_mask: array<f32>;
@group(0) @binding(1) var<uniform> params: ComputeParams;

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
  var frequency = params.fbm_base_frequency_norm;
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

fn box_sdf(p: vec2<f32>, half_extent: vec2<f32>) -> f32 {
  let d = abs(p) - half_extent;
  let outside = length(max(d, vec2<f32>(0.0, 0.0)));
  let inside = min(max(d.x, d.y), 0.0);
  return outside + inside;
}

@compute @workgroup_size(256, 1, 1)
fn main(@builtin(global_invocation_id) gid: vec3<u32>) {
  let flat_index: u32 = gid.x;
  let width_u32: u32 = u32(params.width);
  let height_u32: u32 = u32(params.height);
  let cell_count: u32 = width_u32 * height_u32;

  if (flat_index >= cell_count) {
    return;
  }

  let x: f32 = f32(flat_index % width_u32);
  let y: f32 = f32(flat_index / width_u32);
  let u_norm: f32 = x * params.inv_width;
  let v_norm: f32 = y * params.inv_height;

  let sample_uv = vec2<f32>(u_norm * 2.0, v_norm);
  let aspect = params.width * params.inv_height;
  let margin = clamp(params.margin_size, 0.0, 0.45);
  let centered_aspect = vec2<f32>((u_norm - 0.5) * aspect, v_norm - 0.5);
  let inner_half_aspect = vec2<f32>(
    max(0.02, 0.5 * aspect - margin),
    max(0.02, 0.5 - margin)
  );
  let margin_sdf = box_sdf(centered_aspect, inner_half_aspect);
  let margin_penalty = max(0.0, margin_sdf) * 16.0;
  let base_potential = 0.5 + (fbm(sample_uv) - 0.5) * 0.35;
  let potential = base_potential - margin_penalty;
  let is_land = potential > params.land_threshold_norm;
  land_mask[flat_index] = select(0.0, 1.0, is_land);
}
