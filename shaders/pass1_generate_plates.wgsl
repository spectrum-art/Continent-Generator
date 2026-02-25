// Pass 1: Generate plate assignment, type, and velocity per pixel.
// Domain-warped weighted Voronoi → plate_id, plate_type, plate_velocity.
// Plate types: 0.0 = continental, 1.0 = oceanic.

struct PlateParams {
  width:          u32,
  height:         u32,
  plate_count:    u32,
  seed:           u32,
  inv_width:      f32,
  inv_height:     f32,
  warp_roughness: f32,
  _pad:           f32,
}

struct Plate {
  pos:        vec2<f32>,   // x ∈ [0,2], y ∈ [0,1]
  weight:     f32,
  plate_type: f32,         // 0.0 = continental, 1.0 = oceanic
  velocity:   vec2<f32>,
  _pad:       vec2<f32>,
}

@group(0) @binding(0) var<storage, read>       plates:         array<Plate>;
@group(0) @binding(1) var<storage, read_write> plate_id:       array<u32>;
@group(0) @binding(2) var<storage, read_write> plate_type:     array<f32>;
@group(0) @binding(3) var<storage, read_write> plate_velocity: array<vec2<f32>>;
@group(0) @binding(4) var<uniform>             params:         PlateParams;

// ── Noise ────────────────────────────────────────────────────────────────────

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
  let cell = vec2<i32>(floor(p));
  let frac = fract(p);
  let u    = fade2(frac);
  let c00  = vec2<u32>(u32(cell.x),     u32(cell.y));
  let c10  = vec2<u32>(u32(cell.x + 1), u32(cell.y));
  let c01  = vec2<u32>(u32(cell.x),     u32(cell.y + 1));
  let c11  = vec2<u32>(u32(cell.x + 1), u32(cell.y + 1));
  let g00  = gradient_from_hash(seeded_hash_2d(c00, seed ^ 0x9e3779b9u));
  let g10  = gradient_from_hash(seeded_hash_2d(c10, seed ^ 0x85ebca6bu));
  let g01  = gradient_from_hash(seeded_hash_2d(c01, seed ^ 0xc2b2ae35u));
  let g11  = gradient_from_hash(seeded_hash_2d(c11, seed ^ 0x27d4eb2fu));
  let n00  = dot(g00, frac - vec2<f32>(0.0, 0.0));
  let n10  = dot(g10, frac - vec2<f32>(1.0, 0.0));
  let n01  = dot(g01, frac - vec2<f32>(0.0, 1.0));
  let n11  = dot(g11, frac - vec2<f32>(1.0, 1.0));
  let nx0  = mix(n00, n10, u.x);
  let nx1  = mix(n01, n11, u.x);
  return mix(nx0, nx1, u.y);
}

fn fbm(p: vec2<f32>, freq: f32, roughness: f32, octaves: u32, seed: u32) -> f32 {
  let rot = mat2x2<f32>(0.8, -0.6, 0.6, 0.8);
  var q   = rot * p;
  var amp = 0.5;
  var f   = freq;
  var sum = 0.0;
  var div = 0.0;
  for (var i = 0u; i < octaves; i++) {
    sum += (perlin(q * f, seed + i * 0x9e3779b9u) * 0.5 + 0.5) * amp;
    div += amp;
    q    = rot * q;
    f   *= 2.0;
    amp *= roughness;
  }
  return sum / max(div, 0.00001);
}

// ── Compute ──────────────────────────────────────────────────────────────────

@compute @workgroup_size(256, 1, 1)
fn main(@builtin(global_invocation_id) gid: vec3<u32>) {
  let idx = gid.x;
  if (idx >= params.width * params.height) { return; }

  let x = f32(idx % params.width);
  let y = f32(idx / params.width);
  let uv = vec2<f32>(x * params.inv_width * 2.0, y * params.inv_height);

  // Domain warp — curves plate boundaries into organic shapes
  let warp_x = (fbm(uv + vec2<f32>(17.3, -9.1), 0.12, params.warp_roughness, 4u,
                    params.seed ^ 0x243f6a88u) * 2.0 - 1.0) * 0.22;
  let warp_y = (fbm(uv - vec2<f32>(8.4, 21.2),  0.12, params.warp_roughness, 4u,
                    params.seed ^ 0x6a09e667u) * 2.0 - 1.0) * 0.22;
  // Finer warp for local boundary detail
  let fine_x = (fbm(uv + vec2<f32>(63.7, 11.4), 0.55, params.warp_roughness, 3u,
                    params.seed ^ 0xb7e15162u) * 2.0 - 1.0) * 0.05;
  let fine_y = (fbm(uv - vec2<f32>(19.2, 37.8), 0.55, params.warp_roughness, 3u,
                    params.seed ^ 0x8aed2a6bu) * 2.0 - 1.0) * 0.05;

  let warped = uv + vec2<f32>(warp_x + fine_x, warp_y + fine_y);

  // Weighted Voronoi: find nearest plate by score = dist² − weight²
  var best_id    = 0u;
  var best_score = 1e30;
  let count = min(params.plate_count, 24u);

  for (var i = 0u; i < count; i++) {
    let p     = plates[i];
    let diff  = warped - p.pos;
    let score = dot(diff, diff) - p.weight * p.weight;
    if (score < best_score) {
      best_score = score;
      best_id    = i;
    }
  }

  plate_id[idx]       = best_id;
  plate_type[idx]     = plates[best_id].plate_type;
  plate_velocity[idx] = plates[best_id].velocity;
}
