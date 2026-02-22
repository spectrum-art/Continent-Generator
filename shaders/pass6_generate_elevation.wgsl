struct TopographyParams {
  width: u32,
  height: u32,
  seed: u32,
  _pad0: u32,
  mountain_radius: f32,
  mountain_height: f32,
  terrain_roughness: f32,
  terrain_frequency: f32,
}

@group(0) @binding(0) var<storage, read> final_land_mask: array<f32>;
@group(0) @binding(1) var<storage, read> fault_stress: array<f32>;
@group(0) @binding(2) var<storage, read_write> elevation: array<f32>;
@group(0) @binding(3) var<uniform> params: TopographyParams;

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

  let g00 = gradient_from_hash(seeded_hash_2d(c00, params.seed ^ 0x9e3779b9u));
  let g10 = gradient_from_hash(seeded_hash_2d(c10, params.seed ^ 0x85ebca6bu));
  let g01 = gradient_from_hash(seeded_hash_2d(c01, params.seed ^ 0xc2b2ae35u));
  let g11 = gradient_from_hash(seeded_hash_2d(c11, params.seed ^ 0x27d4eb2fu));

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
  var frequency = 1.0;
  var total = 0.0;
  var amplitude_sum = 0.0;

  for (var octave: u32 = 0u; octave < 4u; octave = octave + 1u) {
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
  let flat_index = gid.x;
  let cell_count = params.width * params.height;
  if (flat_index >= cell_count) {
    return;
  }

  if (final_land_mask[flat_index] < 0.5) {
    elevation[flat_index] = 0.0;
    return;
  }

  let x = i32(flat_index % params.width);
  let y = i32(flat_index / params.width);
  let u_norm = f32(x) / f32(params.width);
  let v_norm = f32(y) / f32(params.height);
  let sample_uv = vec2<f32>(u_norm * 2.0, v_norm);

  let base_noise = fbm(sample_uv * params.terrain_frequency);
  var current_elevation = 0.15 + (base_noise * 0.1);
  let radius = max(params.mountain_radius, 1.0);
  let radius_i = i32(ceil(radius));
  let radius2 = radius * radius;
  var min_dist = radius;
  var weighted_stress = 0.0;
  var total_weight = 0.0;

  let min_x = max(0, x - radius_i);
  let max_x = min(i32(params.width) - 1, x + radius_i);
  let min_y = max(0, y - radius_i);
  let max_y = min(i32(params.height) - 1, y + radius_i);

  for (var ny = min_y; ny <= max_y; ny = ny + 1) {
    for (var nx = min_x; nx <= max_x; nx = nx + 1) {
      let n_index = u32(ny) * params.width + u32(nx);
      let stress = fault_stress[n_index];
      if (abs(stress) <= 0.000001) {
        continue;
      }

      let dx = f32(nx - x);
      let dy = f32(ny - y);
      let dist2 = dx * dx + dy * dy;
      if (dist2 > radius2) {
        continue;
      }

      let distance = sqrt(dist2);
      if (distance < min_dist) {
        min_dist = distance;
      }

      let weight = 1.0 / (dist2 + 1.0);
      weighted_stress = weighted_stress + stress * weight;
      total_weight = total_weight + weight;
    }
  }

  if (total_weight > 0.0) {
    let avg_stress = weighted_stress / total_weight;
    let struct_noise = fbm(sample_uv * params.terrain_frequency) * 2.0 - 1.0;
    let warped_dist = min_dist + (struct_noise * params.terrain_roughness * (radius * 0.5));
    let falloff = max(1.0 - (warped_dist / radius), 0.0);
    let ridge = smoothstep(0.2, 1.0, falloff);
    current_elevation = current_elevation + avg_stress * ridge * params.mountain_height;
  }

  elevation[flat_index] = clamp(current_elevation, 0.0, 1.0);
}
